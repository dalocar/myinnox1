/* Fitness screen - pure logic (no DOM). Browser global `FitnessCore`, Node
   module.exports. Data facts (real /physicalFitnessTest/last): testType 3 =
   Upper-limb strength (kg, confirmed by the official app), 4 = Lower-limb
   strength (kg) and 2 = Endurance (reps), both inferred from the 2026-10-30
   results (190 / 41) and unit plausibility. Unknown testTypes are kept as
   "extras". */
(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.FitnessCore = api;
})(typeof self !== "undefined" ? self : this, function () {
  // Fixed display order. typeId null = id not known (always "not tested").
  // English names are the i18n keys.
  const SLOTS = [
    { key: "upper", typeId: 3, name: "Upper-limb strength", unit: "kg", decimals: 1, angle: -90 },
    { key: "lower", typeId: 4, name: "Lower-limb strength", unit: "kg", decimals: 1, angle: 30 },
    { key: "endurance", typeId: 2, name: "Endurance", unit: "Reps", decimals: 0, angle: 150 },
  ];
  const FITNESS_TYPES = { 3: "upper", 4: "lower", 2: "endurance" };
  // Level ladder, lowest first. Observed: C, S, S+ (B, A are the assumed middle).
  const LEVELS = ["C", "B", "A", "S", "S+"];
  const SEGMENTS = 5;

  const levelIndex = (letter) => LEVELS.indexOf(String(letter == null ? "" : letter).trim().toUpperCase());
  const num = (v) => { const n = typeof v === "string" && v.trim() === "" ? NaN : Number(v); return Number.isFinite(n) ? n : null; };
  function clampPercent(v) {
    const n = num(v);
    return n === null ? 0 : Math.min(100, Math.max(0, n));
  }

  // Latest test (by testTime, then testId) wins when a type appears twice.
  const newer = (a, b) => {
    const ta = String(a.testTime || ""), tb = String(b.testTime || "");
    if (ta !== tb) return ta > tb;
    return (num(a.testId) || 0) > (num(b.testId) || 0);
  };
  const entry = (r) => ({
    tested: true,
    value: num(r.resultValue) === null ? 0 : Math.max(0, num(r.resultValue)),
    level: r.resultLevel == null || String(r.resultLevel).trim() === "" ? null : String(r.resultLevel).trim().toUpperCase(),
    percent: clampPercent(r.resultLevelPercent),
    date: r.testTime ? String(r.testTime) : null,
    testId: r.testId == null ? null : r.testId,
  });

  // rows -> { slots: [upper, lower, endurance], extras: [unknown testTypes] }
  function normalizeTests(rows) {
    const latest = new Map();
    for (const r of Array.isArray(rows) ? rows : []) {
      if (!r || typeof r !== "object" || r.testType == null || String(r.testType).trim() === "") continue;
      const id = String(r.testType);
      if (!latest.has(id) || newer(r, latest.get(id))) latest.set(id, r);
    }
    const slots = SLOTS.map((s) => {
      const base = { key: s.key, typeId: s.typeId, name: s.name, unit: s.unit, decimals: s.decimals };
      const r = s.typeId !== null ? latest.get(String(s.typeId)) : null;
      return r ? Object.assign(base, entry(r)) : Object.assign(base, { tested: false, value: 0, level: null, percent: 0, date: null, testId: null });
    });
    const extras = [];
    for (const [id, r] of latest) {
      if (FITNESS_TYPES[id]) continue;
      extras.push(Object.assign({ key: "type-" + id, typeId: id, name: null, unit: "", decimals: null, extra: true }, entry(r)));
    }
    return { slots, extras };
  }

  // Filled segments out of 5. Known letter: its ladder position (C=1 ... S+=5).
  // Unknown letter: from resultLevelPercent. Untested: none.
  function segments(level, percent, tested = true) {
    if (!tested) return { filled: 0, total: SEGMENTS };
    const i = levelIndex(level);
    const filled = i >= 0 ? i + 1 : Math.ceil(clampPercent(percent) / (100 / SEGMENTS));
    return { filled: Math.min(SEGMENTS, Math.max(0, filled)), total: SEGMENTS };
  }

  // {text, unit}: 54.7 -> "54.7"/"kg", untested -> "0.0"/"kg" or "0"/"Reps";
  // extras (no known unit) show the raw number.
  // Optional `unit` (0 Metric / 1 Imperial): kg slots convert to lb, other units are untouched.
  function formatValue(slot, unit) {
    let v = slot && slot.tested ? slot.value : 0;
    if (slot && slot.decimals === null) return { text: String(v), unit: "" };
    const d = slot ? slot.decimals : 1;
    let u = slot ? slot.unit : "";
    if (u === "kg" && Number(unit) === 1) { v = Math.round(v * 2.20462 * Math.pow(10, d)) / Math.pow(10, d); u = "lb"; }
    return { text: v.toFixed(d), unit: u };
  }

  // Radar geometry in a square-ish SVG viewBox. Axes: upper top, lower
  // bottom-right, endurance bottom-left. Radius per axis = percent/100, with a
  // small floor so the polygon never collapses.
  const MIN_R = 0.04;
  const RING_STEPS = [0.25, 0.5, 0.75, 1];
  function radarPoints(slots, size = 360) {
    const width = size, height = Math.round(size * 0.7), R = size * 0.3;
    const cx = width / 2, cy = height / 2 + R / 4;
    const at = (deg, f) => ({
      x: +(cx + Math.cos((deg * Math.PI) / 180) * R * f).toFixed(2),
      y: +(cy + Math.sin((deg * Math.PI) / 180) * R * f).toFixed(2),
    });
    const pts = (a) => a.map((p) => p.x + "," + p.y).join(" ");
    const list = (slots || []).slice(0, 3);
    const axes = list.map((s, i) => {
      const def = SLOTS.find((d) => d.key === s.key) || SLOTS[i];
      const tip = at(def.angle, 1), lab = at(def.angle, 1.14);
      return { key: s.key, angle: def.angle, x: tip.x, y: tip.y, labelX: lab.x, labelY: def.angle < 0 ? lab.y - 4 : lab.y + 12 };
    });
    const dots = list.map((s) => {
      const def = SLOTS.find((d) => d.key === s.key);
      const f = Math.max(MIN_R, clampPercent(s.tested ? s.percent : 0) / 100);
      return at(def ? def.angle : 0, f);
    });
    const rings = RING_STEPS.map((f) => pts(list.map((s) => at((SLOTS.find((d) => d.key === s.key) || SLOTS[0]).angle, f))));
    return { width, height, cx, cy, R, axes, rings, dots, polygon: pts(dots) };
  }

  return { SLOTS, FITNESS_TYPES, LEVELS, SEGMENTS, levelIndex, clampPercent, normalizeTests, segments, formatValue, radarPoints };
});
