// Run with: node --test static/
const test = require("node:test");
const assert = require("node:assert/strict");
const C = require("./custom-action-core.js");

const base = { name: " Curl ", parts: ["6", "4"], level: 3, actionType: 1 };

test("equipment, per side, repetition (form defaults)", () => {
  assert.deepEqual(C.buildBody(base), {
    name: "Curl", muscleParts: "4,6", level: 3, actionType: 1, countType: 1, sideNum: 1, consume: 0,
  });
});

test("combined and timer map to sideNum 2 / countType 2", () => {
  const b = C.buildBody({ ...base, combined: true, timer: true });
  assert.equal(b.sideNum, 2);
  assert.equal(b.countType, 2);
});

test("bodyweight forces timer and sideNum 0, ignoring combined", () => {
  const b = C.buildBody({ ...base, bodyweight: true, combined: true, timer: false });
  assert.equal(b.sideNum, 0);
  assert.equal(b.countType, 2);
});

test("parts are deduped and sorted numerically; picUrl only when set", () => {
  assert.equal(C.buildBody({ ...base, parts: ["10", "2", "2"] }).muscleParts, "2,10");
  assert.equal("picUrl" in C.buildBody(base), false);
  assert.equal(C.buildBody({ ...base, picUrl: "https://x/y.jpg" }).picUrl, "https://x/y.jpg");
});

test("validate: name and parts required", () => {
  assert.equal(C.validate({ ...base, name: "  " }), "Enter a name.");
  assert.equal(C.validate({ ...base, parts: [] }), "Pick at least one body part.");
  assert.equal(C.validate(base), null);
});

test("describe round-trips the two real custom actions", () => {
  const per = C.describe({ muscleParts: "4", level: 1, actionType: 3, countType: 1, sideNum: 1 });
  assert.deepEqual(per, { parts: ["4"], level: 1, actionType: 3, bodyweight: false, timer: false, combined: false });
  assert.equal(C.describe({ sideNum: 2, countType: 1 }).combined, true);
  assert.equal(C.describe({ sideNum: 0, countType: 2 }).bodyweight, true);
  assert.deepEqual(C.describe(null).parts, []);
});

test("edit: toForm -> buildBody round-trips and carries the id", () => {
  const stored = { id: 2290, name: "Custom - Per side", muscleParts: "4,6", level: 2, actionType: 1, countType: 2, sideNum: 2 };
  const form = C.toForm(stored);
  assert.deepEqual(C.buildBody(form), {
    id: 2290, name: "Custom - Per side", muscleParts: "4,6", level: 2, actionType: 1, countType: 2, sideNum: 2, consume: 0,
  });
  assert.equal("id" in C.buildBody(base), false);
  const bw = C.toForm({ id: 5, name: "x", muscleParts: "1", level: 1, actionType: 2, countType: 2, sideNum: 0 });
  assert.equal(C.buildBody(bw).sideNum, 0);
});

test("uploadFields: usage 6 is required, extraParam 0 (captured from the official app)", () => {
  assert.deepEqual(C.uploadFields(), { usage: "6", extraParam: "0" });
});

test("validateImage: JPEG/PNG only, non-empty", () => {
  assert.equal(C.validateImage({ type: "image/jpeg", size: 10 }), null);
  assert.equal(C.validateImage({ type: "image/PNG", size: 10 }), null);
  assert.equal(C.validateImage({ type: "image/gif", size: 10 }), "Choose a JPEG or PNG image.");
  assert.equal(C.validateImage({ type: "image/jpeg", size: 0 }), "Choose a JPEG or PNG image.");
  assert.equal(C.validateImage(null), "Choose a JPEG or PNG image.");
});

test("fitSize: shrinks to the max edge, keeps aspect, never upscales", () => {
  assert.deepEqual(C.fitSize(4000, 3000), { width: 1024, height: 768, scaled: true });
  assert.deepEqual(C.fitSize(600, 3000, 1000), { width: 200, height: 1000, scaled: true });
  assert.deepEqual(C.fitSize(300, 200), { width: 300, height: 200, scaled: false });
  assert.deepEqual(C.fitSize(0, 0), { width: 1, height: 1, scaled: false });
});

test("uploadUrl: returns the hosted URL or throws", () => {
  const u = "https://power.renhesports.com/filestore/power/action-pic/1_0.jpg";
  assert.equal(C.uploadUrl({ code: 200, data: u }), u);
  assert.throws(() => C.uploadUrl({ data: null }));
  assert.throws(() => C.uploadUrl(undefined));
});
