const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const A = require("./ai-kit-core.js");
const IO = require("./program-io-core.js");

const act = (id, name, o = {}) => Object.assign({
  id, name, actionNo: "LM" + id, actionType: 3, picUrl: "p" + id + ".png", videoUrl: "v" + id + ".mp4", muscleParts: "1,4",
  muscleGroups: "1,2", countType: 1, sideWeight: "5", custom: false, consume: 10, trainingPoint: "tp", reqParts: null,
  breathTip: "bt", level: 2, sideNum: 1,
}, o);
const LIB = [
  act(210, "Arm Circles", { actionType: 2, countType: 2, sideNum: 0, level: 1 }),
  act(305, "Bench Press", { sideNum: 2, sideWeight: "7.5" }),
  act(311, "Cable Row", { muscleParts: "3", sideNum: 1 }),
  act(320, "Push-Up", { sideNum: 0, level: 1 }),          // reps, no load
  act(330, "Plank", { sideNum: 0, countType: 2 }),         // seconds, no load
  act(402, "Hamstring Stretch", { actionType: 1, countType: 2, sideNum: 0, level: 1, muscleParts: "5" }),
  act(9001, "My | Custom\nMove", { custom: true, sideNum: 1 }),
];
const FIX = JSON.parse(fs.readFileSync(path.join(__dirname, "../qa/fixtures/action-list-real.json"), "utf8"));
const REAL = Array.isArray(FIX) ? FIX : FIX.data;

const file = (routines, extra = {}) => JSON.stringify({ format: "myinnox1-routines", formatVersion: 1, routines, ...extra });
const okRoutine = (o = {}) => ({ name: "Push A", main: [{ actionId: 305, sets: 4, reps: 8 }], ...o });
const parse = (routines, extra, opts) => A.parseRoutines(file(routines, extra), LIB, opts);
const codes = (r) => r.errors.map((e) => e.code);

// ---------- library export ----------
test("libraryForAI: counts, language, names instead of codes, stable order, no URLs", () => {
  const lib = A.libraryForAI(LIB.slice().reverse(), { lang: "de", now: Date.UTC(2026, 10, 6, 10) });
  assert.equal(lib.format, "myinnox1-library");
  assert.equal(lib.formatVersion, 1);
  assert.equal(lib.language, "de");
  assert.equal(lib.exportedAt, "2026-11-06T10:00:00.000Z");
  assert.deepEqual(lib.actions.map((a) => a.id), [210, 305, 311, 320, 330, 402, 9001]);
  assert.deepEqual(lib.actions[1], { id: 305, name: "Bench Press", type: "strength", level: "intermediate", bodyParts: ["chest", "arm"], load: "combined", measure: "reps", custom: false });
  assert.deepEqual(lib.actions[0], { id: 210, name: "Arm Circles", type: "warmup", level: "beginner", bodyParts: ["chest", "arm"], load: "none", measure: "seconds", custom: false });
  assert.equal(lib.actions[5].type, "stretch");
  const text = JSON.stringify(lib);
  assert.ok(!/png|mp4|trainingPoint|breathTip|sideWeight/.test(text));
});

test("libraryForAI: custom filter", () => {
  assert.equal(A.libraryForAI(LIB, { includeCustom: false }).actions.length, 6);
  assert.equal(A.libraryForAI(LIB, { includeCustom: true }).actions.length, 7);
  assert.equal(A.libraryForAI(LIB).actions.length, 7); // default on
  assert.ok(A.libraryForAI(LIB, { includeCustom: false }).actions.every((a) => !a.custom));
});

test("libraryTable: one row per action, pipes and newlines in names neutralised", () => {
  const rows = A.libraryTable(A.libraryForAI(LIB).actions).split("\n");
  assert.equal(rows[0], "id | name | type | level | parts | load | measure");
  assert.equal(rows.length, 8);
  assert.equal(rows[2], "305 | Bench Press | strength | intermediate | chest,arm | combined | reps");
  assert.equal(rows[7], "9001 | My Custom Move | strength | intermediate | chest,arm | per_side | reps");
});

test("filenames", () => {
  assert.equal(A.libraryFilename("fr", Date.UTC(2026, 10, 6)), "myinnox1-library-fr-2026-11-06.json");
  assert.equal(A.guideFilename(Date.UTC(2026, 10, 6)), "myinnox1-routines-guide-2026-11-06.md");
});

// ---------- prompt ----------
test("prompt: every library id appears once as a table row, ends with the goal line, carries the version", () => {
  for (const lib of [LIB, REAL]) {
    const prompt = A.buildPrompt(lib, { lang: "en" });
    const entries = A.libraryForAI(lib).actions;
    for (const e of entries) {
      const n = prompt.split("\n").filter((l) => l.startsWith(e.id + " | ")).length;
      assert.equal(n, 1, `id ${e.id}`);
    }
    assert.ok(prompt.endsWith("My goal: "));
    assert.ok(prompt.includes(`prompt version ${A.PROMPT_VERSION}`));
    assert.ok(!prompt.includes("{{"));
  }
});

test("prompt: custom actions can be left out", () => {
  const p = A.buildPrompt(LIB, { includeCustom: false });
  assert.ok(!/^9001 \|/m.test(p));
});

test("prompt: its own example parses against the library (drift guard)", () => {
  for (const lib of [LIB, REAL, REAL.filter((a) => !a.custom).slice(0, 12)]) {
    const prompt = A.buildPrompt(lib);
    const r = A.parseRoutines(prompt, lib); // also proves extraction from chatty text with a fence
    assert.equal(r.fatal, null);
    assert.deepEqual(r.errors, [], A.errorsForAI(r.errors));
    assert.ok(r.programs.length >= 2);
    assert.ok(r.programs.every((p) => p.program.mainStepList.length > 0));
    assert.ok(r.schedule.length >= 2);
  }
});

test("guide: no library table, mentions the file name", () => {
  const g = A.buildGuide(LIB, { lang: "es", now: Date.UTC(2026, 10, 6) });
  assert.ok(g.includes("myinnox1-library-es-2026-11-06.json"));
  assert.ok(!/^305 \|/m.test(g));
  assert.ok(!g.includes("My goal:"));
  assert.ok(A.parseRoutines(g, LIB).errors.length === 0);
});

// ---------- extractJson ----------
test("extractJson: plain, fenced, chatty, braces in strings, stray braces first", () => {
  const o = { format: "x", a: "}{" };
  assert.deepEqual(A.extractJson(JSON.stringify(o)), o);
  assert.deepEqual(A.extractJson("Sure!\n```json\n" + JSON.stringify(o, null, 2) + "\n```\nHope it helps {really}"), o);
  assert.deepEqual(A.extractJson("see {not json} then " + JSON.stringify(o)), o);
  assert.deepEqual(A.extractJson("﻿" + JSON.stringify(o)), o);
  assert.equal(A.extractJson("no braces"), null);
  assert.equal(A.extractJson('{"a": '), null);
  assert.equal(A.extractJson(null), null);
});

// ---------- parseRoutines ----------
test("valid file: hydrated programs, schedule, no errors", () => {
  const r = A.parseRoutines(file([
    okRoutine({ description: "d", level: "advanced", warmUp: [{ actionId: 210, sets: 1, seconds: 30 }], cooldown: [{ actionId: 402, sets: 1, seconds: 30 }] }),
    { name: "Pull A", main: [{ actionId: 311, sets: 3, reps: 12, restSeconds: 60, weightKg: 12.5 }] },
  ], { schedule: [{ weekday: "mon", routine: "Push A" }, { weekday: "wed", routine: "pull a" }] }), LIB);
  assert.equal(r.fatal, null);
  assert.deepEqual(r.errors, []);
  const p = r.programs[0].program;
  assert.equal(p.name, "Push A");
  assert.equal(p.description, "d");
  assert.equal(p.level, 3);
  assert.deepEqual([p.warmUpStepList[0].stage, p.mainStepList[0].stage, p.relaxStepList[0].stage], [1, 2, 3]);
  assert.equal(r.programs[1].program.level, 1);
  assert.equal(r.programs[1].program.mainStepList[0].sideWeight, 125);
  assert.deepEqual(r.schedule, [{ weekday: "mon", routine: "Push A" }, { weekday: "wed", routine: "Pull A" }]);
  // goes through the existing save path
  const body = IO.toSaveBody(p);
  assert.equal(body.mainStepList[0].actionLibraryId, 305);
  assert.equal(body.mainStepList[0].sort, 1);
});

test("fatal: wrong format, newer version, empty, too many, not JSON, no library", () => {
  const f = (txt, lib = LIB) => A.parseRoutines(txt, lib).fatal;
  assert.equal(f("hello").code, "no-json");
  assert.equal(f(JSON.stringify({ format: "myinnox1-program", formatVersion: 1, programs: [] })).code, "wrong-format");
  assert.equal(f(JSON.stringify({ routines: [] })).code, "wrong-format");
  assert.equal(f(JSON.stringify({ format: "myinnox1-routines", routines: [] })).code, "wrong-format");
  assert.deepEqual(f(JSON.stringify({ format: "myinnox1-routines", formatVersion: 2, routines: [] })), { code: "newer-version", version: 2 });
  assert.equal(f(JSON.stringify({ format: "myinnox1-routines", formatVersion: 1, routines: [] })).code, "no-routines");
  assert.equal(f(JSON.stringify({ format: "myinnox1-routines", formatVersion: 1, routines: {} })).code, "no-routines");
  const eight = Array.from({ length: 8 }, (_, i) => okRoutine({ name: "R" + i }));
  assert.equal(f(file(eight)).code, "too-many-routines");
  assert.equal(f(file([okRoutine()]), []).code, "library-unavailable");
  assert.equal(A.parseRoutines(file(Array.from({ length: 7 }, (_, i) => okRoutine({ name: "R" + i }))), LIB).fatal, null);
});

test("routine rules: name, duplicates, level, description, main, list types", () => {
  assert.deepEqual(codes(parse([okRoutine({ name: "  " })])), ["no-name"]);
  assert.deepEqual(codes(parse([okRoutine({ name: undefined })])), ["no-name"]);
  assert.deepEqual(codes(parse([okRoutine(), okRoutine({ name: " push a " })])), ["duplicate-name"]);
  assert.deepEqual(codes(parse([okRoutine({ level: "expert" })])), ["bad-level"]);
  assert.deepEqual(codes(parse([okRoutine({ level: 2 })])), ["bad-level"]);
  assert.deepEqual(codes(parse([okRoutine({ description: 5 })])), ["bad-text"]);
  assert.deepEqual(codes(parse([okRoutine({ main: [] })])), ["no-main"]);
  assert.deepEqual(codes(parse([okRoutine({ main: undefined })])), ["no-main"]);
  assert.deepEqual(codes(parse([okRoutine({ warmUp: "stretch" })])), ["list-not-array"]);
  assert.deepEqual(codes(parse([okRoutine({ cooldown: {} })])), ["list-not-array"]);
  assert.deepEqual(codes(parse(["x"])), ["routine-not-object"]);
  assert.deepEqual(codes(parse([okRoutine({ warmUp: null, cooldown: null, level: null })])), []);
});

const stepCodes = (step, extra) => codes(parse([okRoutine({ main: [step] , ...extra })]));
test("step rules: actionId", () => {
  assert.deepEqual(stepCodes({ actionId: 999, sets: 3, reps: 8 }), ["unknown-action"]);
  assert.deepEqual(stepCodes({ actionId: "305", sets: 3, reps: 8 }), ["bad-action-id"]);
  assert.deepEqual(stepCodes({ actionId: 305.5, sets: 3, reps: 8 }), ["bad-action-id"]);
  assert.deepEqual(stepCodes({ sets: 3, reps: 8 }), ["bad-action-id"]);
  assert.deepEqual(stepCodes(7), ["step-not-object"]);
  assert.deepEqual(stepCodes(null), ["step-not-object"]);
  assert.deepEqual(stepCodes({ actionId: 9001, sets: 3, reps: 8 }), []); // custom ids are in the list passed in
});

test("step rules: sets 1-10, reps 1-100, seconds 5-600, rest 0-300 (boundaries)", () => {
  const ok = (s) => assert.deepEqual(stepCodes(s), [], JSON.stringify(s));
  const bad = (s, f) => { const r = parse([okRoutine({ main: [s] })]); assert.deepEqual(codes(r), ["bad-int"], JSON.stringify(s)); assert.equal(r.errors[0].field, f); };
  ok({ actionId: 305, sets: 1, reps: 1 });
  ok({ actionId: 305, sets: 10, reps: 100, restSeconds: 300 });
  ok({ actionId: 305, sets: 3, reps: 8, restSeconds: 0 });
  ok({ actionId: 330, sets: 3, seconds: 5 });
  ok({ actionId: 330, sets: 3, seconds: 600 });
  bad({ actionId: 305, sets: 0, reps: 8 }, "sets");
  bad({ actionId: 305, sets: 11, reps: 8 }, "sets");
  bad({ actionId: 305, sets: 2.5, reps: 8 }, "sets");
  bad({ actionId: 305, sets: "3", reps: 8 }, "sets");
  bad({ actionId: 305, reps: 8 }, "sets");
  bad({ actionId: 305, sets: 3, reps: 0 }, "reps");
  bad({ actionId: 305, sets: 3, reps: 101 }, "reps");
  bad({ actionId: 305, sets: 3, reps: 8.5 }, "reps");
  bad({ actionId: 305, sets: 3, reps: "8" }, "reps");
  bad({ actionId: 330, sets: 3, seconds: 4 }, "seconds");
  bad({ actionId: 330, sets: 3, seconds: 601 }, "seconds");
  bad({ actionId: 305, sets: 3, reps: 8, restSeconds: 301 }, "restSeconds");
  bad({ actionId: 305, sets: 3, reps: 8, restSeconds: -1 }, "restSeconds");
  bad({ actionId: 305, sets: 3, reps: 8, restSeconds: 1.5 }, "restSeconds");
});

test("step rules: reps vs seconds must match the action's measure", () => {
  assert.deepEqual(stepCodes({ actionId: 305, sets: 3 }), ["reps-required"]);
  assert.deepEqual(stepCodes({ actionId: 305, sets: 3, seconds: 30 }), ["reps-required", "seconds-forbidden"]);
  assert.deepEqual(stepCodes({ actionId: 305, sets: 3, reps: 8, seconds: 30 }), ["seconds-forbidden"]);
  assert.deepEqual(stepCodes({ actionId: 330, sets: 3 }), ["seconds-required"]);
  assert.deepEqual(stepCodes({ actionId: 330, sets: 3, reps: 10 }), ["seconds-required", "reps-forbidden"]);
  assert.deepEqual(stepCodes({ actionId: 330, sets: 3, seconds: 30, reps: 10 }), ["reps-forbidden"]);
  assert.deepEqual(stepCodes({ actionId: 305, sets: 3, reps: 8, seconds: null }), []); // null = absent
});

test("step rules: weightKg", () => {
  const w = (weightKg) => stepCodes({ actionId: 305, sets: 3, reps: 8, weightKg });
  assert.deepEqual(w(0), []);
  assert.deepEqual(w(12.5), []);
  assert.deepEqual(w(0.1), []);
  assert.deepEqual(w(20), []);
  assert.deepEqual(w(null), []);
  assert.deepEqual(w(-1), ["bad-weight"]);
  assert.deepEqual(w(12.25), ["bad-weight"]);
  assert.deepEqual(w("20"), ["bad-weight"]);
  assert.deepEqual(w(301), ["bad-weight"]);
});

test("weight on a load:none action is a warning, not an error, and is not applied", () => {
  const r = parse([okRoutine({ main: [{ actionId: 320, sets: 3, reps: 10, weightKg: 30 }] })]);
  assert.deepEqual(r.errors, []);
  assert.deepEqual(r.warnings.map((w) => w.code), ["weight-ignored"]);
  assert.equal(r.programs[0].program.mainStepList[0].sideWeight, 50); // library default, as addStepFromAction
});

test("unknown fields are ignored", () => {
  assert.deepEqual(stepCodes({ actionId: 305, sets: 3, reps: 8, tempo: "3-1-1", note: "x" }), []);
});

test("errors name routine, list and step", () => {
  const r = parse([okRoutine({ name: "Legs A", main: [{ actionId: 305, sets: 3, reps: 8 }, { actionId: 305, sets: 3, reps: 8 }, { actionId: 999, sets: 3, reps: 8 }] })]);
  assert.equal(A.errorText(r.errors[0]), "Legs A / main / step 3: actionId 999 is not in your library.");
  const r2 = parse([okRoutine({ warmUp: [{ actionId: 210, sets: 1 }] })]);
  assert.equal(A.errorText(r2.errors[0]), "Push A / warmUp / step 1: seconds is required because this action is counted in seconds.");
  assert.equal(A.errorText({ code: "no-main", routine: "R", list: "main" }), 'R / main: "main" needs at least one step.');
});

test("all problems are reported in one go (not just the first)", () => {
  const r = parse([okRoutine({ main: [{ actionId: 999, sets: 0, reps: 8 }, { actionId: 305, sets: 3 }] })]);
  assert.deepEqual(codes(r), ["unknown-action", "bad-int", "reps-required"]);
});

test("skipBad: bad steps are dropped and reported; routine blocked only when nothing is left", () => {
  const routines = [okRoutine({ main: [{ actionId: 305, sets: 3, reps: 8 }, { actionId: 999, sets: 3, reps: 8 }] }), { name: "All bad", main: [{ actionId: 999, sets: 1, reps: 1 }] }];
  const strict = parse(routines);
  assert.equal(strict.errors.length, 2);
  const lenient = parse(routines, {}, { skipBad: true });
  assert.deepEqual(lenient.programs[0].errors, []);
  assert.equal(lenient.programs[0].program.mainStepList.length, 1);
  assert.deepEqual(lenient.programs[0].warnings.map((w) => [w.code, w.skipped]), [["unknown-action", true]]);
  assert.match(A.errorText(lenient.programs[0].warnings[0]), /Skipped step/);
  assert.deepEqual(lenient.programs[1].errors.map((e) => e.code), ["no-main"]);
  // routine-level errors are never skipped
  assert.deepEqual(codes(parse([okRoutine({ level: "x" })], {}, { skipBad: true })), ["bad-level"]);
});

test("schedule: valid, missing routine, bad weekday, not a list; does not block routines", () => {
  const ok = parse([okRoutine()], { schedule: [{ weekday: "sun", routine: "Push A" }] });
  assert.deepEqual(ok.errors, []);
  const miss = parse([okRoutine()], { schedule: [{ weekday: "mon", routine: "Nope" }, { weekday: "monday", routine: "Push A" }, "x"] });
  assert.deepEqual(codes(miss), ["schedule-unknown-routine", "bad-weekday", "bad-weekday"]);
  assert.equal(A.errorText(miss.errors[0]), 'schedule / step 1: schedule refers to "Nope", which is not a routine name in this file.');
  assert.deepEqual(miss.programs[0].errors, []);
  assert.deepEqual(codes(parse([okRoutine()], { schedule: {} })), ["schedule-not-array"]);
  assert.deepEqual(parse([okRoutine()]).schedule, []);
});

test("chatty and fenced input", () => {
  const txt = "Here is your plan!\n```json\n" + file([okRoutine()]) + "\n```\nLet me know if you want changes.";
  const r = A.parseRoutines(txt, LIB);
  assert.equal(r.fatal, null);
  assert.equal(r.programs.length, 1);
});

test("errorsForAI: plain text list, skips warnings/skipped, empty when nothing to report", () => {
  const r = parse([okRoutine({ main: [{ actionId: 999, sets: 3, reps: 8 }, { actionId: 320, sets: 1, reps: 1, weightKg: 5 }] })]);
  const txt = A.errorsForAI(r.errors);
  assert.match(txt, /^The myinnox1-routines JSON could not be imported/);
  assert.match(txt, /- Push A \/ main \/ step 1: actionId 999 is not in your library\./);
  assert.ok(!/weightKg is ignored/.test(txt));
  assert.equal(A.errorsForAI([]), "");
  assert.match(A.errorsForAI([], { code: "no-json" }), /No JSON object was found/);
});

// ---------- hydration ----------
function realAddStep(a) {
  const src = fs.readFileSync(path.join(__dirname, "app.js"), "utf8");
  const m = /function addStepFromAction\(a\) \{[\s\S]*?\n\}\n/.exec(src);
  assert.ok(m, "addStepFromAction not found in app.js");
  const ctx = { currentCourse: { mainStepList: [] }, renderStepsTable() {}, Number, Math, Object };
  vm.createContext(ctx);
  vm.runInContext(m[0] + "\naddStepFromAction(__a);", Object.assign(ctx, { __a: a }));
  return JSON.parse(JSON.stringify(ctx.currentCourse.mainStepList[0])); // out of the vm realm
}

test("hydrateStep equals addStepFromAction() for the same action (defaults)", () => {
  for (const a of LIB.concat(REAL.slice(0, 60))) {
    const mine = A.hydrateStep({ actionId: a.id }, a, { sort: 1, stage: 2 });
    assert.deepEqual(JSON.parse(JSON.stringify(mine)), realAddStep(a), `action ${a.id}`);
  }
});

test("hydrateStep: user values, kg -> tenths rounding, stages", () => {
  const a = LIB[1]; // combined, library default 7.5 kg
  const h = (weightKg) => A.hydrateStep({ actionId: 305, sets: 4, reps: 9, restSeconds: 90, weightKg }, a, { stage: 2, sort: 3 });
  assert.equal(h(12.5).sideWeight, 125);
  assert.equal(h(0.1).sideWeight, 1);
  assert.equal(h(0).sideWeight, 0);
  assert.equal(h(20).sideWeight, 200);
  assert.equal(h(0.3).sideWeight, 3); // 0.3 * 10 = 3.0000000000000004
  assert.equal(h(1.1).sideWeight, 11);
  assert.equal(h(undefined).sideWeight, 75); // library default
  const s = h(5);
  assert.deepEqual([s.groupNum, s.count, s.restTime, s.sort, s.stage, s.mode, s.modeParam], [4, 9, 90, 3, 2, 0, "{}"]);
  const t = A.hydrateStep({ actionId: 330, sets: 2, seconds: 45 }, LIB[4], { stage: 3 });
  assert.deepEqual([t.count, t.countType, t.restTime, t.stage], [45, 2, 30, 3]);
});

test("kg stays kg regardless of the account unit: stored value is tenths of kg only", () => {
  const r = parse([okRoutine({ main: [{ actionId: 305, sets: 3, reps: 8, weightKg: 22.5 }] })]);
  assert.equal(r.programs[0].program.mainStepList[0].sideWeight, 225);
});

test("real library: every action can be used in a minimal valid step", () => {
  const steps = REAL.map((a) => {
    const timed = a.countType === 2;
    return { actionId: a.id, sets: 1, ...(timed ? { seconds: 30 } : { reps: 10 }) };
  });
  const chunks = [];
  for (let i = 0; i < steps.length; i += 40) chunks.push(steps.slice(i, i + 40));
  const r = A.parseRoutines(file(chunks.map((c, i) => ({ name: "R" + i, main: c }))), REAL);
  assert.deepEqual(r.errors, []);
});

test("ProgramIOCore.parseImport dispatches by format; program format is unchanged", () => {
  const rt = IO.parseImport(file([okRoutine()]), { library: LIB });
  assert.equal(rt.fatal, null);
  assert.equal(rt.kind, "routines");
  assert.equal(rt.programs[0].name, "Push A");
  assert.deepEqual(rt.programs[0].errors, []);
  assert.equal(IO.parseImport(file([okRoutine()])).fatal.code, "library-unavailable");
  // tolerant extraction only when asked
  assert.equal(IO.parseImport("hi " + file([okRoutine()]), { library: LIB }).fatal.code, "bad-json");
  assert.equal(IO.parseImport("hi " + file([okRoutine()]), { library: LIB, tolerant: true }).fatal, null);
  const prog = JSON.stringify({ format: "myinnox1-program", formatVersion: 1, programs: [] });
  assert.equal(IO.parseImport(prog).fatal.code, "no-programs");
  assert.equal(IO.parseImport(prog).kind, undefined);
});
