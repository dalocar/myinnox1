/* Training mode of a program step, from its `mode` and `modeParam` (pure, no DOM; exposed as
   `StepModeCore`, Node module.exports for tests). Captured from the official app's program
   editor and read back from course/custom/detail:
     0 Standard   modeParam "{}"                                  (the step's plain sideWeight)
     1 Eccentric  kgLX1 = eccentric force, kgLX2 = concentric force      (kg x 10)
     2 Spring     kgTL1 = initial force, kgTL2 = max force (kg x 10), kgTL3 = length (mm)
     3 Isokinetic kgSD1 = speed (mm/s)
   Imperial accounts: the official app also writes the force values in pounds, as `lbLX1/2` and
   `lbTL1/2` (tenths of a lb, = tenths of kg x 2.20462, e.g. 150 -> lbLX1 331), next to the kg keys; metric
   accounts write kg only. The kg keys stay the source of truth: the official app labels the kg number
   "lbs" in imperial and stores what is typed as kg, which is wrong. We show and convert correctly.
   The upstream does not validate any of this (mode 9 and empty params are stored as sent), so
   validation is ours. Unknown modes (official library courses use 6) are kept untouched. */
(function (root) {
  "use strict";
  // unit: "force" = tenths of a kg (shown in the account unit), "mm" = millimetres (shown in metres).
  const MODES = [
    { id: 0, key: "standard", label: "Standard", fields: [] },
    { id: 1, key: "eccentric", label: "Eccentric", fields: [
      { key: "kgLX1", lb: "lbLX1", label: "Eccentric (kg)", unit: "force", def: 150 },
      { key: "kgLX2", lb: "lbLX2", label: "Concentric (kg)", unit: "force", def: 100 },
    ] },
    { id: 2, key: "spring", label: "Spring", fields: [
      { key: "kgTL1", lb: "lbTL1", label: "Initial force (kg)", unit: "force", def: 100 },
      { key: "kgTL2", lb: "lbTL2", label: "Max force (kg)", unit: "force", def: 150 },
      { key: "kgTL3", label: "Length (m)", unit: "mm", def: 500 },
    ] },
    { id: 3, key: "isokinetic", label: "Isokinetic", fields: [
      { key: "kgSD1", label: "Speed (m/s)", unit: "mm", def: 500 },
    ] },
  ];
  // Caps in stored units. Force: 60 kg (= 132.3 lb) per cable, the OMNI X1 Pro's published 120 kg total over two
  // cables; an eccentric force of exactly 600 was also saved by the official app. Length and speed: sanity caps
  // (5 m, 5 m/s), the real limits are unknown.
  const MAX = { force: 600, mm: 5000 };
  const LB_PER_KG = 2.20462;
  const toLbTenths = (kgTenths) => Math.round(kgTenths * LB_PER_KG);
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

  const clean = (v, fallback, max) => {
    const n = Math.round(Number(v));
    return Number.isFinite(n) && n >= 0 ? (max ? Math.min(n, max) : n) : fallback;
  };
  const cap = (f) => MAX[f.unit];

  // values(step) -> {key: stored integer} for the step's mode, defaults for missing/invalid keys.
  function values(step) {
    const m = modeOf(step);
    const param = parseParam(step && step.modeParam);
    const out = {};
    if (m.def) m.def.fields.forEach((f) => { out[f.key] = clean(param[f.key], f.def, cap(f)); });
    return out;
  }

  // serialize(modeId, values, {lb}) -> compact JSON string with only that mode's keys; Standard -> "{}".
  // With lb, the force fields are also written in pounds (lb keys after the kg keys, like the official app).
  function serialize(modeId, vals, opts) {
    const def = byId(modeId);
    if (!def || !def.fields.length) return "{}";
    const o = {};
    def.fields.forEach((f) => { o[f.key] = clean(vals && vals[f.key], f.def, cap(f)); });
    if (opts && opts.lb) def.fields.forEach((f) => { if (f.lb) o[f.lb] = toLbTenths(o[f.key]); });
    return JSON.stringify(o);
  }

  const allLbKeys = MODES.flatMap((m) => m.fields.filter((f) => f.lb).map((f) => f.lb));
  const hasLb = (param) => allLbKeys.some((k) => k in param);
  // Write lb keys when the account is imperial (opts.imperial), or when the step already carries some, so
  // they never go stale after a kg edit.
  const wantsLb = (step, opts) => !!(opts && opts.imperial) || hasLb(parseParam(step && step.modeParam));

  // Switch a step to another mode (known modes only), keeping values the step already has for it.
  function setMode(step, modeId, opts) {
    const def = byId(modeId);
    if (!def) return step;
    const lb = wantsLb(step, opts);
    const had = modeOf(step).id === def.id ? values(step) : {};
    step.mode = def.id;
    step.modeParam = serialize(def.id, had, { lb });
    return step;
  }

  // Change one field of the step's current mode. `stored` is already in stored units.
  function setValue(step, key, stored, opts) {
    const m = modeOf(step);
    if (!m.def || !m.def.fields.some((f) => f.key === key)) return step;
    const v = values(step);
    const f = m.def.fields.find((x) => x.key === key);
    v[key] = clean(stored, v[key], cap(f));
    step.modeParam = serialize(m.id, v, { lb: wantsLb(step, opts) });
    return step;
  }

  // A step with no weight (sideNum 0: warm-ups, bodyweight) has nothing to apply a mode to.
  const supportsMode = (step) => Number(step && step.sideNum) !== 0;

  // Bulk: set a mode on every step that supports it and is not an unknown mode. Returns the number changed.
  function setModeAll(steps, modeId, opts) {
    let n = 0;
    (steps || []).forEach((s) => {
      if (!supportsMode(s) || !modeOf(s).known || modeOf(s).id === Number(modeId)) return;
      setMode(s, modeId, opts);
      n += 1;
    });
    return n;
  }

  // Does the raw modeParam lack a usable value (or a matching lb value, see wantsLb) for any field of the step's known non-standard mode?
  // Such a step shows defaults in the editor; it is rewritten with them on save (see normalize).
  function needsNormalize(step, opts) {
    const m = modeOf(step);
    if (!m.def || !m.def.fields.length) return false;
    const param = parseParam(step.modeParam);
    const usable = (x) => x !== null && x !== "" && Number.isFinite(Number(x)) && Number(x) >= 0;
    if (m.def.fields.some((f) => !usable(param[f.key]))) return true;
    // lb keys wanted but missing, or out of step with the kg value (more than 0.1 lb off)
    return wantsLb(step, opts) && m.def.fields.some((f) => f.lb && !(usable(param[f.lb]) && Math.abs(Number(param[f.lb]) - toLbTenths(clean(param[f.key], f.def, cap(f)))) <= 1));
  }

  // Write the effective values (stored ones, defaults for missing/invalid) back to modeParam. Returns true if changed.
  function normalize(step, opts) {
    if (!needsNormalize(step, opts)) return false;
    step.modeParam = serialize(modeOf(step).id, values(step), { lb: wantsLb(step, opts) });
    return true;
  }

  // -> null when fine, else an English i18n key. Checks the values the editor shows (defaults included).
  function validate(step) {
    const m = modeOf(step);
    if (!m.def || !m.def.fields.length) return null;
    const v = values(step);
    for (const f of m.def.fields) {
      if (!(v[f.key] > 0)) return f.unit === "force" ? "Enter a force above zero." : "Enter a value above zero.";
    }
    return null;
  }

  const api = { MODES, MAX, LB_PER_KG, toLbTenths, DESCRIPTIONS, byId, modeOf, values, serialize, setMode, setValue, supportsMode, setModeAll, needsNormalize, normalize, validate };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.StepModeCore = api;
})(typeof window !== "undefined" ? window : globalThis);
