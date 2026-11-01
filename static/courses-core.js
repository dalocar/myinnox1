/* Courses screen - pure logic (no DOM). Browser global `CoursesCore`, Node
   module.exports. Needs MovementsCore (normalize/paginate), loaded first.
   Data facts (real /course/list, see docs/plan-courses-screen.md):
   level 1/2/3 = difficulty, courseType 1..5 = topic, duration in minutes,
   partsList = accessory ids (strings). */
(function (root, factory) {
  const mc = typeof module !== "undefined" && module.exports ? require("./movements-core.js") : root.MovementsCore;
  const api = factory(mc);
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.CoursesCore = api;
})(typeof self !== "undefined" ? self : this, function (MC) {
  // English names are the i18n keys. Only confirmed ids get a label; unknown
  // accessory ids are never offered as filters.
  const TOPICS = { 1: "Fat loss", 2: "Stretching", 3: "Strength", 4: "Conditioning", 5: "Themed training" };
  const LEVELS = { 1: "Beginner", 2: "Intermediate", 3: "Advanced" };
  const ACCESSORIES = {
    1: "Handles", 2: "Ankle straps", 3: "Barbell", 4: "Belt", 5: "Triceps rope", 6: "Adjustable bench", 14: "Pull-up bar",
  };
  // "Up to N min" options (assumption: the official app's 10/20/30/40 are upper bounds).
  const DURATION_BUCKETS = [10, 20, 30, 40];

  const str = (v) => (v === undefined || v === null || v === "" ? null : String(v));
  const accessoriesOf = (c) => (Array.isArray(c && c.partsList) ? c.partsList.map(String) : []);
  const toSet = (x) => (x instanceof Set ? x : new Set((x || []).map(String)));

  // AND across groups, OR within topics/levels/accessories. maxDuration: number|null (<=).
  function filterCourses(list, { query = "", topics, levels, maxDuration = null, accessories } = {}) {
    const q = MC.normalize(query);
    const T = toSet(topics), L = toSet(levels), A = toSet(accessories);
    const max = maxDuration === null || maxDuration === undefined || maxDuration === "" ? null : Number(maxDuration);
    return (list || []).filter((c) => {
      if (q && !MC.normalize(c.name).includes(q)) return false;
      if (T.size && !T.has(str(c.courseType))) return false;
      if (L.size && !L.has(str(c.level))) return false;
      if (max !== null && !(Number(c.duration) <= max)) return false;
      if (A.size && !accessoriesOf(c).some((p) => A.has(p))) return false;
      return true;
    });
  }

  // Options that exist in the data and have a confirmed label; a facet with
  // fewer than 2 options is hidden ([]).
  function facetsFrom(list) {
    const topics = new Set(), levels = new Set(), acc = new Set();
    let durations = 0;
    const mins = [];
    for (const c of list || []) {
      const ty = str(c.courseType); if (ty && TOPICS[ty]) topics.add(ty);
      const lv = str(c.level); if (lv && LEVELS[lv]) levels.add(lv);
      accessoriesOf(c).forEach((p) => { if (ACCESSORIES[p]) acc.add(p); });
      if (Number.isFinite(Number(c.duration)) && c.duration !== null) mins.push(Number(c.duration));
    }
    const ordered = (obj, set) => Object.keys(obj).filter((k) => set.has(k));
    const buckets = DURATION_BUCKETS.filter((b) => mins.some((m) => m <= b));
    const f = {
      topics: ordered(TOPICS, topics),
      levels: ordered(LEVELS, levels),
      durations: buckets,
      accessories: ordered(ACCESSORIES, acc),
    };
    for (const k of Object.keys(f)) if (f[k].length < 2) f[k] = [];
    return f;
  }

  // Number of active groups inside the Filters panel (topics are their own chip row).
  function countPanelActive({ levels, maxDuration, accessories } = {}) {
    const has = maxDuration !== null && maxDuration !== undefined && maxDuration !== "";
    return (toSet(levels).size ? 1 : 0) + (has ? 1 : 0) + (toSet(accessories).size ? 1 : 0);
  }
  function countActive(f = {}) {
    return countPanelActive(f) + (toSet(f.topics).size ? 1 : 0);
  }

  // Normalised steps of /course/detail for the read-only modal.
  // Official programs keep warm-up (stage 1) and stretch (stage 3) steps in their own lists;
  // custom actions of type Warm-up / Stretch land there too. Order: warm-up, main, stretch.
  function stepsOf(detail) {
    const d = detail || {};
    const pick = (arr, stage) => (Array.isArray(arr) ? arr : []).map((s) => ({
      name: s.actionName || s.name || "", picUrl: s.picUrl || "", videoUrl: s.videoUrl || "",
      reps: s.count == null ? null : Number(s.count), sets: s.groupNum == null ? null : Number(s.groupNum), stage,
    }));
    return [...pick(d.warmUpStepList, "warmup"), ...pick(d.mainStepList, "main"), ...pick(d.relaxStepList, "stretch")];
  }

  return {
    TOPICS, LEVELS, ACCESSORIES, DURATION_BUCKETS,
    filterCourses, facetsFrom, countActive, countPanelActive, accessoriesOf, stepsOf,
    paginate: MC.paginate, normalize: MC.normalize,
  };
});
