/* Exercise Progress - pure logic, no DOM, no IndexedDB. Browser global `ExerciseProgressCore`,
   Node module.exports. See docs/plan-exercise-progress.md and docs/exercise-progress-impl-notes.md.
   Dates are "YYYY-MM-DD" strings (local calendar date of the workout's startTime); all calendar
   maths goes through Date.UTC (DST and time-zone safe), never toISOString().
   Weights are tenths of kg (as stored by the server). Everything tolerates null/garbage. */
(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.ExerciseProgressCore = api;
})(typeof self !== "undefined" ? self : this, function () {
  const WM = typeof require === "function" && typeof module !== "undefined" ? require("./weight-mode-core.js") : (typeof self !== "undefined" ? self.WeightModeCore : null);

  const SCHEMA = 1;                       // version of the cached workout summary
  const RANGES = ["3M", "6M", "1Y", "All"];
  const DEFAULT_RANGE = "All";
  const LIST_SIZE = 500;                  // `size` requested from /sport/record/list
  const KNOWN_CAPS = [50];                // page sizes the app has used; a window with exactly this many rows may be truncated
  const MIN_YEAR = 2015;                  // never list before this year
  const MAX_EMPTY_WINDOWS = 2;            // stop walking back after this many empty 12-month windows in a row
  const CONCURRENCY = 3;
  const MAX_RETRIES = 4;                  // retries after the first attempt: waits 1, 2, 4, 8 s
  const BASE_DELAY_MS = 1000;
  const MAX_DELAY_MS = 120000;
  const MAX_CONSECUTIVE_FAILURES = 5;

  const num = (v) => { const n = typeof v === "string" && v.trim() === "" ? NaN : Number(v); return Number.isFinite(n) ? n : null; };
  const nz = (v) => { const n = num(v); return n === null ? 0 : Math.max(0, n); };
  const pad = (n, w) => String(n).padStart(w || 2, "0");

  // ---------- calendar ----------
  function parseDate(d) {
    const m = /^(\d{4})[-/.]?(\d{2})[-/.]?(\d{2})/.exec(String(d == null ? "" : d).trim());
    if (!m) return null;
    const y = +m[1], mo = +m[2], da = +m[3];
    const t = new Date(Date.UTC(y, mo - 1, da));
    if (t.getUTCFullYear() !== y || t.getUTCMonth() !== mo - 1 || t.getUTCDate() !== da) return null;
    return { y, m: mo, d: da };
  }
  const iso = (y, m, d) => `${pad(y, 4)}-${pad(m)}-${pad(d)}`;
  const daysInMonth = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();
  const isoOf = (p) => iso(p.y, p.m, p.d);
  // Local date of a Date object (never toISOString).
  const localISO = (date) => iso(date.getFullYear(), date.getMonth() + 1, date.getDate());
  // Whole days since 1970-01-01 for a "YYYY-MM-DD" string (null if invalid).
  function dayNumber(dateStr) {
    const p = parseDate(dateStr);
    return p ? Math.round(Date.UTC(p.y, p.m - 1, p.d) / 86400000) : null;
  }
  function fromDayNumber(n) {
    const t = new Date(n * 86400000);
    return iso(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
  }
  function addDays(dateStr, n) {
    const dn = dayNumber(dateStr);
    return dn === null ? null : fromDayNumber(dn + Math.trunc(num(n) || 0));
  }
  // Month shift clamping the day (Mar 31 - 1 month = Feb 28/29).
  function addMonths(dateStr, n) {
    const p = parseDate(dateStr);
    if (!p) return null;
    const total = p.y * 12 + (p.m - 1) + Math.trunc(num(n) || 0);
    const y = Math.floor(total / 12), m = (total % 12) + 1;
    return iso(y, m, Math.min(p.d, daysInMonth(y, m)));
  }
  // "2026-10-28 10:24:44" -> {date, startTime, secs (seconds into the day)}; null if unparseable.
  function parseStart(s) {
    if (typeof s !== "string") return null;
    const m = /^\s*(\d{4}-\d{2}-\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/.exec(s);
    if (!m || !parseDate(m[1])) return null;
    const hh = +(m[2] || 0), mm = +(m[3] || 0), ss = +(m[4] || 0);
    return { date: m[1], startTime: `${m[1]} ${pad(hh)}:${pad(mm)}:${pad(ss)}`, secs: hh * 3600 + mm * 60 + ss };
  }
  // Request timestamp format required by the API.
  const stamp = (dateStr, endOfDay) => `${dateStr} ${endOfDay ? "23:59:59" : "00:00:00"}`;

  // ---------- summarising one workout ----------
  // summarizeWorkout(detail) -> null | {v, recordId, startTime, date, exercises:{[actionId]:{
  //   actionName, maxWeight (tenths, 0 if no weighted set), repsAtMax, bestCount, sets (sets with count>0),
  //   wsets (sets with count>0 and weight>0), reps (sum of count)}}}
  // Sets with count <= 0 are ignored; a weight <= 0 never counts as "weight" (warm-ups, bodyweight,
  // and sideNum 0 actions that carry a stale default). The kind charted (weight / reps / seconds) is
  // decided later by buildSeries from the action's mode, so the cached summary does not depend on
  // the action library being available at sync time.
  function summarizeWorkout(detail) {
    const d = detail && typeof detail === "object" ? detail : null;
    if (!d) return null;
    const idRaw = d.sportRecordId != null ? d.sportRecordId : d.recordId;
    const recordId = num(idRaw);
    const start = parseStart(d.startTime);
    if (recordId === null || recordId <= 0 || !start) return null;
    const rows = (Array.isArray(d.extData) ? d.extData : []).filter((r) => r && typeof r === "object" && r.actionId != null);
    const exercises = {};
    for (const r of rows) {
      const count = nz(r.count), weight = nz(r.weight);
      if (!(count > 0)) continue;
      const key = String(r.actionId);
      const ex = exercises[key] || (exercises[key] = { actionName: "", maxWeight: 0, repsAtMax: 0, bestCount: 0, sets: 0, wsets: 0, reps: 0 });
      if (!ex.actionName && r.actionName != null) ex.actionName = String(r.actionName);
      ex.sets += 1; ex.reps += count;
      if (count > ex.bestCount) ex.bestCount = count;
      if (weight > 0) {
        ex.wsets += 1;
        const w = Math.round(weight);
        if (w > ex.maxWeight || (w === ex.maxWeight && count > ex.repsAtMax)) { ex.maxWeight = w; ex.repsAtMax = count; }
      }
    }
    return { v: SCHEMA, recordId, startTime: start.startTime, date: start.date, exercises };
  }

  // ---------- what to chart ----------
  // kindFor(mode, hasWeight) -> "weight" | "reps" | "seconds"
  // mode = {sideNum, countType} from the library, or null/{} when unknown.
  // sideNum 0 (no weight): reps, or seconds when countType is 2 (timed). Unknown mode: weight if any
  // weighted set exists, else reps. Per side / Combined: weight.
  function kindFor(mode, hasWeight) {
    const m = mode && typeof mode === "object" ? mode : {};
    const wm = WM ? WM.modeFor(m.sideNum) : { key: "unknown" };
    if (wm.key === "none") return Number(m.countType) === 2 ? "seconds" : "reps";
    if (wm.key === "unknown") return hasWeight ? "weight" : (Number(m.countType) === 2 ? "seconds" : "reps");
    return "weight";
  }

  function cutoffFor(range, today) {
    const t = parseDate(today) ? today : null;
    if (!t) return null;
    if (range === "3M") return addMonths(t, -3);
    if (range === "6M") return addMonths(t, -6);
    if (range === "1Y") return addMonths(t, -12);
    return null;
  }

  const workoutsOf = (index) => (Array.isArray(index) ? index : (index && typeof index === "object" ? Object.values(index) : [])).filter((w) => w && typeof w === "object" && w.exercises && typeof w.exercises === "object");

  // exerciseOptions(index) -> [{actionId, name, sessions, lastDate}] newest-trained first (for the Phase 2 list)
  function exerciseOptions(index) {
    const by = new Map();
    for (const w of workoutsOf(index)) {
      for (const [id, ex] of Object.entries(w.exercises)) {
        const cur = by.get(id) || { actionId: id, name: "", sessions: 0, lastDate: "", _t: "" };
        cur.sessions += 1;
        const t = String(w.startTime || w.date || "");
        if (t >= cur._t) { cur._t = t; cur.lastDate = w.date || ""; if (ex && ex.actionName) cur.name = ex.actionName; }
        by.set(id, cur);
      }
    }
    return [...by.values()].map(({ _t, ...o }) => o).sort((a, b) => (a.lastDate < b.lastDate ? 1 : a.lastDate > b.lastDate ? -1 : String(a.name).localeCompare(String(b.name))));
  }

  // buildSeries(index, actionId, {range, today, mode}) ->
  //  {actionId, name, kind, modeKey ("per-side"|"combined"|"none"|"unknown"), showTotal, range, cutoff,
  //   hasAny (any point at all, ignoring the range), isEmpty (no point in range), isSingle (exactly one),
  //   points:[{recordId, date, startTime, x, value, weight (tenths, weight kind), total (tenths, Combined),
  //            reps (reps at the best set), count (best count), sets, totalReps}],
  //   summary: null | {latest, best, first, sessions, rangeSessions, change:{abs, pct|null}} over ALL points, whatever the
  //            range (latest/best/first are {value, date}; weight values are tenths of kg); null only when !hasAny}
  // x is days since 1970-01-01 plus the fraction of the day, so two workouts on one date stay distinct.
  function buildSeries(index, actionId, opts) {
    const o = opts || {};
    const key = String(actionId);
    const mode = o.mode && typeof o.mode === "object" ? o.mode : null;
    const all = [];
    let name = "", nameT = "", hasWeight = false;
    for (const w of workoutsOf(index)) {
      const ex = w.exercises[key];
      if (!ex || typeof ex !== "object") continue;
      const st = parseStart(w.startTime) || parseStart(w.date);
      if (!st) continue;
      if (String(w.startTime || w.date) >= nameT && ex.actionName) { nameT = String(w.startTime || w.date); name = ex.actionName; }
      if (nz(ex.maxWeight) > 0) hasWeight = true;
      all.push({ w, ex, st });
    }
    const kind = kindFor(mode, hasWeight);
    const showTotal = kind === "weight" && !!(mode && WM && WM.modeFor(mode.sideNum).key === "combined");
    let pts = [];
    for (const { w, ex, st } of all) {
      const value = kind === "weight" ? Math.round(nz(ex.maxWeight)) : Math.round(nz(ex.bestCount));
      if (!(value > 0)) continue;
      const p = {
        recordId: w.recordId, date: st.date, startTime: st.startTime,
        x: dayNumber(st.date) + st.secs / 86400,
        value,
        weight: kind === "weight" ? value : 0,
        total: kind === "weight" && showTotal ? WM.totalTenths(mode.sideNum, value) : 0,
        reps: kind === "weight" ? nz(ex.repsAtMax) : value,
        count: nz(ex.bestCount),
        sets: kind === "weight" ? nz(ex.wsets) : nz(ex.sets),
        totalReps: nz(ex.reps),
      };
      pts.push(p);
    }
    pts.sort((a, b) => a.x - b.x || (num(a.recordId) || 0) - (num(b.recordId) || 0));
    const range = RANGES.includes(o.range) ? o.range : DEFAULT_RANGE;
    const cutoff = cutoffFor(range, o.today);
    const hasAny = pts.length > 0;
    // Summary stats are ALL-TIME (personal best, first, latest, change, sessions); the range only
    // narrows the chart points and `rangeSessions`.
    const summary = summarize(pts);
    if (cutoff) pts = pts.filter((p) => p.date >= cutoff);
    if (summary) summary.rangeSessions = pts.length;
    const modeKey = mode && WM ? WM.modeFor(mode.sideNum).key : "unknown";
    return {
      actionId: key, name, kind, modeKey, showTotal, range, cutoff, hasAny,
      isEmpty: pts.length === 0, isSingle: pts.length === 1, points: pts, summary,
    };
  }

  function summarize(pts) {
    if (!pts.length) return null;
    const first = pts[0], last = pts[pts.length - 1];
    let best = pts[0];
    for (const p of pts) if (p.value > best.value) best = p; // ties keep the earliest date
    const abs = last.value - first.value;
    return {
      latest: { value: last.value, date: last.date },
      best: { value: best.value, date: best.date },
      first: { value: first.value, date: first.date },
      sessions: pts.length,
      change: { abs, pct: first.value > 0 ? Math.round((abs / first.value) * 1000) / 10 : null },
    };
  }

  // ---------- list windows / bisection ----------
  // A window is {startDate, endDate, start, end} with request timestamps "yyyy-MM-dd HH:mm:ss".
  function makeWindow(startDate, endDate) {
    return { startDate, endDate, start: stamp(startDate, false), end: stamp(endDate, true) };
  }
  // First window: the 12 months ending today (inclusive).
  function firstWindow(today) {
    if (!parseDate(today)) return null;
    return makeWindow(addDays(addMonths(today, -12), 1), today);
  }
  // Next older 12-month window, or null once it would end before MIN_YEAR.
  function nextWindow(win, minYear) {
    if (!win || !parseDate(win.startDate)) return null;
    const end = addDays(win.startDate, -1);
    if (parseDate(end).y < (minYear == null ? MIN_YEAR : minYear)) return null;
    return makeWindow(addDays(addMonths(end, -12), 1), end);
  }
  // Split a window in two halves by day: [newer, older]; null if it is a single day.
  function bisectWindow(win) {
    if (!win) return null;
    const a = dayNumber(win.startDate), b = dayNumber(win.endDate);
    if (a === null || b === null || b <= a) return null;
    const mid = a + Math.floor((b - a) / 2); // older half: a..mid, newer half: mid+1..b
    return [makeWindow(fromDayNumber(mid + 1), win.endDate), makeWindow(win.startDate, fromDayNumber(mid))];
  }
  // A window answer may be truncated when it holds `size` rows, or exactly a page size the app has used.
  // `maxSeen` (optional) is the largest row count any list call has returned so far: a server cap shows up as
  // many windows answering with exactly that count, so a window at that count (>= 2) may be truncated too.
  function isFull(count, size, maxSeen) {
    const s = size == null ? LIST_SIZE : size;
    if (count >= s || (s > Math.max.apply(null, KNOWN_CAPS) && KNOWN_CAPS.includes(count))) return true;
    return maxSeen != null && count >= 2 && count >= maxSeen;
  }

  const rowId = (r) => (r && typeof r === "object" ? num(r.sportRecordId != null ? r.sportRecordId : r.recordId) : null);

  // enumerateRecords({today, fetchWindow(win) -> rows, size, minYear, maxEmpty, stopWhenKnown(rows) -> bool, onWindow})
  //   -> Promise<{rows:[{recordId,startTime}], coveredFrom (startDate of the oldest window walked), windows, calls,
//      saturated (a single-day window was still full: the listing may be incomplete), maxSeen}>
  // Walks 12-month windows newest to oldest, bisecting any window that may be truncated, stopping after
  // `maxEmpty` empty windows in a row (or at minYear). Rows are de-duplicated by record id.
  async function enumerateRecords(o) {
    const fetchWindow = o.fetchWindow, size = o.size == null ? LIST_SIZE : o.size;
    const maxEmpty = o.maxEmpty == null ? MAX_EMPTY_WINDOWS : o.maxEmpty;
    const byId = new Map();
    let calls = 0, maxSeen = 0, saturated = false;
    const take = (rows) => {
      for (const r of Array.isArray(rows) ? rows : []) {
        const id = rowId(r);
        if (id === null || id <= 0) continue;
        if (!byId.has(id)) byId.set(id, { recordId: id, startTime: r && typeof r.startTime === "string" ? r.startTime : "" });
      }
    };
    async function listWin(win) {
      const rows = await fetchWindow(win);
      calls++;
      const list = Array.isArray(rows) ? rows : [];
      maxSeen = Math.max(maxSeen, list.length);
      const full = isFull(list.length, size, maxSeen);
      const halves = full ? bisectWindow(win) : null;
      if (!halves) { take(list); if (full && list.length >= 2) saturated = true; return list; } // a one-day window that is still full: history may be cut
      take(list); // keep what we got; the halves fill in the rest
      const a = await listWin(halves[0]);
      const b = await listWin(halves[1]);
      return list.concat(a, b);
    }
    let win = firstWindow(o.today), empties = 0, coveredFrom = null, windows = 0;
    while (win) {
      const rows = await listWin(win);
      windows++;
      coveredFrom = win.startDate;
      if (typeof o.onWindow === "function") o.onWindow(win, rows);
      empties = rows.length === 0 ? empties + 1 : 0;
      if (empties >= maxEmpty) break;
      if (typeof o.stopWhenKnown === "function" && rows.length && o.stopWhenKnown(rows)) break;
      win = nextWindow(win, o.minYear);
    }
    const rows = [...byId.values()];
    return { rows, coveredFrom, windows, calls, saturated, maxSeen };
  }

  // diffIds(listRows, cachedIds, {coveredFrom}) -> {toFetch:[{recordId,startTime}] newest first, stale:[recordId]}
  // cachedIds: Set / array / object of cached ids, or a Map id -> startTime. `stale` = cached workouts
  // inside the walked range that the server no longer lists (deleted elsewhere); only reported when
  // the caller gives `coveredFrom` and a Map with start times.
  function diffIds(listRows, cached, opts) {
    const o = opts || {};
    const have = cached instanceof Map ? cached : new Map((cached instanceof Set || Array.isArray(cached) ? [...cached] : Object.keys(cached || {})).map((k) => [Number(k), ""]));
    const listed = new Set();
    const toFetch = [];
    for (const r of Array.isArray(listRows) ? listRows : []) {
      const id = rowId(r);
      if (id === null || id <= 0 || listed.has(id)) continue;
      listed.add(id);
      if (!have.has(id)) toFetch.push({ recordId: id, startTime: r && typeof r.startTime === "string" ? r.startTime : "" });
    }
    toFetch.sort((a, b) => (a.startTime < b.startTime ? 1 : a.startTime > b.startTime ? -1 : b.recordId - a.recordId));
    const stale = [];
    if (o.coveredFrom && have instanceof Map) {
      for (const [id, st] of have) if (!listed.has(id) && typeof st === "string" && st.slice(0, 10) >= o.coveredFrom) stale.push(id);
    }
    return { toFetch, stale };
  }

  // ---------- retry / backoff / pool ----------
  // Retry-After: seconds ("120") or an HTTP date; -> milliseconds or null.
  function parseRetryAfter(v, nowMs) {
    if (v == null || v === "") return null;
    const n = Number(v);
    if (Number.isFinite(n)) return n >= 0 ? Math.round(n * 1000) : null;
    const t = Date.parse(String(v));
    return Number.isFinite(t) ? Math.max(0, t - (nowMs == null ? Date.now() : nowMs)) : null;
  }
  // retryDelay(attempt, retryAfterMs?) attempt = 1 for the first retry. 1, 2, 4, 8 s; a Retry-After
  // longer than the backoff wins; everything capped at MAX_DELAY_MS.
  function retryDelay(attempt, retryAfterMs) {
    const a = Math.max(1, Math.trunc(num(attempt) || 1));
    const base = BASE_DELAY_MS * Math.pow(2, a - 1);
    const ra = num(retryAfterMs);
    return Math.min(MAX_DELAY_MS, Math.max(base, ra === null ? 0 : Math.max(0, ra)));
  }
  // Errors worth retrying: HTTP 429 / 5xx, an envelope code that is not 200, network failures (no status).
  function isRetryable(err) {
    if (!err || typeof err !== "object") return true;
    if (err.fatal === true) return false;
    const s = num(err.status);
    if (s !== null) return s === 429 || s === 408 || s >= 500;
    const c = num(err.code != null ? err.code : (err.body && err.body.code));
    if (c !== null) return c !== 200;
    return true; // TypeError: Failed to fetch, malformed body, timeouts
  }
  // Transient transport trouble (the server or network is struggling) as opposed to one bad record.
  function isTransport(err) {
    if (!err || typeof err !== "object") return true;
    const s = num(err.status);
    if (s !== null) return s === 429 || s === 408 || s >= 500;
    return num(err.code != null ? err.code : (err.body && err.body.code)) === null;
  }
  const defaultSleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // withRetry(fn, {maxRetries, sleep, onRetry(attempt, delayMs, err), shouldStop}) -> resolves with fn's result,
  // or rejects with the last error. Honours err.retryAfter (ms) as the minimum wait.
  async function withRetry(fn, opts) {
    const o = opts || {};
    const max = o.maxRetries == null ? MAX_RETRIES : o.maxRetries;
    const sleep = o.sleep || defaultSleep;
    for (let attempt = 0; ; attempt++) {
      try { return await fn(attempt); }
      catch (err) {
        if (attempt >= max || !isRetryable(err) || (typeof o.shouldStop === "function" && o.shouldStop())) throw err;
        const delay = retryDelay(attempt + 1, err && err.retryAfter);
        if (typeof o.onRetry === "function") o.onRetry(attempt + 1, delay, err);
        await sleep(delay);
      }
    }
  }

  // A shared cooldown so that one 429 slows every worker, not just the one that saw it.
  function makeGate(now, sleep) {
    const clock = now || (() => Date.now()), nap = sleep || defaultSleep;
    let until = 0;
    return {
      delay(ms) { until = Math.max(until, clock() + Math.max(0, ms)); },
      async wait() { for (let w = until - clock(); w > 0; w = until - clock()) await nap(w); },
      until: () => until,
    };
  }

  // runPool(items, worker, {concurrency, shouldStop, onResult}) -> Promise<{done, failed, stopped, maxActive}>
  // Runs worker(item) for each item in order with at most `concurrency` in flight. worker resolves
  // for success or throws for failure (onResult gets {item, ok, error}). If it throws an error with
  // `pause: true` or after `maxConsecutive` failures in a row the pool stops starting new items.
  async function runPool(items, worker, opts) {
    const o = opts || {};
    const conc = Math.max(1, Math.min(o.concurrency == null ? CONCURRENCY : o.concurrency, 8));
    const maxConsecutive = o.maxConsecutive == null ? MAX_CONSECUTIVE_FAILURES : o.maxConsecutive;
    const queue = items.slice();
    const st = { done: 0, failed: 0, stopped: false, paused: false, maxActive: 0, active: 0, consecutive: 0 };
    const stop = () => st.paused || (typeof o.shouldStop === "function" && o.shouldStop());
    async function lane() {
      while (queue.length && !stop()) {
        const item = queue.shift();
        st.active++; st.maxActive = Math.max(st.maxActive, st.active);
        try {
          await worker(item);
          st.done++; st.consecutive = 0;
          if (o.onResult) o.onResult({ item, ok: true });
        } catch (error) {
          st.failed++; st.consecutive++;
          if (error && error.pause) st.paused = true;
          if (st.consecutive >= maxConsecutive) st.paused = true;
          if (o.onResult) o.onResult({ item, ok: false, error });
        } finally { st.active--; }
      }
    }
    await Promise.all(Array.from({ length: Math.min(conc, queue.length) }, lane));
    st.stopped = st.paused || (typeof o.shouldStop === "function" && o.shouldStop() && queue.length > 0);
    return { done: st.done, failed: st.failed, stopped: st.stopped, paused: st.paused, remaining: queue.length, maxActive: st.maxActive };
  }

  // ---------- account scoping ----------
  // Non-cryptographic 53-bit hash (cyrb53) so the raw email is never part of the database name.
  function accountKey(email) {
    const s = String(email == null ? "" : email).trim().toLowerCase();
    if (!s) return "anon";
    let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
    for (let i = 0; i < s.length; i++) {
      const ch = s.charCodeAt(i);
      h1 = Math.imul(h1 ^ ch, 2654435761);
      h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return (h2 >>> 0).toString(16).padStart(8, "0") + (h1 >>> 0).toString(16).padStart(8, "0");
  }
  const DB_PREFIX = "myinnox1-progress-";
  const dbName = (email) => DB_PREFIX + accountKey(email);

  return {
    SCHEMA, RANGES, DEFAULT_RANGE, LIST_SIZE, KNOWN_CAPS, MIN_YEAR, CONCURRENCY, MAX_RETRIES, MAX_CONSECUTIVE_FAILURES, DB_PREFIX,
    parseDate, localISO, dayNumber, fromDayNumber, addDays, addMonths, parseStart, stamp,
    summarizeWorkout, kindFor, cutoffFor, buildSeries, exerciseOptions,
    makeWindow, firstWindow, nextWindow, bisectWindow, isFull, enumerateRecords, diffIds,
    parseRetryAfter, retryDelay, isRetryable, isTransport, withRetry, makeGate, runPool,
    accountKey, dbName,
  };
});
