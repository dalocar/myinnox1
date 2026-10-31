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
