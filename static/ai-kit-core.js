/* AI kit - pure logic (no DOM). Browser global `AIKitCore`, Node module.exports.
   1. Library export for AI: names instead of numeric codes (libraryForAI, libraryTable).
   2. The prompt / format guide (one versioned constant, buildPrompt, buildGuide).
   3. Format `myinnox1-routines` v1: parseRoutines validates what an AI wrote and
      hydrates the heavy step fields from the library (hydrateStep), producing the
      same step object as addStepFromAction() in app.js. The result is a portable
      program that goes through ProgramIOCore.toSaveBody() like any other import.
   Weights in this format are plain kg whatever the account unit; they are stored
   as tenths of a kg (sideWeight = round(kg * 10)). Errors are codes + params so
   the screen can translate them; errorText() renders them in English (also what
   "Copy errors for AI" pastes back into the chat). */
(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.AIKitCore = api;
})(typeof self !== "undefined" ? self : this, function () {
  const FORMAT = "myinnox1-routines";
  const FORMAT_VERSION = 1;
  const LIBRARY_FORMAT = "myinnox1-library";
  const PROMPT_VERSION = 1;

  // Provisional caps (issue #10, open item 2: machine limits not confirmed).
  const LIMITS = {
    routines: [1, 7], sets: [1, 10], reps: [1, 100], seconds: [5, 600], restSeconds: [0, 300],
    weightKg: [0, 300], // upper bound is only a sanity check, not a machine limit
  };
  const DEFAULT_REST = 30;
  const DEFAULT_SIDE_WEIGHT = 50; // tenths of a kg; same fallback as addStepFromAction()
  const WEEKDAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
  const LEVELS = ["beginner", "intermediate", "advanced"];
  // list name in the AI format -> [program list, stage]. Stages: official programs keep
  // warm-up steps at stage 1 and stretch steps at stage 3 (see courses-core.js stepsOf);
  // main steps are stage 2 (what the editor creates). Documented in docs/ai-export-impl-notes.md.
  const LISTS = {
    warmUp: { target: "warmUpStepList", stage: 1 },
    main: { target: "mainStepList", stage: 2 },
    cooldown: { target: "relaxStepList", stage: 3 },
  };
  const TYPE_NAMES = { 1: "stretch", 2: "warmup", 3: "strength" };
  const PART_NAMES = { 1: "chest", 2: "shoulder", 3: "back", 4: "arm", 5: "hips", 6: "legs", 7: "abdomen", 8: "full-body" };
  const LOAD_NAMES = { 0: "none", 1: "per_side", 2: "combined" };

  const isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
  const absent = (v) => v === undefined || v === null;
  const isInt = (v, [lo, hi]) => typeof v === "number" && Number.isInteger(v) && v >= lo && v <= hi;
  const ymd = (d) => new Date(d).toISOString().slice(0, 10);

  // ---------- A. library for AI ----------
  function partsOf(a) {
    const v = a && a.muscleParts;
    const arr = Array.isArray(v) ? v : String(v == null ? "" : v).split(",");
    return arr.map((s) => PART_NAMES[String(s).trim()]).filter(Boolean);
  }

  // raw /action/list item -> compact entry. Missing level / sideNum (older fixtures) default to
  // beginner / none; the real API always sends them.
  function toAIAction(a) {
    return {
      id: a.id,
      name: String(a.name == null ? "" : a.name).replace(/\s+/g, " ").trim(),
      type: TYPE_NAMES[a.actionType] || "strength",
      level: LEVELS[(Number(a.level) || 1) - 1] || "beginner",
      bodyParts: partsOf(a),
      load: LOAD_NAMES[a.sideNum == null ? 0 : a.sideNum] || "none",
      measure: Number(a.countType) === 2 ? "seconds" : "reps",
      custom: !!a.custom,
    };
  }

  // actions: raw items (built-in + custom). Stable order by id; no URLs or long texts.
  function libraryForAI(actions, opts = {}) {
    const includeCustom = opts.includeCustom !== false;
    const seen = new Set();
    const list = (Array.isArray(actions) ? actions : [])
      .filter((a) => a && Number.isInteger(a.id) && (includeCustom || !a.custom) && !seen.has(a.id) && seen.add(a.id))
      .map(toAIAction)
      .sort((x, y) => x.id - y.id);
    return {
      format: LIBRARY_FORMAT, formatVersion: 1, language: opts.lang || "en",
      exportedAt: new Date(opts.now ?? Date.now()).toISOString(), actions: list,
    };
  }

  const cell = (s) => String(s).replace(/\s*[|\r\n]+\s*/g, " ").trim();
  // entries: libraryForAI(...).actions
  function libraryTable(entries) {
    const rows = entries.map((e) => [e.id, cell(e.name), e.type, e.level, e.bodyParts.join(","), e.load, e.measure].join(" | "));
    return ["id | name | type | level | parts | load | measure", ...rows].join("\n");
  }

  const libraryFilename = (lang, now = Date.now()) => `myinnox1-library-${lang || "en"}-${ymd(now)}.json`;
  const guideFilename = (now = Date.now()) => `myinnox1-routines-guide-${ymd(now)}.md`;

  // ---------- B/C. prompt ----------
  function stepFor(e, extra = {}) {
    const s = { actionId: e.id, sets: 1 };
    if (e.measure === "seconds") s.seconds = 30; else s.reps = 12;
    return Object.assign(s, extra);
  }

  // A complete example built from the actual library, so it always parses against it.
  function buildExample(entries) {
    const by = (f) => entries.filter(f);
    const warm = by((e) => e.type === "warmup")[0] || by((e) => e.type === "stretch")[0];
    const cool = by((e) => e.type === "stretch")[0] || warm;
    const strength = by((e) => e.type === "strength");
    const loaded = strength.filter((e) => e.measure === "reps" && e.load !== "none");
    const mains = [];
    if (loaded[0]) mains.push(stepFor(loaded[0], { sets: 4, reps: 8, restSeconds: 90, weightKg: 20 }));
    if (loaded[1]) mains.push(stepFor(loaded[1], { sets: 3, reps: 12, restSeconds: 60, weightKg: 12.5 }));
    const plainReps = strength.find((e) => e.measure === "reps" && e.load === "none");
    if (plainReps) mains.push(stepFor(plainReps, { sets: 3, reps: 15 }));
    const timed = strength.find((e) => e.measure === "seconds");
    if (timed) mains.push(stepFor(timed, { sets: 3, seconds: 40, restSeconds: 45 }));
    if (!mains.length && strength[0]) mains.push(stepFor(strength[0]));
    const r1 = { name: "Upper body A", description: "Chest, back and arms. About 40 min.", level: "intermediate" };
    if (warm) r1.warmUp = [stepFor(warm, { sets: 1 })];
    r1.main = mains;
    if (cool) r1.cooldown = [stepFor(cool, { sets: 1 })];
    const r2 = { name: "Lower body A", level: "intermediate", main: strength.length ? [stepFor(strength[2] || strength[0], { sets: 3 })] : mains.slice(0, 1) };
    return {
      format: FORMAT, formatVersion: FORMAT_VERSION,
      routines: [r1, r2],
      schedule: [{ weekday: "mon", routine: r1.name }, { weekday: "thu", routine: r1.name }, { weekday: "wed", routine: r2.name }],
    };
  }

  // The prompt text. Edit here and bump PROMPT_VERSION when the meaning changes.
  // {{LANG}} {{LIBRARY}} {{EXAMPLE}} are replaced by buildPrompt / buildGuide.
  const PROMPT_TEXT = `# MyInnoX1 routine builder (prompt version ${PROMPT_VERSION})

## Role
You are a strength coach. You design workout routines for the Innodigym / MyInnoX1 digital cable resistance machine. The user will import your answer into the MyInnoX1 web app, so the output must follow the format below exactly.

## First, ask what you need
If the user's goal message does not already say it, ask for: their goal, how many days per week, minutes per session, experience level, injuries or limits, and any body-part focus. Ask everything in ONE message, at most one round of questions, then answer.

## How to build the week
- One routine per DISTINCT session (for example Push / Pull / Legs), usually 2-4 routines for a week. Do not duplicate a routine for every day.
- Say on which weekdays to do each routine in "schedule" (a routine may appear on several days).
- Warm-up: pick from library actions of type "warmup" (or "stretch"). Cooldown: pick from type "stretch". Main part: type "strength" only, 5-8 exercises per routine.
- Match the library level to the user's experience. Start loads conservative: you cannot know the user's strength, they adjust after importing. When unsure, leave out "weightKg".
- Write routine names and descriptions in the user's language. Everything else (keys, weekdays, levels) stays exactly as shown here.

## Format (JSON, format "${FORMAT}" version ${FORMAT_VERSION})
Top level: "format", "formatVersion", "routines" (required), "schedule" (optional).

Rules:
- routines: 1 to 7 items; names must be unique in the file.
- Routine: "name" (required), "description" (optional text), "level" (optional: beginner | intermediate | advanced), "warmUp" (optional list), "main" (required, at least 1 step), "cooldown" (optional list).
- Step: "actionId" (required) and "sets" (required), then "reps" or "seconds" as described below, plus optional "restSeconds" and "weightKg".
- actionId: a whole number taken from the library table. Never invent an id. If no suitable action exists, choose another one.
- sets: whole number 1-10.
- reps: whole number 1-100. Required when the action's measure is "reps"; NOT allowed when it is "seconds".
- seconds: whole number 5-600. Required when the action's measure is "seconds"; NOT allowed when it is "reps".
- restSeconds: whole number 0-300 (rest after each set), optional, default 30.
- weightKg: plain kg, 0 or more, at most one decimal (for example 12.5), optional. Omit it to use the action's default. Ignored when the action's load is "none". For load "per_side" it is the weight per side; for "combined" it is the weight per cable.
- schedule: optional list of { "weekday": "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun", "routine": "<exact routine name>" }.

Complete example:
\`\`\`json
{{EXAMPLE}}
\`\`\`

## Output contract
- After any questions are answered, reply with ONE JSON code block and nothing else.
- Use only actionIds from the library. Never invent an id or a field.
- If the user pastes error messages from the import, reply again with the complete corrected JSON in one code block.

{{LIBRARY}}`;

  function libraryBlock(entries, lang) {
    return `## Library (language of names: ${lang}; one action per line)\nColumns: id | name | type (stretch, warmup, strength) | level | parts | load (none, per_side, combined) | measure (reps or seconds)\n\n${libraryTable(entries)}`;
  }
  function prefill(text, example, library) {
    return text.replace("{{EXAMPLE}}", () => JSON.stringify(example, null, 2).replace(/\{[^{}[\]]*\}/g, (m) => m.replace(/\s*\n\s*/g, " "))).replace("{{LIBRARY}}", () => library);
  }

  // Full prompt: instructions + whole library, ends with "My goal: " for the user to complete.
  function buildPrompt(actions, opts = {}) {
    const lib = libraryForAI(actions, opts);
    return `${prefill(PROMPT_TEXT, buildExample(lib.actions), libraryBlock(lib.actions, lib.language))}\n\nMy goal: `;
  }

  // Instructions without the library, for people who attach the library file instead.
  function buildGuide(actions, opts = {}) {
    const lib = libraryForAI(actions, opts);
    const where = `## Library\nThe library is in the attached file ${libraryFilename(lib.language, opts.now)} (JSON). Use only ids from its "actions" list. Each action has: id, name, type (stretch, warmup, strength), level, bodyParts, load (none, per_side, combined), measure (reps or seconds), custom.`;
    return `${prefill(PROMPT_TEXT, buildExample(lib.actions), where)}\n`;
  }

  // ---------- D. JSON extraction ----------
  // First balanced {...} (string-aware) that parses; prefers one that has a "format" key so a
  // stray object in the chat text before the answer is skipped. Tolerates fences and chatter.
  function extractJson(text) {
    const s = String(text == null ? "" : text).replace(/^﻿/, "");
    let first = null, tries = 0;
    for (let i = s.indexOf("{"); i !== -1 && tries < 60; i = s.indexOf("{", i + 1)) {
      let depth = 0, inStr = false, esc = false, end = -1;
      for (let j = i; j < s.length; j++) {
        const c = s[j];
        if (inStr) { if (esc) esc = false; else if (c === "\\") esc = true; else if (c === '"') inStr = false; continue; }
        if (c === '"') inStr = true;
        else if (c === "{") depth++;
        else if (c === "}" && --depth === 0) { end = j; break; }
      }
      if (end === -1) continue;
      tries++;
      try {
        const v = JSON.parse(s.slice(i, end + 1));
        if (isObj(v)) { if ("format" in v) return v; if (!first) first = v; }
      } catch { /* try the next brace */ }
    }
    return first;
  }

  // ---------- hydration ----------
  const libKg = (a) => (typeof a.sideWeight === "string" ? parseFloat(a.sideWeight) : a.sideWeight);
  // Same object as addStepFromAction() in app.js, with the user's values filled in.
  function hydrateStep(step, a, opts = {}) {
    const kg = libKg(a);
    const fallback = Number.isFinite(kg) ? Math.round(kg * 10) : DEFAULT_SIDE_WEIGHT;
    const wanted = step.weightKg;
    const sideWeight = typeof wanted === "number" && a.sideNum ? Math.round(wanted * 10) : fallback;
    return {
      sort: opts.sort || 1,
      actionLibraryId: a.id,
      actionName: a.name,
      actionNo: a.actionNo,
      actionType: a.actionType,
      picUrl: a.picUrl,
      videoUrl: a.videoUrl,
      stage: opts.stage || 2,
      count: absent(step.reps) ? (absent(step.seconds) ? 12 : step.seconds) : step.reps,
      consume: a.consume ?? null,
      sideNum: a.sideNum ?? 0,
      countType: a.countType ?? 1,
      sideWeight,
      muscleGroups: a.muscleGroups,
      muscleParts: a.muscleParts,
      trainingPoint: a.trainingPoint,
      reqParts: a.reqParts,
      restTime: absent(step.restSeconds) ? DEFAULT_REST : step.restSeconds,
      groupNum: absent(step.sets) ? 1 : step.sets,
      mode: 0,
      modeParam: "{}",
      breathTip: a.breathTip,
      custom: !!a.custom,
      duration: 12,
    };
  }

  // ---------- messages ----------
  // code -> English template. The screen translates the same strings with t().
  const MESSAGES = {
    "no-json": "No JSON object was found in the text.",
    "wrong-format": 'The file must have "format": "myinnox1-routines" and a "formatVersion" of 1.',
    "newer-version": "This file uses format version {version}, which this app does not know.",
    "no-routines": '"routines" must be a list with at least one routine.',
    "too-many-routines": '"routines" has {count} items; the maximum is {max}.',
    "library-unavailable": "The action library could not be loaded, so the routines cannot be checked.",
    "routine-not-object": "This routine is not an object.",
    "no-name": 'The routine needs a "name" (non-empty text).',
    "duplicate-name": 'The routine name "{name}" is used more than once.',
    "bad-level": '"level" must be beginner, intermediate or advanced.',
    "bad-text": '"{field}" must be text.',
    "list-not-array": "{list} must be a list of steps.",
    "no-main": '"main" needs at least one step.',
    "step-not-object": "This step is not an object.",
    "bad-action-id": "actionId must be a whole number taken from the library.",
    "unknown-action": "actionId {id} is not in your library.",
    "bad-int": "{field} must be a whole number between {min} and {max}.",
    "reps-required": "reps is required because this action is counted in reps.",
    "reps-forbidden": "reps is not allowed because this action is counted in seconds (use seconds).",
    "seconds-required": "seconds is required because this action is counted in seconds.",
    "seconds-forbidden": "seconds is not allowed because this action is counted in reps (use reps).",
    "bad-weight": "weightKg must be a number of kg between {min} and {max} with at most 1 decimal.",
    "weight-ignored": "weightKg is ignored because this action has no adjustable load.",
    "schedule-not-array": '"schedule" must be a list.',
    "bad-weekday": 'weekday must be one of mon, tue, wed, thu, fri, sat, sun.',
    "schedule-unknown-routine": 'schedule refers to "{name}", which is not a routine name in this file.',
  };
  const SKIPPED = "Skipped step";

  function messageParts(e) {
    return { template: MESSAGES[e.code] || "The file is not valid.", vars: e };
  }
  const fill = (tpl, v) => tpl.replace(/\{(\w+)\}/g, (m, k) => (v[k] != null ? v[k] : m));
  function whereText(e, stepWord = (n) => `step ${n}`) {
    if (e.list === "schedule") return e.step ? `schedule[${e.step}]` : "schedule";
    return [e.routine, e.list, e.step ? stepWord(e.step) : ""].filter((x) => x != null && x !== "").join(" / ");
  }
  function errorText(e) {
    const w = whereText(e);
    const msg = fill(messageParts(e).template, e);
    const body = e.skipped ? `${SKIPPED} (${msg})` : msg;
    return w ? `${w}: ${body}` : body;
  }

  // Plain-text list to paste back into the AI chat.
  function errorsForAI(errors, fatal) {
    const all = (fatal ? [fatal] : []).concat(errors || []).filter((e) => !e.skipped && e.severity !== "warning");
    if (!all.length) return "";
    const lines = all.map((e) => `- ${errorText(e)}`);
    return `The ${FORMAT} JSON could not be imported. Fix these problems and reply with the complete corrected JSON in one code block (same format, only actionIds from the library):\n${lines.join("\n")}\n`;
  }

  // ---------- routines parser ----------
  function libraryIndex(actions) {
    const m = new Map();
    for (const a of Array.isArray(actions) ? actions : []) if (a && Number.isInteger(a.id) && !m.has(a.id)) m.set(a.id, { raw: a, ai: toAIAction(a) });
    return m;
  }

  function checkStep(step, list, i, routine, idx, out) {
    const where = { routine, list, step: i + 1 };
    const err = (code, extra) => out.errors.push({ code, ...where, ...extra });
    if (!isObj(step)) { err("step-not-object"); return null; }
    let entry = null;
    if (!Number.isInteger(step.actionId)) err("bad-action-id");
    else if (!idx.has(step.actionId)) err("unknown-action", { id: step.actionId });
    else entry = idx.get(step.actionId);
    const [lo, hi] = LIMITS.sets;
    if (!isInt(step.sets, LIMITS.sets)) err("bad-int", { field: "sets", min: lo, max: hi });
    if (!absent(step.restSeconds) && !isInt(step.restSeconds, LIMITS.restSeconds)) err("bad-int", { field: "restSeconds", min: LIMITS.restSeconds[0], max: LIMITS.restSeconds[1] });
    for (const f of ["reps", "seconds"]) {
      if (!absent(step[f]) && !isInt(step[f], LIMITS[f])) err("bad-int", { field: f, min: LIMITS[f][0], max: LIMITS[f][1] });
    }
    let weightOk = true;
    const w = step.weightKg;
    if (!absent(w)) {
      const [wl, wh] = LIMITS.weightKg;
      weightOk = typeof w === "number" && Number.isFinite(w) && w >= wl && w <= wh && Math.abs(w * 10 - Math.round(w * 10)) < 1e-9;
      if (!weightOk) err("bad-weight", { min: wl, max: wh });
    }
    if (!entry) return null;
    const timed = entry.ai.measure === "seconds";
    if (timed) {
      if (absent(step.seconds)) err("seconds-required");
      if (!absent(step.reps)) err("reps-forbidden");
    } else {
      if (absent(step.reps)) err("reps-required");
      if (!absent(step.seconds)) err("seconds-forbidden");
    }
    if (!absent(w) && weightOk && entry.ai.load === "none") out.warnings.push({ code: "weight-ignored", severity: "warning", ...where });
    return entry;
  }

  // input: text from the AI (fences / chatter allowed) or an already parsed object.
  // actions: raw action list (built-in + custom) of the account.
  // opts.skipBad: drop steps that have problems (reported as skipped warnings) instead of blocking.
  // -> { fatal, programs: [{name, program, errors, warnings}], schedule, errors, warnings }
  //    `errors` = every blocking problem incl. schedule ones (those do not block a program).
  function parseRoutines(input, actions, opts = {}) {
    const fail = (fatal) => ({ fatal, programs: [], schedule: [], errors: [], warnings: [] });
    const data = typeof input === "string" ? extractJson(input) : input;
    if (!isObj(data)) return fail({ code: "no-json" });
    if (data.format !== FORMAT) return fail({ code: "wrong-format" });
    if (typeof data.formatVersion !== "number" || !Number.isInteger(data.formatVersion) || data.formatVersion < 1) return fail({ code: "wrong-format" });
    if (data.formatVersion > FORMAT_VERSION) return fail({ code: "newer-version", version: data.formatVersion });
    if (!Array.isArray(data.routines) || !data.routines.length) return fail({ code: "no-routines" });
    if (data.routines.length > LIMITS.routines[1]) return fail({ code: "too-many-routines", count: data.routines.length, max: LIMITS.routines[1] });
    const idx = libraryIndex(actions);
    if (!idx.size) return fail({ code: "library-unavailable" });

    const names = new Set();
    const programs = data.routines.map((r, ri) => {
      const out = { errors: [], warnings: [] };
      const name = isObj(r) && typeof r.name === "string" ? r.name.trim() : "";
      const routine = name || `#${ri + 1}`;
      const rerr = (code, extra) => out.errors.push({ code, routine, ...extra });
      if (!isObj(r)) { rerr("routine-not-object"); return { name: "", program: r, ...out }; }
      if (!name) rerr("no-name");
      else if (names.has(name.toLowerCase())) rerr("duplicate-name", { name });
      names.add(name.toLowerCase());
      if (!absent(r.level) && !LEVELS.includes(r.level)) rerr("bad-level");
      if (!absent(r.description) && typeof r.description !== "string") rerr("bad-text", { field: "description" });

      const lists = {};
      for (const l of Object.keys(LISTS)) {
        const v = r[l];
        lists[l] = [];
        if (absent(v)) { if (l === "main") rerr("no-main", { list: l }); continue; }
        if (!Array.isArray(v)) { rerr("list-not-array", { list: l }); continue; }
        if (l === "main" && !v.length) rerr("no-main", { list: l });
        const stepOut = { errors: [], warnings: [] };
        v.forEach((s, i) => {
          const before = stepOut.errors.length;
          const entry = checkStep(s, l, i, routine, idx, stepOut);
          if (stepOut.errors.length === before && entry) {
            lists[l].push(hydrateStep(s, entry.raw, { stage: LISTS[l].stage, sort: lists[l].length + 1 }));
          }
        });
        out.warnings.push(...stepOut.warnings);
        if (opts.skipBad) out.warnings.push(...stepOut.errors.map((e) => ({ ...e, skipped: true })));
        else out.errors.push(...stepOut.errors);
        if (opts.skipBad && l === "main" && v.length && !lists.main.length) rerr("no-main", { list: l });
      }
      const program = { name, description: typeof r.description === "string" ? r.description : "", level: LEVELS.indexOf(r.level) + 1 || 1 };
      for (const l of Object.keys(LISTS)) program[LISTS[l].target] = lists[l];
      return { name, program, ...out };
    });

    const schedule = [], fileErrors = [];
    if (!absent(data.schedule)) {
      if (!Array.isArray(data.schedule)) fileErrors.push({ code: "schedule-not-array", list: "schedule" });
      else {
        const known = new Set(programs.map((p) => p.name.toLowerCase()).filter(Boolean));
        data.schedule.forEach((e, i) => {
          const at = { list: "schedule", step: i + 1 };
          if (!isObj(e) || !WEEKDAYS.includes(e.weekday)) { fileErrors.push({ code: "bad-weekday", ...at }); return; }
          const rn = typeof e.routine === "string" ? e.routine.trim() : "";
          if (!rn || !known.has(rn.toLowerCase())) { fileErrors.push({ code: "schedule-unknown-routine", name: rn, ...at }); return; }
          schedule.push({ weekday: e.weekday, routine: programs.find((p) => p.name.toLowerCase() === rn.toLowerCase()).name });
        });
      }
    }
    const errors = programs.flatMap((p) => p.errors).concat(fileErrors);
    const warnings = programs.flatMap((p) => p.warnings);
    return { fatal: null, programs, schedule, fileErrors, errors, warnings };
  }

  return {
    FORMAT, FORMAT_VERSION, LIBRARY_FORMAT, PROMPT_VERSION, LIMITS, LISTS, WEEKDAYS, LEVELS, MESSAGES, SKIPPED, PROMPT_TEXT,
    libraryForAI, libraryTable, libraryFilename, guideFilename, buildExample, buildPrompt, buildGuide,
    extractJson, hydrateStep, parseRoutines, messageParts, whereText, errorText, errorsForAI, toAIAction,
  };
});
