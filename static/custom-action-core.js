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
   is inferred from the library (a bodyweight create could not be captured: the app wants an image).
   Pictures are uploaded first (see UPLOAD below) and the returned URL is sent as picUrl. */
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
    // POST /action/add with an id updates that action in place (same id and actionNo; the stored image is kept).
    if (f.id) body.id = Number(f.id);
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

  // Stored action -> form state, to edit it.
  function toForm(a) {
    const d = describe(a);
    return { id: a && a.id, name: (a && a.name) || "", parts: d.parts, level: d.level || 1, actionType: d.actionType || 3,
      bodyweight: d.bodyweight, timer: d.timer, combined: d.combined };
  }

  // ---- Picture upload: POST /api/file/upload (multipart), captured from the official app ----
  // Parts: `usage` (REQUIRED; 6 = action picture, without it upstream answers an opaque 500),
  // `extraParam` ("0", optional: only adds the "_0" suffix to the stored name) and `file`
  // (any filename; image/jpeg and the app's image/jpg both work). Response `data` is the hosted URL,
  // which goes into `picUrl` of /action/add.
  const UPLOAD = { USAGE_ACTION_PIC: 6, MAX_EDGE: 1024, TYPES: ["image/jpeg", "image/png"] };

  function uploadFields() {
    return { usage: String(UPLOAD.USAGE_ACTION_PIC), extraParam: "0" };
  }

  // file: {type, size} -> null when fine, else an English i18n key.
  function validateImage(file) {
    if (!file || !UPLOAD.TYPES.includes(String(file.type).toLowerCase()) || !(file.size > 0)) return "Choose a JPEG or PNG image.";
    return null;
  }

  // Fit inside a max x max box, never upscale. -> {width, height, scaled}
  function fitSize(w, h, max) {
    const m = max || UPLOAD.MAX_EDGE;
    const W = Math.max(1, Math.round(Number(w) || 0)), H = Math.max(1, Math.round(Number(h) || 0));
    if (W <= m && H <= m) return { width: W, height: H, scaled: false };
    const k = m / Math.max(W, H);
    return { width: Math.max(1, Math.round(W * k)), height: Math.max(1, Math.round(H * k)), scaled: true };
  }

  // Upload response -> hosted URL; throws when upstream gave none.
  function uploadUrl(res) {
    const u = res && res.data;
    if (typeof u !== "string" || !/^https?:\/\//.test(u)) throw new Error("Upload returned no image URL");
    return u;
  }

  const api = { LEVELS, TYPES, COUNT, SIDE, UPLOAD, buildBody, validate, describe, toForm, uploadFields, validateImage, fitSize, uploadUrl };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.CustomActionCore = api;
})(typeof window !== "undefined" ? window : globalThis);
