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
   Limits measured in the official app's editor (typing extremes into each field; the server enforces none):
     Eccentric 3-60 kg, Concentric 2-59 kg, Spring initial 2-59 kg, max 3-60 kg, length ~0.02-2.5 m,
     Isokinetic speed 0.1-2.5 m/s. Force steps are 0.5 (in the display unit), length and speed 0.01.
     The app keeps Concentric below Eccentric (and Max force above Initial) only when you edit the first of
     each pair; we enforce both pairs in both directions.
   Imperial accounts with untouched defaults: the official app saves ONLY the lb keys ({"lbLX1":150,"lbLX2":200}
   for Eccentric, {"lbTL1":200,"lbTL2":250,"kgTL3":500} for Spring: its imperial defaults are 15/20 lb and 20/25 lb,
   not the metric 15/10 kg converted), no kg keys. Once a value is edited it writes both. We read lb when kg is missing.
   The upstream does not validate any of this (mode 9 and empty params are stored as sent), so
   validation is ours. Unknown modes (official library courses use 6) are kept untouched. */
(function (root) {
  "use strict";
  // unit: "force" = tenths of a kg (shown in the account unit), "mm" = millimetres (shown in metres).
  const MODES = [
    { id: 0, key: "standard", label: "Standard", fields: [] },
    { id: 1, key: "eccentric", label: "Eccentric", fields: [
      { key: "kgLX1", lb: "lbLX1", label: "Eccentric (kg)", unit: "force", def: 150, min: 30, max: 600, step: 0.5 },
      { key: "kgLX2", lb: "lbLX2", label: "Concentric (kg)", unit: "force", def: 100, min: 20, max: 590, step: 0.5 },
    ] },
    { id: 2, key: "spring", label: "Spring", fields: [
      { key: "kgTL1", lb: "lbTL1", label: "Initial force (kg)", unit: "force", def: 100, min: 20, max: 590, step: 0.5 },
      { key: "kgTL2", lb: "lbTL2", label: "Max force (kg)", unit: "force", def: 150, min: 30, max: 600, step: 0.5 },
      { key: "kgTL3", label: "Length (m)", unit: "mm", def: 500, min: 20, max: 2500, step: 0.01 },
    ] },
    { id: 3, key: "isokinetic", label: "Isokinetic", fields: [
      { key: "kgSD1", label: "Speed (m/s)", unit: "mm", def: 500, min: 100, max: 2500, step: 0.01 },
    ] },
  ];
  // Per-field ranges (min/max, stored units) are measured in the official app, see above; 60 kg (132.3 lb) is
  // the top force, in line with the OMNI X1 Pro's published 120 kg over two cables.
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

  // Round to an integer and clamp into the field's range; invalid input returns the fallback.
  const clean = (v, fallback, f) => {
    const n = Math.round(Number(v));
    if (!Number.isFinite(n)) return fallback;
    return f ? Math.min(f.max, Math.max(f.min, n)) : Math.max(0, n);
  };

  const usableNum = (x) => x !== null && x !== undefined && x !== "" && Number.isFinite(Number(x)) && Number(x) >= 0;
  const fromLbTenths = (lb) => Math.round(Number(lb) / LB_PER_KG);

  // values(step) -> {key: stored integer} for the step's mode (tenths of kg for forces, mm for length and speed).
  // The kg key wins; when it is missing the lb key is used (the official app saves ONLY lb keys when an imperial
  // account leaves the defaults untouched, e.g. {"lbLX1":150,"lbLX2":200}); otherwise the default.
  function values(step) {
    const m = modeOf(step);
    const param = parseParam(step && step.modeParam);
    const out = {};
    if (m.def) m.def.fields.forEach((f) => {
      const fallback = f.lb && usableNum(param[f.lb]) ? fromLbTenths(param[f.lb]) : f.def;
      out[f.key] = clean(param[f.key], fallback, f);
    });
    return out;
  }

  // Pairs that must stay ordered, enforced both ways: Concentric at least 1 kg below Eccentric; Spring max at
  // least 0.5 kg above Initial. Both stay inside their ranges (Eccentric min 3 kg, Initial max 59 kg).
  function pairs(modeId, o) {
    if (modeId === 1) o.kgLX2 = Math.min(o.kgLX2, o.kgLX1 - 10);
    if (modeId === 2) o.kgTL2 = Math.max(o.kgTL2, o.kgTL1 + 5);
    return o;
  }

  // serialize(modeId, values, {lb, prev, typed, pairs}) -> compact JSON string with only that mode's keys; Standard -> "{}".
  // With lb, the force fields are also written in pounds (lb keys after the kg keys, like the official app).
  // An lb value is kept as is when it already matches the kg value (within 0.1 lb): `typed` ({kgKey: lb tenths},
  // what the user just typed) first, then `prev` (the step's current param). Otherwise it is derived from kg, so
  // a typed 40.0 lb stays 400 instead of drifting to 399 through the 0.1 kg storage.
  function serialize(modeId, vals, opts) {
    const def = byId(modeId);
    if (!def || !def.fields.length) return "{}";
    const o = {};
    def.fields.forEach((f) => { o[f.key] = clean(vals && vals[f.key], f.def, f); });
    if (opts && opts.pairs) pairs(def.id, o);
    if (opts && opts.lb) {
      const typed = opts.typed || {}, prev = opts.prev || {};
      def.fields.forEach((f) => {
        if (!f.lb) return;
        const want = toLbTenths(o[f.key]);
        const near = (x) => x !== undefined && x !== null && x !== "" && Number.isFinite(Number(x)) && Math.abs(Number(x) - want) <= 1;
        o[f.lb] = near(typed[f.key]) ? Math.round(Number(typed[f.key])) : near(prev[f.lb]) ? Math.round(Number(prev[f.lb])) : want;
      });
    }
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
    step.modeParam = serialize(def.id, had, { lb, prev: parseParam(step.modeParam), pairs: true });
    return step;
  }

  // Change one field of the step's current mode. `stored` is already in stored units.
  function setValue(step, key, stored, opts) {
    const m = modeOf(step);
    if (!m.def || !m.def.fields.some((f) => f.key === key)) return step;
    const v = values(step);
    const f = m.def.fields.find((x) => x.key === key);
    v[key] = clean(stored, v[key], f);
    step.modeParam = serialize(m.id, v, { lb: wantsLb(step, opts), prev: parseParam(step.modeParam), typed: opts && opts.typed && { [key]: opts.typed }, pairs: true });
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

  // lbValues(step) -> {kgKey: lb tenths} for force fields whose stored lb key matches the kg value (within 0.1 lb);
  // what an imperial editor shows, so a typed 100.0 lb reads back 100.0 and not 100.1.
  function lbValues(step) {
    const m = modeOf(step);
    const out = {};
    if (!m.def) return out;
    const param = parseParam(step && step.modeParam);
    const v = values(step);
    m.def.fields.forEach((f) => {
      const x = param[f.lb];
      if (f.lb && x !== null && x !== "" && Number.isFinite(Number(x)) && Math.abs(Number(x) - toLbTenths(v[f.key])) <= 1) out[f.key] = Number(x);
    });
    return out;
  }

  // Does the raw modeParam lack a usable value (or a matching lb value, see wantsLb) for any field of the step's known non-standard mode?
  // Such a step shows defaults in the editor; it is rewritten with them on save (see normalize).
  function needsNormalize(step, opts) {
    const m = modeOf(step);
    if (!m.def || !m.def.fields.length) return false;
    const param = parseParam(step.modeParam);
    const usable = usableNum;
    if (m.def.fields.some((f) => !usable(param[f.key]))) return true;
    // lb keys wanted but missing, or out of step with the kg value (more than 0.1 lb off)
    return wantsLb(step, opts) && m.def.fields.some((f) => f.lb && !(usable(param[f.lb]) && Math.abs(Number(param[f.lb]) - toLbTenths(values(step)[f.key])) <= 1));
  }

  // Write the effective values (stored ones, defaults for missing/invalid) back to modeParam. Returns true if changed.
  function normalize(step, opts) {
    if (!needsNormalize(step, opts)) return false;
    step.modeParam = serialize(modeOf(step).id, values(step), { lb: wantsLb(step, opts), prev: parseParam(step.modeParam) });
    return true;
  }

  const api = { MODES, LB_PER_KG, fromLbTenths, toLbTenths, DESCRIPTIONS, byId, modeOf, values, serialize, setMode, setValue, supportsMode, setModeAll, needsNormalize, normalize, lbValues };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.StepModeCore = api;
})(typeof window !== "undefined" ? window : globalThis);
