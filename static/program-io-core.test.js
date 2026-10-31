// Run with: node --test static/
const test = require("node:test");
const assert = require("node:assert/strict");
const C = require("./program-io-core.js");

const step = (o = {}) => ({
  id: 16548, courseId: 2266, sort: 1, actionLibraryId: 525, actionName: "Incline Bench Press (Bar)", actionNo: "LM025",
  actionType: 3, picUrl: "p.png", videoUrl: "v.mp4", stage: 2, count: 12, consume: null, sideNum: 2, countType: 1,
  sideWeight: 100, muscleGroups: "1,2,12", muscleParts: "1,4", trainingPoint: "x\r\ny", reqParts: "3,6", restTime: 45,
  groupNum: 3, mode: 0, modeParam: "{}", breathTip: "b", custom: false, duration: 12, ...o,
});
const course = (o = {}) => ({
  id: 2266, courseNo: "LM2026-10-28_21", name: "Rutina A", level: 1, courseType: 1, smallImg: "s.jpg", detailsImg: "d.jpg",
  deviceCategory: 7, sportType: 2, muscleParts: "1,2", tags: null, custom: null, duration: 55, capacity: 0,
  heartRateMin: 0, heartRateMax: 0, actionNum: null, collected: false, description: "",
  deviceTypeList: ["35"], partsList: ["1", "13"],
  warmUpStepList: [], mainStepList: [step(), step({ id: 2, sort: 2, actionLibraryId: 535, sideNum: 1, sideWeight: 68 })], relaxStepList: [],
  ...o,
});

test("buildExport wraps programs, strips ids and keeps stored weights untouched", () => {
  const exp = C.buildExport([course()], { appVersion: "abc123", now: Date.UTC(2026, 9, 31, 12) });
  assert.equal(exp.format, "myinnox1-program");
  assert.equal(exp.formatVersion, 1);
  assert.equal(exp.exportedAt, "2026-10-31T12:00:00.000Z");
  assert.equal(exp.app, "MyInnoX1 abc123");
  const p = exp.programs[0];
  for (const k of C.STRIP_COURSE) assert.ok(!(k in p), k);
  for (const s of p.mainStepList) { assert.ok(!("id" in s)); assert.ok(!("courseId" in s)); }
  assert.deepEqual(p.mainStepList.map((s) => s.sideWeight), [100, 68]); // tenths of kg, unconverted
  assert.equal(p.mainStepList[0].trainingPoint, "x\r\ny");
});

test("buildExport does not mutate its input and accepts one course", () => {
  const c = course();
  const before = JSON.stringify(c);
  const exp = C.buildExport(c);
  assert.equal(JSON.stringify(c), before);
  assert.equal(exp.programs.length, 1);
  assert.equal(exp.app, "MyInnoX1");
});

test("missing step lists export as empty arrays", () => {
  const c = course(); delete c.warmUpStepList; delete c.relaxStepList;
  const p = C.buildExport(c).programs[0];
  assert.deepEqual(p.warmUpStepList, []);
  assert.deepEqual(p.relaxStepList, []);
});

test("export -> parseImport round trip", () => {
  const text = JSON.stringify(C.buildExport([course(), course({ name: "Rutina B" })]));
  const r = C.parseImport(text);
  assert.equal(r.fatal, null);
  assert.deepEqual(r.programs.map((p) => p.name), ["Rutina A", "Rutina B"]);
  assert.ok(r.programs.every((p) => p.errors.length === 0));
});

test("parseImport fatal cases", () => {
  assert.equal(C.parseImport("{nope").fatal.code, "bad-json");
  assert.equal(C.parseImport("").fatal.code, "bad-json");
  assert.equal(C.parseImport("[]").fatal.code, "wrong-format");
  assert.equal(C.parseImport(JSON.stringify({ format: "other", formatVersion: 1, programs: [] })).fatal.code, "wrong-format");
  assert.equal(C.parseImport(JSON.stringify({ format: "myinnox1-program", programs: [] })).fatal.code, "wrong-format");
  const newer = C.parseImport(JSON.stringify({ format: "myinnox1-program", formatVersion: 2, programs: [{}] }));
  assert.equal(newer.fatal.code, "newer-version");
  assert.equal(newer.fatal.version, 2);
  assert.equal(C.parseImport(JSON.stringify({ format: "myinnox1-program", formatVersion: 1, programs: [] })).fatal.code, "no-programs");
  assert.equal(C.parseImport(JSON.stringify({ format: "myinnox1-program", formatVersion: 1 })).fatal.code, "no-programs");
});

test("parseImport tolerates a BOM", () => {
  const text = "﻿" + JSON.stringify(C.buildExport([course()]));
  assert.equal(C.parseImport(text).fatal, null);
});

test("validation reports per-program problems without dropping the others", () => {
  const good = C.sanitizeProgram(course());
  const noName = { ...good, name: "  " };
  const noSteps = { ...good, name: "Empty", warmUpStepList: [], mainStepList: [], relaxStepList: [] };
  const badStep = { ...good, name: "Bad", mainStepList: [{ actionLibraryId: "x", count: -1, sideWeight: 10.5 }, 5] };
  const badList = { ...good, name: "L", mainStepList: "nope" };
  const r = C.parseImport(JSON.stringify({ format: "myinnox1-program", formatVersion: 1, programs: [good, noName, noSteps, badStep, badList, 7] }));
  assert.equal(r.fatal, null);
  assert.equal(r.programs.length, 6);
  assert.deepEqual(r.programs[0].errors, []);
  assert.deepEqual(r.programs[1].errors.map((e) => e.code), ["no-name"]);
  assert.deepEqual(r.programs[2].errors.map((e) => e.code), ["no-steps"]);
  const fields = r.programs[3].errors.filter((e) => e.code === "step-field").map((e) => e.field).sort();
  assert.deepEqual(fields, ["actionLibraryId", "count", "sideWeight"]);
  assert.ok(r.programs[3].errors.some((e) => e.code === "step-not-object" && e.step === 2));
  assert.ok(r.programs[4].errors.some((e) => e.code === "list-not-array" && e.list === "mainStepList"));
  assert.equal(r.programs[5].errors[0].code, "program-not-object");
  assert.equal(r.programs[5].name, "");
});

test("steps of every sideNum / countType validate", () => {
  for (const sideNum of [0, 1, 2]) for (const countType of [1, 2]) {
    const p = C.sanitizeProgram(course({ mainStepList: [step({ sideNum, countType, sideWeight: sideNum ? 50 : 0 })] }));
    assert.deepEqual(C.validateProgram(p), []);
  }
});

test("large programs round-trip", () => {
  const many = Array.from({ length: 200 }, (_, i) => step({ id: i, sort: i + 1, actionLibraryId: 500 + i }));
  const exp = C.buildExport([course({ mainStepList: many })]);
  const r = C.parseImport(JSON.stringify(exp));
  assert.equal(r.programs[0].program.mainStepList.length, 200);
  assert.deepEqual(r.programs[0].errors, []);
});

test("cloneName", () => {
  assert.equal(C.cloneName("Rutina A", []), "Rutina A (copy)");
  assert.equal(C.cloneName("Rutina A", ["Rutina A (copy)"]), "Rutina A (copy 2)");
  assert.equal(C.cloneName("Rutina A", ["Rutina A (copy)", "rutina a (COPY 2)"]), "Rutina A (copy 3)");
  assert.equal(C.cloneName("Rutina A (copy)", ["Rutina A (copy)"]), "Rutina A (copy 2)");
  assert.equal(C.cloneName("Rutina A (copy 2)", ["Rutina A", "Rutina A (copy)", "Rutina A (copy 2)"]), "Rutina A (copy 3)");
  assert.equal(C.cloneName("Rutina A", ["Rutina A (copia)"], "copia"), "Rutina A (copia 2)");
  assert.equal(C.cloneName("Rutina (a.b)", []), "Rutina (a.b) (copy)");
  assert.equal(C.cloneName("(copy)", []), "(copy) (copy)");
  assert.equal(C.cloneName("", []), "(copy)");
  assert.equal(C.cloneName(null, undefined), "(copy)");
});

test("uniqueName keeps free names and renames collisions", () => {
  assert.equal(C.uniqueName("Rutina A", ["Rutina B"]), "Rutina A");
  assert.equal(C.uniqueName("  Rutina A ", ["rutina a"]), "Rutina A (copy)");
  assert.equal(C.uniqueName("Rutina A", ["Rutina A", "Rutina A (copy)"]), "Rutina A (copy 2)");
});

test("toSaveBody: create body has no id, renumbers sort, keeps weights, overrides name", () => {
  const exp = C.buildExport([course()]).programs[0];
  const body = C.toSaveBody(exp, { name: " Copia " });
  assert.ok(!("id" in body) && !("courseNo" in body));
  assert.equal(body.name, "Copia");
  assert.deepEqual(body.mainStepList.map((s) => s.sort), [1, 2]);
  assert.deepEqual(body.mainStepList.map((s) => s.sideWeight), [100, 68]);
  assert.ok(body.mainStepList.every((s) => !("id" in s) && !("courseId" in s)));
  assert.equal(body.smallImg, "s.jpg");
  assert.equal(body.duration, 55);
});

test("toSaveBody: also works on a raw detail object and does not mutate it", () => {
  const raw = course();
  const before = JSON.stringify(raw);
  const body = C.toSaveBody(raw);
  assert.equal(JSON.stringify(raw), before);
  assert.ok(!("id" in body));
  assert.equal(body.name, "Rutina A");
});

test("toSaveBody fills omitted top-level fields and recomputes duration", () => {
  const body = C.toSaveBody({ name: "Mini", mainStepList: [step({ duration: 12, consume: 2 }), step({ duration: 0 })] });
  assert.equal(body.level, 1);
  assert.deepEqual(body.deviceTypeList, ["35"]);
  assert.deepEqual(body.warmUpStepList, []);
  assert.equal(body.duration, 12 + 1);
  assert.equal(body.capacity, 20);
  assert.ok(body.smallImg.startsWith("https://"));
});

test("slug and exportFilename", () => {
  assert.equal(C.slug("Rutina Ñandú: Pecho/Espalda!"), "rutina-nandu-pecho-espalda");
  assert.equal(C.slug("日本語"), "program");
  assert.equal(C.slug(null), "program");
  const now = Date.UTC(2026, 9, 31, 12);
  assert.equal(C.exportFilename({ name: "Rutina A" }, now), "myinnox1-rutina-a-2026-10-31.json");
  assert.equal(C.exportFilename([{ name: "a" }, { name: "b" }], now), "myinnox1-all-2-2026-10-31.json");
  assert.equal(C.exportFilename([{ name: "a" }], now), "myinnox1-a-2026-10-31.json");
});

test("safeMessage hides CJK upstream text, keeps readable text", () => {
  const C = require("./program-io-core.js");
  assert.equal(C.safeMessage(new Error("系统异常，请稍后重试"), "fallback"), "fallback");
  assert.equal(C.safeMessage(new Error("Name too long"), "fallback"), "Name too long");
  assert.equal(C.safeMessage(null, "fallback"), "fallback");
  assert.equal(C.safeMessage({ message: "" }, "fallback"), "fallback");
});
