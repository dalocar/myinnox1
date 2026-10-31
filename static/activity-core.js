/* Activity (History tab) - pure logic, no DOM. Browser global `ActivityCore`,
   Node module.exports. See docs/plan-activity.md and docs/activity-impl-notes.md.
   Dates are plain "YYYY-MM-DD" strings (local calendar dates). All arithmetic
   goes through Date.UTC on y/m/d, so it is immune to DST and time zones; we
   never call toISOString() on a local date. */
(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.ActivityCore = api;
})(typeof self !== "undefined" ? self : this, function () {
  const VIEWS = ["day", "week", "month", "year"];

  // Fallback daily goals when the server has none (today has no row yet).
  const DEFAULT_TARGET = { targetConsume: 500, targetDuration: 1800 };

  // Letter grade: PROVISIONAL / UNCONFIRMED (no endpoint returns it). Fitted to
  // two observations: 10-27 (consume 81 %, duration 59 %) = S, 10-28 (79 %, 27 %) = B.
  // S: both ratios >= bothForS. B: consume ratio >= consumeForB. Otherwise none.
  const GRADE_THRESHOLDS = { bothForS: 0.5, consumeForB: 0.5 };

  // Fun equivalents: constants CALIBRATED against the official app's Year/Month views
  // (948 kcal = 3.2 fries servings = 1.2 hamburgers; 15666 kg = 8 cars = 0.0 Eiffel towers).
  // They are not public nutrition/weight figures. Eiffel Tower: ~10,100 t total mass.
  const EQUIV = { KCAL_PER_FRIES: 296, KCAL_PER_HAMBURGER: 790, KG_PER_CAR: 1958, KG_PER_EIFFEL: 10100000 };

  const BADGE_TYPES = {
    1: { key: "consume", unit: "kcal" },
    2: { key: "duration", unit: "min" },
    3: { key: "capacity", unit: "kg" },
  };

  const num = (v) => { const n = typeof v === "string" && v.trim() === "" ? NaN : Number(v); return Number.isFinite(n) ? n : null; };
  const nz = (v) => { const n = num(v); return n === null ? 0 : Math.max(0, n); };
  const pad = (n, w) => String(n).padStart(w || 2, "0");

  // ---- calendar helpers (strings in/out) ----
  function parse(d) {
    if (d instanceof Date) return Number.isNaN(d.getTime()) ? null : { y: d.getFullYear(), m: d.getMonth() + 1, d: d.getDate() };
    const m = /^(\d{4})[-/.]?(\d{2})[-/.]?(\d{2})/.exec(String(d == null ? "" : d).trim());
    if (!m) return null;
    const y = +m[1], mo = +m[2], da = +m[3];
    const t = new Date(Date.UTC(y, mo - 1, da));
    if (t.getUTCFullYear() !== y || t.getUTCMonth() !== mo - 1 || t.getUTCDate() !== da) return null;
    return { y, m: mo, d: da };
  }
  const iso = (y, m, d) => `${pad(y, 4)}-${pad(m)}-${pad(d)}`;
  const fromUTC = (t) => iso(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
  const utc = (p) => new Date(Date.UTC(p.y, p.m - 1, p.d));
  const daysInMonth = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();

  // Local calendar date of a Date as YYYY-MM-DD (not toISOString).
  function localISO(date) {
    const p = parse(date instanceof Date ? date : new Date());
    return iso(p.y, p.m, p.d);
  }
  function addDays(dateStr, n) {
    const p = parse(dateStr);
    if (!p) return null;
    const t = utc(p);
    t.setUTCDate(t.getUTCDate() + Math.trunc(n || 0));
    return fromUTC(t);
  }
  const dayOfWeek = (dateStr) => { const p = parse(dateStr); return p ? utc(p).getUTCDay() : null; }; // 0 = Sunday

  // ---- formatting / units ----
  // seconds -> "HH:MM:SS" (961 -> "00:16:01"). Bad input -> "00:00:00".
  function fmtDuration(sec) {
    const s = Math.floor(nz(sec));
    return `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
  }
  // seconds -> minutes, whole number by default (1062 -> 18); pass decimals for more
  const minutesFromSeconds = (sec, decimals) => {
    const k = Math.pow(10, decimals == null ? 0 : decimals);
    return Math.round((nz(sec) / 60) * k) / k;
  };
  // Localised number text for non-English UI (decimal comma, thousands separators). English and
  // non-browser callers (unit tests) keep the plain format the official app uses.
  const uiLang = () => (typeof LANG === "function" ? LANG() : "en");
  const loc = (v, dec, plain) => {
    const l = uiLang();
    return l === "en" ? plain : new Intl.NumberFormat(l, { minimumFractionDigits: dec, maximumFractionDigits: dec }).format(v);
  };
  const fmtKcal = (k) => loc(Math.round(nz(k)), 0, String(Math.round(nz(k))));
  // tenths of kg -> kg number (65720 -> 6572)
  const kgFromTenths = (t) => Math.round(nz(t)) / 10;
  // tenths of kg -> "6572.0"
  const fmtKg = (t) => loc(kgFromTenths(t), 1, kgFromTenths(t).toFixed(1));
  // Same, in the account unit (0 Metric / 1 Imperial; see units-core.js). Number text only, no symbol.
  const UC = typeof require === "function" && typeof module !== "undefined" ? require("./units-core.js") : (typeof self !== "undefined" ? self.UnitsCore : null);
  // Medal target caption in the account unit: Volume medals (key "capacity", target in plain kg) show whole
  // pounds when Imperial (5000 kg -> 11023 lb, as the official app does); everything else is unchanged.
  const badgeCaption = (b, unit) => (b && b.key === "capacity" && Number(unit) === 1
    ? { target: Math.round(nz(b.target) * (UC ? UC.LB_PER_KG : 2.20462)), unit: "lb" }
    : { target: b ? b.target : "", unit: b ? b.unit : "" });
  const weightFromTenths = (t, unit) => (UC ? UC.fromTenths(t, unit) : kgFromTenths(t));
  const fmtWeight = (t, unit) => loc(weightFromTenths(t, unit), 1, weightFromTenths(t, unit).toFixed(1));

  // ---- periods ----
  const fmtMD = (s) => { const p = parse(s); return `${pad(p.m)}.${pad(p.d)}`; };
  // periodRange(view, anchor) -> {view, anchor, start, end, days:[iso], months:[yyyymm]|null, label, ariaLabel, key}
  // week label is MM.DD-MM.DD like the official app (12.27-01.02); ariaLabel is the full "YYYY-MM-DD to YYYY-MM-DD".
  // week = Sunday..Saturday containing the anchor; year has days=[] and 12 months.
  function periodRange(view, anchorDate) {
    const a = parse(anchorDate == null ? new Date() : anchorDate) || parse(new Date());
    const anchor = iso(a.y, a.m, a.d);
    let start, end, label;
    if (view === "week") {
      start = addDays(anchor, -dayOfWeek(anchor));
      end = addDays(start, 6);
      label = `${fmtMD(start)}-${fmtMD(end)}`;
    } else if (view === "month") {
      start = iso(a.y, a.m, 1);
      end = iso(a.y, a.m, daysInMonth(a.y, a.m));
      label = `${pad(a.y, 4)}-${pad(a.m)}`;
    } else if (view === "year") {
      start = iso(a.y, 1, 1);
      end = iso(a.y, 12, 31);
      label = pad(a.y, 4);
    } else {
      view = "day";
      start = end = anchor;
      label = anchor;
    }
    const days = [];
    if (view !== "year") for (let d = start; d <= end; d = addDays(d, 1)) days.push(d);
    const months = view === "year" ? Array.from({ length: 12 }, (_, i) => `${pad(a.y, 4)}${pad(i + 1)}`) : null;
    return { view, anchor, start, end, days, months, label, ariaLabel: start === end ? start : `${start} to ${end}`, key: `${view}:${start}` };
  }

  // shiftPeriod(view, anchor, delta) -> new anchor "YYYY-MM-DD". Month/year clamp the day
  // (Jan 31 +1 month = Feb 28/29; Feb 29 +1 year = Feb 28).
  function shiftPeriod(view, anchorDate, delta) {
    const a = parse(anchorDate == null ? new Date() : anchorDate) || parse(new Date());
    const n = Math.trunc(num(delta) || 0);
    const cur = iso(a.y, a.m, a.d);
    if (view === "week") return addDays(cur, 7 * n);
    if (view === "month" || view === "year") {
      const total = a.y * 12 + (a.m - 1) + (view === "year" ? 12 * n : n);
      const y = Math.floor(total / 12), m = (total % 12) + 1;
      return iso(y, m, Math.min(a.d, daysInMonth(y, m)));
    }
    return addDays(cur, n);
  }

  // Can the arrows move by delta (+1/-1)? opts: {today, maxYearsBack = 5}.
  // Forward: the target period must start on or before today (current period is the limit).
  // Backward: it must end on or after today minus 5 years (no dependency on earliest data).
  function canShift(view, anchorDate, delta, opts) {
    const o = opts || {};
    const today = parse(o.today == null ? new Date() : o.today);
    if (!today) return false;
    const todayS = iso(today.y, today.m, today.d);
    const next = periodRange(view, shiftPeriod(view, anchorDate, delta));
    if (delta > 0) return next.start <= todayS;
    const fy = today.y - (o.maxYearsBack == null ? 5 : o.maxYearsBack);
    return next.end >= iso(fy, today.m, Math.min(today.d, daysInMonth(fy, today.m)));
  }

  // ---- stats rows ----
  // Latest known daily goal, fallback 500 kcal / 1800 s. -> {targetConsume, targetDuration}
  function pickTarget(dailyList, fallback) {
    const fb = Object.assign({}, DEFAULT_TARGET, fallback || {});
    let best = null;
    for (const r of Array.isArray(dailyList) ? dailyList : []) {
      if (!r || typeof r !== "object" || !parse(r.sportDate)) continue;
      if (!(num(r.targetConsume) > 0) && !(num(r.targetDuration) > 0)) continue;
      if (!best || String(r.sportDate) >= String(best.sportDate)) best = r;
    }
    return {
      targetConsume: best && num(best.targetConsume) > 0 ? num(best.targetConsume) : fb.targetConsume,
      targetDuration: best && num(best.targetDuration) > 0 ? num(best.targetDuration) : fb.targetDuration,
    };
  }

  const dayRow = (date, r, tgt) => {
    const has = !!r;
    return {
      date,
      targetConsume: has && num(r.targetConsume) > 0 ? num(r.targetConsume) : tgt.targetConsume,
      targetDuration: has && num(r.targetDuration) > 0 ? num(r.targetDuration) : tgt.targetDuration,
      realConsume: has ? nz(r.realConsume) : 0,
      realDuration: has ? nz(r.realDuration) : 0,
      realCapacity: has ? nz(r.realCapacity) : 0, // tenths of kg
      realDistance: has ? nz(r.realDistance) : 0,
      hasData: has && (nz(r.realConsume) > 0 || nz(r.realDuration) > 0 || nz(r.realCapacity) > 0),
    };
  };
  // Duplicate rows for one date are summed (targets: the larger one).
  const sumDup = (a, b) => ({
    sportDate: a.sportDate,
    targetConsume: Math.max(nz(a.targetConsume), nz(b.targetConsume)),
    targetDuration: Math.max(nz(a.targetDuration), nz(b.targetDuration)),
    realConsume: nz(a.realConsume) + nz(b.realConsume),
    realDuration: nz(a.realDuration) + nz(b.realDuration),
    realCapacity: nz(a.realCapacity) + nz(b.realCapacity),
    realDistance: nz(a.realDistance) + nz(b.realDistance),
  });
  // fillDaily(range, dailyList, target?) -> one row per range.days. Missing days are zeros with
  // target = `target` || latest known in the list || fallback. Rows outside the range are ignored.
  function fillDaily(range, dailyList, target) {
    const days = range && Array.isArray(range.days) ? range.days : [];
    const list = Array.isArray(dailyList) ? dailyList : [];
    const tgt = target ? Object.assign({}, DEFAULT_TARGET, target) : pickTarget(list);
    const byDate = new Map();
    for (const r of list) {
      const p = r && parse(r.sportDate);
      if (!p) continue;
      const k = iso(p.y, p.m, p.d), prev = byDate.get(k);
      byDate.set(k, prev ? sumDup(prev, r) : r);
    }
    return days.map((d) => dayRow(d, byDate.get(d), tgt));
  }
  // fillMonths(yearOrRange, monthList) -> 12 rows {yearMonth, month, total*, hasData}.
  function fillMonths(yearOrRange, monthList) {
    let y = yearOrRange && typeof yearOrRange === "object" ? parse(yearOrRange.start) : null;
    y = y ? y.y : Math.trunc(num(yearOrRange) || new Date().getFullYear());
    const by = new Map();
    for (const r of Array.isArray(monthList) ? monthList : []) {
      if (!r || r.yearMonth == null) continue;
      const k = String(r.yearMonth).replace(/\D/g, ""), prev = by.get(k);
      by.set(k, prev ? { totalConsume: nz(prev.totalConsume) + nz(r.totalConsume), totalDuration: nz(prev.totalDuration) + nz(r.totalDuration), totalCapacity: nz(prev.totalCapacity) + nz(r.totalCapacity), totalDistance: nz(prev.totalDistance) + nz(r.totalDistance) } : r);
    }
    return Array.from({ length: 12 }, (_, i) => {
      const ym = `${pad(y, 4)}${pad(i + 1)}`, r = by.get(ym);
      const row = {
        yearMonth: ym, month: i + 1,
        totalConsume: r ? nz(r.totalConsume) : 0,
        totalDuration: r ? nz(r.totalDuration) : 0,
        totalCapacity: r ? nz(r.totalCapacity) : 0,
        totalDistance: r ? nz(r.totalDistance) : 0,
      };
      row.hasData = row.totalConsume > 0 || row.totalDuration > 0 || row.totalCapacity > 0;
      return row;
    });
  }

  // ---- rings / grade ----
  const ratio = (a, b) => (nz(b) > 0 ? nz(a) / nz(b) : 0);
  const tgt = (v, fb) => (num(v) > 0 ? num(v) : fb); // missing / null / <= 0 target -> default
  // ratios(day) -> {consume, duration}, raw; missing/null/<=0 targets fall back to DEFAULT_TARGET (500 kcal / 1800 s); (can exceed 1). Accepts fillDaily rows or raw API rows.
  function ratios(day) {
    const d = day || {};
    return {
      consume: ratio(d.realConsume, tgt(d.targetConsume, DEFAULT_TARGET.targetConsume)),
      duration: ratio(d.realDuration, tgt(d.targetDuration, DEFAULT_TARGET.targetDuration)),
    };
  }
  // ringProgress(day) -> {consume, duration} clamped to 0..1 for drawing.
  function ringProgress(day) {
    const r = ratios(day);
    return { consume: Math.min(1, r.consume), duration: Math.min(1, r.duration) };
  }
  // 'S' | 'B' | null (PROVISIONAL, see GRADE_THRESHOLDS). null for days without a workout.
  function gradeFor(day) {
    const d = day || {};
    if (!(nz(d.realConsume) > 0 || nz(d.realDuration) > 0)) return null;
    const r = ratios(d);
    if (r.consume >= GRADE_THRESHOLDS.bothForS && r.duration >= GRADE_THRESHOLDS.bothForS) return "S";
    if (r.consume >= GRADE_THRESHOLDS.consumeForB) return "B";
    return null;
  }

  // ---- fun equivalents ----
  // equivalents(view, kcal, tenthsKg) -> null for day/week; for month:
  // {food:"fries", foodCount, heavy:"cars", heavyCount}; for year: hamburgers / eiffel.
  // Counts are raw numbers (use fmtCount). kg input is TENTHS of kg like the API.
  function equivalents(view, kcal, tenthsKg) {
    if (view !== "month" && view !== "year") return null;
    const kg = kgFromTenths(tenthsKg), k = nz(kcal);
    return view === "month"
      ? { food: "fries", foodCount: k / EQUIV.KCAL_PER_FRIES, heavy: "cars", heavyCount: kg / EQUIV.KG_PER_CAR }
      : { food: "hamburgers", foodCount: k / EQUIV.KCAL_PER_HAMBURGER, heavy: "eiffel", heavyCount: kg / EQUIV.KG_PER_EIFFEL };
  }
  // Servings / towers: always one decimal ("3.2", "0.0"), as in the official app.
  const fmtServings = (n) => loc(nz(n), 1, nz(n).toFixed(1));
  // Cars (and any count): whole number when whole, else one decimal ("8", "7.6"); >=100 integer.
  function fmtCount(n) {
    const v = nz(n);
    const plain = v >= 100 ? String(Math.round(v)) : v.toFixed(1).replace(/\.0$/, "");
    if (uiLang() === "en") return plain;
    const dec = v >= 100 || Number.isInteger(+plain) ? 0 : 1;
    return loc(+plain, dec, plain);
  }

  // ---- training report ----
  // groupSets(extData) -> [{actionId, actionName, actionNo, picUrl, sets:[{sort, weight, weightKg, count, duration}],
  //   totalSets, totalReps, totalDuration, volume (tenths of kg = sum weight*count), volumeKg}]
  // Grouped by actionId in order of first set; sets ordered by `sort`. Supersets (A,B,A,B) merge per action.
  function groupSets(extData) {
    const rows = (Array.isArray(extData) ? extData : []).filter((r) => r && typeof r === "object" && r.actionId != null);
    rows.sort((a, b) => (num(a.sort) ?? Infinity) - (num(b.sort) ?? Infinity));
    const groups = new Map();
    for (const r of rows) {
      const id = String(r.actionId);
      if (!groups.has(id)) {
        groups.set(id, {
          actionId: r.actionId,
          actionName: r.actionName == null ? "" : String(r.actionName),
          actionNo: r.actionNo == null ? null : String(r.actionNo),
          picUrl: r.picUrl ? String(r.picUrl) : null,
          sets: [], totalSets: 0, totalReps: 0, totalDuration: 0, volume: 0,
        });
      }
      const g = groups.get(id);
      const set = { sort: num(r.sort), weight: nz(r.weight), weightKg: kgFromTenths(r.weight), count: nz(r.count), duration: nz(r.duration) };
      g.sets.push(set);
      g.totalSets += 1; g.totalReps += set.count; g.totalDuration += set.duration; g.volume += set.weight * set.count;
    }
    return [...groups.values()].map((g) => Object.assign(g, { volumeKg: kgFromTenths(g.volume) }));
  }

  // ---- badges ----
  // "2026/10/27" -> "2026-10-27"; null/garbage -> null
  function badgeDate(s) { const p = s ? parse(s) : null; return p ? iso(p.y, p.m, p.d) : null; }
  function badge(b, level) {
    const t = BADGE_TYPES[b.type] || { key: "other", unit: "" };
    const received = b.received === true;
    const target = num(b.target);
    return {
      id: b.id, type: num(b.type), key: t.key, unit: t.unit, target, level: level || null,
      received, receiveDate: badgeDate(b.receiveTime),
      activePic: b.activePic || null, inactivePic: b.inactivePic || null,
      pic: (received ? b.activePic : b.inactivePic) || null, // choose; fall back to text if it fails to load
      fallbackText: `${target == null ? "" : target} ${t.unit}`.trim(),
    };
  }
  // normalizeBadges(data) -> {latest:[badge], all:[badge], groups:[{type,key,unit,badges,received,locked}], receivedCount, total}
  // `data` = response.data of sport/record/badge/list. `latest` keeps server order.
  function normalizeBadges(data) {
    const d = data && typeof data === "object" ? data : {};
    const clean = (l) => (Array.isArray(l) ? l : []).filter((b) => b && typeof b === "object" && b.id != null);
    const all = clean(d.allBadges).slice().sort((a, b) => (num(a.type) || 0) - (num(b.type) || 0) || (num(a.target) || 0) - (num(b.target) || 0));
    const groups = [], lvl = {};
    const allN = all.map((b) => {
      lvl[b.type] = (lvl[b.type] || 0) + 1;
      return badge(b, lvl[b.type]);
    });
    for (const b of allN) {
      let g = groups.find((x) => x.type === b.type);
      if (!g) groups.push(g = { type: b.type, key: b.key, unit: b.unit, badges: [], received: 0, locked: 0 });
      g.badges.push(b);
      if (b.received) g.received++; else g.locked++;
    }
    const byId = new Map(allN.map((b) => [String(b.id), b]));
    const latest = clean(d.latestBadges).map((b) => byId.get(String(b.id)) || badge(b, null));
    return { latest, all: allN, groups, receivedCount: allN.filter((b) => b.received).length, total: allN.length };
  }

  return {
    VIEWS, DEFAULT_TARGET, GRADE_THRESHOLDS, EQUIV, BADGE_TYPES,
    localISO, addDays, dayOfWeek, parseDate: parse,
    fmtDuration, minutesFromSeconds, kgFromTenths, fmtKg, weightFromTenths, fmtWeight, badgeCaption, fmtKcal, fmtCount, fmtServings,
    periodRange, shiftPeriod, canShift,
    pickTarget, fillDaily, fillMonths,
    ratios, ringProgress, gradeFor, equivalents,
    groupSets, normalizeBadges,
  };
});
