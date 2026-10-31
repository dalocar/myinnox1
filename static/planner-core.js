/* Plan Builder - pure logic (no DOM). Works in the browser (global `PlannerCore`)
   and in Node (module.exports) so it can be unit tested with `node --test static/`.

   All dates are "yyyy-MM-dd" strings handled in LOCAL time (never toISOString,
   which shifts the day across timezones). Weekdays follow the API's preferDays:
   1 = Monday ... 7 = Sunday. See docs/plan-api.md. */
(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.PlannerCore = api;
})(typeof self !== "undefined" ? self : this, function () {
  const MAX_WEEKS = 4; // client-side cap (the server accepts more)

  // ---------- dates ----------
  const pad2 = (n) => String(n).padStart(2, "0");

  /** "yyyy-MM-dd" -> Date at local noon (noon dodges DST edge cases), or null if invalid. */
  function parseDate(s) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || ""));
    if (!m) return null;
    const y = +m[1], mo = +m[2], d = +m[3];
    const dt = new Date(y, mo - 1, d, 12, 0, 0, 0);
    if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d) return null;
    return dt;
  }
  function formatDate(d) {
    return `${String(d.getFullYear()).padStart(4, "0")}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  }
  /** "yyyy-MM-dd HH:mm:ss" in local time - the API's curTime. */
  function formatDateTime(d = new Date()) {
    return `${formatDate(d)} ${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
  }
  function today() { return formatDate(new Date()); }
  function addDays(s, n) {
    const d = parseDate(s);
    if (!d) throw new Error("Invalid date: " + s);
    d.setDate(d.getDate() + n);
    return formatDate(d);
  }
  function diffDays(a, b) { return Math.round((parseDate(b) - parseDate(a)) / 86400000); }
  /** 1 = Monday ... 7 = Sunday */
  function weekdayOf(s) {
    const g = parseDate(s).getDay(); // 0 = Sunday
    return ((g + 6) % 7) + 1;
  }
  function mondayOf(s) { return addDays(s, -(weekdayOf(s) - 1)); }

  /** Chronological dates in [start, start + 7*weeks - 1] whose weekday is in `weekdays`. */
  function trainingDates(startDate, weeks, weekdays) {
    if (!parseDate(startDate)) return [];
    const set = new Set((weekdays || []).map(Number));
    const out = [];
    const n = Math.max(0, Math.floor(Number(weeks) || 0)) * 7;
    for (let i = 0; i < n; i++) {
      const d = addDays(startDate, i);
      if (set.has(weekdayOf(d))) out.push(d);
    }
    return out;
  }

  /** Group sorted dates by calendar week (Monday-based): [{monday, dates}] */
  function groupByWeek(dates) {
    const groups = [];
    for (const d of dates) {
      const mon = mondayOf(d);
      let g = groups[groups.length - 1];
      if (!g || g.monday !== mon) { g = { monday: mon, dates: [] }; groups.push(g); }
      g.dates.push(d);
    }
    return groups;
  }

  // ---------- items ----------
  /** Normalize a course/custom-course/plan-item object into the draft's item shape. */
  function toItem(c) {
    return {
      courseId: c.courseId != null ? c.courseId : c.id,
      name: c.name || "",
      custom: c.custom ? 1 : 0,
      smallImg: c.smallImg || "",
      duration: c.duration != null ? c.duration : null,
    };
  }
  const cloneItem = (it) => Object.assign({}, it);

  function moveInArray(arr, from, to) {
    const out = arr.slice();
    if (from === to || from < 0 || to < 0 || from >= out.length || to >= out.length) return out;
    const [x] = out.splice(from, 1);
    out.splice(to, 0, x);
    return out;
  }

  // ---------- distribution ----------
  /**
   * mode "all":    every date gets all items, in order.
   * mode "rotate": date i gets items[i mod n]; continuous across weeks unless
   *                opts.restartEachWeek (counter resets each 7-day block from opts.startDate).
   * Returns {date: [items]}.
   */
  function distribute(dates, items, mode, opts = {}) {
    const out = {};
    const n = items.length;
    const start = opts.startDate || dates[0];
    let counter = 0, lastWeek = null;
    for (const date of dates) {
      if (mode === "rotate") {
        if (opts.restartEachWeek) {
          const wk = Math.floor(diffDays(start, date) / 7);
          if (wk !== lastWeek) { counter = 0; lastWeek = wk; }
        }
        out[date] = n ? [cloneItem(items[counter % n])] : [];
        counter++;
      } else {
        out[date] = items.map(cloneItem);
      }
    }
    return out;
  }

  // ---------- draft ----------
  function createDraft(init = {}) {
    return Object.assign({
      id: null,
      name: "",
      startDate: today(),
      weeks: 2,
      weekdays: [1, 3, 5],
      pic: "",
      mode: "all",              // "all" | "rotate"
      restartEachWeek: false,
      routines: [],             // chosen items (ordered), the input of the distribution
      days: {},                 // date -> [item]
      edited: new Set(),        // dates changed by hand
      lockedBasics: false,      // existing plan: startDate/weeks/weekdays are read-only
      status: null,
    }, init, { edited: new Set(init.edited || []) });
  }

  function draftDates(draft) { return Object.keys(draft.days).sort(); }

  /** Recompute `days` from the settings. Hand-edited dates are kept unless overwriteEdited. */
  function regenerate(draft, { overwriteEdited = false } = {}) {
    const dates = trainingDates(draft.startDate, draft.weeks, draft.weekdays);
    const dist = distribute(dates, draft.routines, draft.mode, {
      restartEachWeek: draft.restartEachWeek, startDate: draft.startDate,
    });
    const days = {};
    const edited = new Set();
    for (const d of dates) {
      if (!overwriteEdited && draft.edited.has(d) && draft.days[d]) {
        days[d] = draft.days[d];
        edited.add(d);
      } else {
        days[d] = dist[d];
      }
    }
    draft.days = days;
    draft.edited = edited;
    return draft;
  }

  function dayOf(draft, date) {
    if (!Object.prototype.hasOwnProperty.call(draft.days, date)) throw new Error("Not a training day: " + date);
    return draft.days[date];
  }
  function setDayItems(draft, date, items) {
    dayOf(draft, date);
    draft.days[date] = items.map(cloneItem);
    draft.edited.add(date);
    return draft;
  }
  function addItem(draft, date, item) {
    const list = dayOf(draft, date);
    list.push(cloneItem(item));
    draft.edited.add(date);
    return draft;
  }
  function removeItem(draft, date, index) {
    const list = dayOf(draft, date);
    if (index >= 0 && index < list.length) list.splice(index, 1);
    draft.edited.add(date);
    return draft;
  }
  function replaceItem(draft, date, index, item) {
    const list = dayOf(draft, date);
    if (index >= 0 && index < list.length) list[index] = cloneItem(item);
    draft.edited.add(date);
    return draft;
  }
  function moveItem(draft, date, from, to) {
    draft.days[date] = moveInArray(dayOf(draft, date), from, to);
    draft.edited.add(date);
    return draft;
  }
  /** Replace the items of every given date with `items`. */
  function applyToDates(draft, dates, items) {
    for (const d of dates) setDayItems(draft, d, items);
    return draft;
  }

  // ---------- validation ----------
  function validate(draft) {
    const errors = [];
    if (!String(draft.name || "").trim()) errors.push("Give the plan a name.");
    if (!parseDate(draft.startDate)) errors.push("Pick a valid start date.");
    if (!draft.lockedBasics) {
      if (!(draft.weekdays || []).length) errors.push("Pick at least one training weekday.");
      const w = Number(draft.weeks);
      if (!Number.isInteger(w) || w < 1 || w > MAX_WEEKS) errors.push(`Weeks must be between 1 and ${MAX_WEEKS}.`);
    }
    const dates = draftDates(draft);
    const emptyDates = dates.filter((d) => !(draft.days[d] || []).length);
    if (!dates.length) errors.push("There are no training days in this range.");
    else if (emptyDates.length) {
      errors.push(`${emptyDates.length} training day${emptyDates.length === 1 ? " has" : "s have"} no routine.`);
    }
    return { errors, emptyDates };
  }

  // ---------- API mapping ----------
  function toSavePayload(draft, curTime, id) {
    const dates = draftDates(draft);
    const planItemMap = {};
    for (const d of dates) planItemMap[d] = draft.days[d].map((it) => ({ courseId: it.courseId }));
    const payload = {
      curTime,
      name: String(draft.name).trim(),
      weeks: Number(draft.weeks),
      preferDays: (draft.weekdays || []).slice().map(Number).sort((a, b) => a - b).join(","),
      trainDays: dates.join(","),
      startDate: draft.startDate,
      pic: draft.pic || "",
      planItemMap,
    };
    const useId = id != null ? id : draft.id;
    if (useId != null) payload.id = useId;
    return payload;
  }

  const splitList = (v) => Array.isArray(v) ? v : String(v || "").split(",").map((s) => s.trim()).filter(Boolean);

  /** plan/get (or ongoing list) object -> draft. Days with no items vanish server-side, so
      empty days are recomputed as trainDays minus planItemMap keys. */
  function fromPlanGet(data) {
    const map = data.planItemMap || {};
    const dates = new Set(splitList(data.trainDays));
    Object.keys(map).forEach((d) => dates.add(d));
    const days = {};
    for (const d of Array.from(dates).sort()) days[d] = (map[d] || []).map(toItem);
    return createDraft({
      id: data.id != null ? data.id : null,
      name: data.name || "",
      startDate: data.startDate || (Object.keys(days).sort()[0] || today()),
      weeks: data.weeks != null ? Number(data.weeks) : 1,
      weekdays: splitList(data.preferDays).map(Number).filter((n) => n >= 1 && n <= 7),
      pic: data.pic || "",
      days,
      lockedBasics: true,
      status: data.status != null ? data.status : null,
    });
  }

  /** Ids present in `after` but not in `before` (save returns data:null, so we diff lists). */
  function newIds(before, after) {
    const b = new Set(before.map(Number));
    return after.map(Number).filter((id) => !b.has(id));
  }

  return {
    MAX_WEEKS,
    parseDate, formatDate, formatDateTime, today, addDays, diffDays, weekdayOf, mondayOf,
    trainingDates, groupByWeek, toItem, moveInArray, distribute,
    createDraft, draftDates, regenerate, setDayItems, addItem, removeItem, replaceItem, moveItem, applyToDates,
    validate, toSavePayload, fromPlanGet, newIds,
  };
});
