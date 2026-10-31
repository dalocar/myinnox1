/* Program export / import / clone - pure logic (no DOM). Browser global
   `ProgramIOCore`, Node module.exports.
   Weights are the server's stored values (tenths of a kg) and are NEVER
   converted here, so export files do not depend on the account unit setting.
   Export = the `course/custom/detail` object minus identity/server fields
   (denylist, not whitelist: `course/custom/save` needs the full object and we
   only know the safe-to-drop fields). Errors are returned as codes + params so
   the screen can translate them. */
(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.ProgramIOCore = api;
})(typeof self !== "undefined" ? self : this, function () {
  const FORMAT = "myinnox1-program";
  const FORMAT_VERSION = 1;
  const STEP_LISTS = ["warmUpStepList", "mainStepList", "relaxStepList"];
  // Server identity / bookkeeping fields: never exported, never sent on create.
  const STRIP_COURSE = ["id", "courseNo", "createTime", "updateTime", "createBy", "updateBy", "userId", "collected"];
  const STRIP_STEP = ["id", "courseId", "createTime", "updateTime"];
  const DEFAULT_COVER = "https://power.renhesports.com/filestore/power/course/COVER_RACK_1_4.jpg";
  // Same shape as blankCourseTemplate() in app.js; fills fields a hand-edited file may omit.
  const DEFAULTS = {
    level: 1, courseType: 1, smallImg: DEFAULT_COVER, detailsImg: DEFAULT_COVER,
    deviceCategory: 7, sportType: 2, muscleParts: "1", tags: null, custom: null,
    heartRateMin: 0, heartRateMax: 0, actionNum: null,
    description: "", deviceTypeList: ["35"], partsList: ["1"],
  };

  const isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
  const clone = (v) => JSON.parse(JSON.stringify(v));
  const num = (v) => (typeof v === "number" && Number.isFinite(v));

  function sanitizeStep(step) {
    const s = clone(step);
    for (const k of STRIP_STEP) delete s[k];
    return s;
  }

  // course/custom/detail object -> portable program (no ids, steps cloned).
  function sanitizeProgram(course) {
    const p = clone(course);
    for (const k of STRIP_COURSE) delete p[k];
    for (const l of STEP_LISTS) p[l] = (Array.isArray(course[l]) ? course[l] : []).map(sanitizeStep);
    return p;
  }

  function buildExport(courses, opts = {}) {
    const list = Array.isArray(courses) ? courses : [courses];
    return {
      format: FORMAT,
      formatVersion: FORMAT_VERSION,
      exportedAt: new Date(opts.now ?? Date.now()).toISOString(),
      app: opts.appVersion ? `MyInnoX1 ${opts.appVersion}` : "MyInnoX1",
      programs: list.map(sanitizeProgram),
    };
  }

  // ---- validation ----
  // Returns an array of {code, field?, ...params}; empty = valid.
  function validateStep(step, list, i) {
    const where = { list, step: i + 1 };
    if (!isObj(step)) return [{ code: "step-not-object", ...where }];
    const errs = [];
    if (!num(step.actionLibraryId)) errs.push({ code: "step-field", field: "actionLibraryId", ...where });
    for (const f of ["count", "groupNum", "restTime", "sideWeight"]) {
      if (f in step && step[f] !== null && (!num(step[f]) || step[f] < 0)) errs.push({ code: "step-field", field: f, ...where });
    }
    if ("sideWeight" in step && num(step.sideWeight) && !Number.isInteger(step.sideWeight)) {
      errs.push({ code: "step-field", field: "sideWeight", ...where });
    }
    return errs;
  }

  function validateProgram(p) {
    if (!isObj(p)) return [{ code: "program-not-object" }];
    const errs = [];
    if (typeof p.name !== "string" || !p.name.trim()) errs.push({ code: "no-name" });
    let steps = 0;
    for (const l of STEP_LISTS) {
      if (p[l] === undefined || p[l] === null) continue;
      if (!Array.isArray(p[l])) { errs.push({ code: "list-not-array", list: l }); continue; }
      steps += p[l].length;
      p[l].forEach((s, i) => errs.push(...validateStep(s, l, i)));
    }
    if (!steps) errs.push({ code: "no-steps" });
    return errs;
  }

  // text -> {programs: [{name, program, errors: []}], fatal: null | {code, ...}}
  // Invalid programs are kept in the list with their errors so the preview can
  // show why they are not importable; the caller imports only errors.length === 0.
  function parseImport(text) {
    let data;
    try { data = JSON.parse(String(text).replace(/^﻿/, "")); } catch { return { programs: [], fatal: { code: "bad-json" } }; }
    if (!isObj(data) || data.format !== FORMAT) return { programs: [], fatal: { code: "wrong-format" } };
    if (!num(data.formatVersion) || data.formatVersion < 1) return { programs: [], fatal: { code: "wrong-format" } };
    if (data.formatVersion > FORMAT_VERSION) return { programs: [], fatal: { code: "newer-version", version: data.formatVersion } };
    if (!Array.isArray(data.programs) || !data.programs.length) return { programs: [], fatal: { code: "no-programs" } };
    const programs = data.programs.map((p) => ({
      name: isObj(p) && typeof p.name === "string" ? p.name.trim() : "",
      program: p,
      errors: validateProgram(p),
    }));
    return { programs, fatal: null };
  }

  // ---- names ----
  const key = (s) => String(s ?? "").trim().toLowerCase();
  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  // "Name" -> "Name (copy)" -> "Name (copy 2)" ... skipping names already used.
  // A source that already ends in "(copy)" / "(copy N)" is reduced to its base first.
  function cloneName(name, existingNames, copyWord = "copy") {
    const used = new Set((existingNames || []).map(key));
    const base = String(name ?? "").trim().replace(new RegExp(`\\s*\\(${esc(copyWord)}(?:\\s+\\d+)?\\)$`, "i"), "") || String(name ?? "").trim();
    const make = (n) => `${base} (${copyWord}${n > 1 ? " " + n : ""})`.trim();
    let n = 1;
    while (used.has(key(make(n)))) n++;
    return make(n);
  }

  // Import: keep the name when free, otherwise use the copy naming.
  // Upstream error text may be in Chinese whatever the UI language is. Keep it
  // only when it is readable (no CJK); otherwise show the translated fallback.
  function safeMessage(err, fallback) {
    const m = err && typeof err.message === "string" ? err.message.trim() : "";
    return m && !/[\u3000-\u9fff\uf900-\ufaff\uff00-\uffef]/.test(m) ? m : fallback;
  }

  function uniqueName(name, existingNames, copyWord = "copy") {
    const used = new Set((existingNames || []).map(key));
    const n = String(name ?? "").trim();
    return n && !used.has(key(n)) ? n : cloneName(n, existingNames, copyWord);
  }

  // Portable program (or a fresh detail response) -> body for course/custom/save
  // WITHOUT id (create). Fills omitted top-level fields, renumbers `sort`, and
  // recomputes duration/capacity only when the file does not carry usable ones.
  function toSaveBody(program, opts = {}) {
    const body = Object.assign({}, clone(DEFAULTS), sanitizeProgram(program));
    if (opts.name != null) body.name = String(opts.name).trim();
    for (const l of STEP_LISTS) body[l].forEach((s, i) => { s.sort = i + 1; });
    if (!num(body.duration) || body.duration <= 0) body.duration = body.mainStepList.reduce((s, st) => s + (st.duration || 1), 0);
    if (!num(body.capacity)) body.capacity = body.mainStepList.reduce((s, st) => s + (st.consume || 0) * 10, 0);
    return body;
  }

  // ---- filenames ----
  function slug(name) {
    const s = String(name ?? "").normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase()
      .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
    return s || "program";
  }
  const ymd = (d) => new Date(d).toISOString().slice(0, 10);
  function exportFilename(programs, now = Date.now()) {
    const list = Array.isArray(programs) ? programs : [programs];
    const stem = list.length === 1 ? slug(list[0].name) : `all-${list.length}`;
    return `myinnox1-${stem}-${ymd(now)}.json`;
  }

  return {
    FORMAT, FORMAT_VERSION, STEP_LISTS, STRIP_COURSE, STRIP_STEP,
    sanitizeProgram, buildExport, validateProgram, parseImport,
    cloneName, uniqueName, safeMessage, toSaveBody, slug, exportFilename,
  };
});
