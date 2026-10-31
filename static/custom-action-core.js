/* Pure helpers for the "Create Action" form (exposed as `CustomActionCore`, Node
   module.exports for tests). Numeric codes were matched against the official app:
   - level (Difficulty): 1 Beginner, 2 Medium/Intermediate, 3 Advanced
   - actionType (Type): 1 Stretch, 2 Warm Up, 3 Strength
   - muscleParts (Part): comma list, ids as MUSCLE_GROUPS in app.js (4 = Arm, ...)
   - countType: 1 Repetition-based, 2 Timer-based
   - sideNum: 1 Per Side, 2 Combined, 0 no weight = Bodyweight-only. Every library action with
     sideNum 0 has countType 2 (94 of 94), matching the official form, which offers only
     "Timer-based" once Bodyweight-only is chosen.
   Confirmed by reading back a created action: name, muscleParts, level, actionType, countType
   and sideNum are accepted by POST /action/add under exactly these names. Bodyweight -> sideNum 0
   is inferred from the library (a bodyweight create could not be captured: the app wants an image). */
(function (root) {
  "use strict";
  const LEVELS = [
    { value: 1, label: "Beginner" },
    { value: 2, label: "Intermediate" },
    { value: 3, label: "Advanced" },
  ];
  const TYPES = [
    { value: 1, label: "Stretching" },
    { value: 2, label: "Warm-up" },
    { value: 3, label: "Strength" },
  ];
  const COUNT = { REPS: 1, TIMER: 2 };
  const SIDE = { NONE: 0, PER_SIDE: 1, COMBINED: 2 };

  // form: {name, parts: [id...], level, actionType, bodyweight, timer, combined, picUrl}
  function buildBody(form) {
    const f = form || {};
    const bodyweight = !!f.bodyweight;
    const body = {
      name: String(f.name || "").trim(),
      muscleParts: Array.from(new Set((f.parts || []).map(String))).sort((a, b) => a - b).join(","),
      level: Number(f.level) || 1,
      actionType: Number(f.actionType) || 3,
      // Bodyweight-only has no weight to count reps against, so the official form forces Timer-based.
      countType: bodyweight || f.timer ? COUNT.TIMER : COUNT.REPS,
      sideNum: bodyweight ? SIDE.NONE : f.combined ? SIDE.COMBINED : SIDE.PER_SIDE,
      consume: 0,
    };
    if (f.picUrl) body.picUrl = String(f.picUrl);
    return body;
  }

  // -> null when fine, else an English i18n key.
  function validate(form) {
    const f = form || {};
    if (!String(f.name || "").trim()) return "Enter a name.";
    if (!(f.parts && f.parts.length)) return "Pick at least one body part.";
    return null;
  }

  // Reverse of buildBody, for showing a stored action as chips.
  function describe(a) {
    const x = a || {};
    const side = Number(x.sideNum);
    return {
      parts: String(x.muscleParts == null ? "" : x.muscleParts).split(",").map((s) => s.trim()).filter(Boolean),
      level: Number(x.level) || null,
      actionType: Number(x.actionType) || null,
      bodyweight: side === SIDE.NONE,
      timer: Number(x.countType) === COUNT.TIMER,
      combined: side === SIDE.COMBINED,
    };
  }

  const api = { LEVELS, TYPES, COUNT, SIDE, buildBody, validate, describe };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.CustomActionCore = api;
})(typeof window !== "undefined" ? window : globalThis);
