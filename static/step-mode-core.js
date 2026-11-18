/* Training mode of a program step, from its `mode` and `modeParam` (pure, no DOM; exposed as
   `StepModeCore`, Node module.exports for tests). Captured from the official app's program
   editor and read back from course/custom/detail:
     0 Standard   modeParam "{}"                                  (the step's plain sideWeight)
     1 Eccentric  kgLX1 = eccentric force, kgLX2 = concentric force      (kg x 10)
     2 Spring     kgTL1 = initial force, kgTL2 = max force (kg x 10), kgTL3 = length (mm)
     3 Isokinetic kgSD1 = speed (mm/s)
   The upstream does not validate any of this (mode 9 and empty params are stored as sent), so
   validation is ours. Unknown modes (official library courses use 6) are kept untouched. */
(function (root) {
  "use strict";
  // unit: "force" = tenths of a kg (shown in the account unit), "mm" = millimetres (shown in metres).
  const MODES = [
    { id: 0, key: "standard", label: "Standard", fields: [] },
    { id: 1, key: "eccentric", label: "Eccentric", fields: [
      { key: "kgLX1", label: "Eccentric (kg)", unit: "force", def: 150 },
      { key: "kgLX2", label: "Concentric (kg)", unit: "force", def: 100 },
    ] },
    { id: 2, key: "spring", label: "Spring", fields: [
      { key: "kgTL1", label: "Initial force (kg)", unit: "force", def: 100 },
      { key: "kgTL2", label: "Max force (kg)", unit: "force", def: 150 },
      { key: "kgTL3", label: "Length (m)", unit: "mm", def: 500 },
    ] },
    { id: 3, key: "isokinetic", label: "Isokinetic", fields: [
      { key: "kgSD1", label: "Speed (m/s)", unit: "mm", def: 500 },
    ] },
  ];
  const DESCRIPTIONS = {
    0: "Pull-out and return force are equal.",
    1: "Pull-out force is lower than the return force.",
    2: "Resistance rises with the distance pulled.",
    3: "Resistance rises with pull speed.",
  };

  const byId = (id) => MODES.find((m) => m.id === Number(id)) || null;

  // modeOf(step) -> {id, known, def} ; missing mode counts as Standard.
  function modeOf(step) {
    const raw = step && step.mode;
    const id = raw === null || raw === undefined || raw === "" ? 0 : Number(raw);
    const def = Number.isFinite(id) ? byId(id) : null;
    return { id: Number.isFinite(id) ? id : 0, known: !!def, def };
  }

  function parseParam(modeParam) {
    if (modeParam && typeof modeParam === "object") return modeParam;
    try {
      const o = JSON.parse(modeParam || "{}");
      return o && typeof o === "object" && !Array.isArray(o) ? o : {};
    } catch { return {}; }
  }

  const clean = (v, fallback) => {
    const n = Math.round(Number(v));
    return Number.isFinite(n) && n >= 0 ? n : fallback;
  };

  // values(step) -> {key: stored integer} for the step's mode, defaults for missing/invalid keys.
  function values(step) {
    const m = modeOf(step);
    const param = parseParam(step && step.modeParam);
    const out = {};
    if (m.def) m.def.fields.forEach((f) => { out[f.key] = clean(param[f.key], f.def); });
    return out;
  }

  // serialize(modeId, values) -> compact JSON string with only that mode's keys; Standard -> "{}".
  function serialize(modeId, vals) {
    const def = byId(modeId);
    if (!def || !def.fields.length) return "{}";
    const o = {};
    def.fields.forEach((f) => { o[f.key] = clean(vals && vals[f.key], f.def); });
    return JSON.stringify(o);
  }

  // Switch a step to another mode (known modes only), keeping values the step already has for it.
  function setMode(step, modeId) {
    const def = byId(modeId);
    if (!def) return step;
    const had = modeOf(step).id === def.id ? values(step) : {};
    step.mode = def.id;
    step.modeParam = serialize(def.id, had);
    return step;
  }

  // Change one field of the step's current mode. `stored` is already in stored units.
  function setValue(step, key, stored) {
    const m = modeOf(step);
    if (!m.def || !m.def.fields.some((f) => f.key === key)) return step;
    const v = values(step);
    v[key] = clean(stored, v[key]);
    step.modeParam = serialize(m.id, v);
    return step;
  }

  // A step with no weight (sideNum 0: warm-ups, bodyweight) has nothing to apply a mode to.
  const supportsMode = (step) => Number(step && step.sideNum) !== 0;

  // Bulk: set a mode on every step that supports it and is not an unknown mode. Returns the number changed.
  function setModeAll(steps, modeId) {
    let n = 0;
    (steps || []).forEach((s) => {
      if (!supportsMode(s) || !modeOf(s).known || modeOf(s).id === Number(modeId)) return;
      setMode(s, modeId);
      n += 1;
    });
    return n;
  }

  // -> null when fine, else an English i18n key. Only for steps in a known, non-standard mode.
  function validate(step) {
    const m = modeOf(step);
    if (!m.def || !m.def.fields.length) return null;
    const param = parseParam(step.modeParam);
    for (const f of m.def.fields) {
      const n = Number(param[f.key]);
      if (!(n > 0)) return f.unit === "force" ? "Enter a force above zero." : "Enter a value above zero.";
    }
    return null;
  }

  const api = { MODES, DESCRIPTIONS, byId, modeOf, values, serialize, setMode, setValue, supportsMode, setModeAll, validate };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.StepModeCore = api;
})(typeof window !== "undefined" ? window : globalThis);
