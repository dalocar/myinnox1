// Run with: node --test static/
const test = require("node:test");
const assert = require("node:assert/strict");
const M = require("./step-mode-core.js");

test("serialize matches what the official app stores", () => {
  assert.equal(M.serialize(0, {}), "{}");
  assert.equal(M.serialize(1, { kgLX1: 150, kgLX2: 100 }), '{"kgLX1":150,"kgLX2":100}');
  assert.equal(M.serialize(2, { kgTL1: 100, kgTL2: 150, kgTL3: 500 }), '{"kgTL1":100,"kgTL2":150,"kgTL3":500}');
  assert.equal(M.serialize(3, { kgSD1: 500 }), '{"kgSD1":500}');
});

test("serialize fills defaults and drops other modes' keys", () => {
  assert.equal(M.serialize(1, {}), '{"kgLX1":150,"kgLX2":100}');
  assert.equal(M.serialize(3, { kgSD1: 800, kgLX1: 999 }), '{"kgSD1":800}');
  assert.equal(M.serialize(1, { kgLX1: -5, kgLX2: "x" }), '{"kgLX1":150,"kgLX2":100}');
  assert.equal(M.serialize(1, { kgLX1: 200.4 }), '{"kgLX1":200,"kgLX2":100}');
});

test("modeOf: missing mode is Standard, unknown modes are flagged", () => {
  assert.equal(M.modeOf({}).id, 0);
  assert.equal(M.modeOf({ mode: null }).known, true);
  assert.equal(M.modeOf({ mode: "2" }).id, 2);
  assert.deepEqual([M.modeOf({ mode: 6 }).id, M.modeOf({ mode: 6 }).known], [6, false]);
});

test("values reads the stored param, tolerating junk and stale keys", () => {
  const s = { mode: 2, modeParam: '{"kgTL1":80,"kgTL2":200,"kgTL3":600,"kgLX1":150}' };
  assert.deepEqual(M.values(s), { kgTL1: 80, kgTL2: 200, kgTL3: 600 });
  assert.deepEqual(M.values({ mode: 3, modeParam: "not json" }), { kgSD1: 500 });
  assert.deepEqual(M.values({ mode: 1, modeParam: null }), { kgLX1: 150, kgLX2: 100 });
  assert.deepEqual(M.values({ mode: 0, modeParam: "{}" }), {});
  assert.deepEqual(M.values({ mode: 6, modeParam: null }), {});
});

test("setMode: defaults on first switch, keeps the step's own values when re-applied", () => {
  const s = { mode: 0, modeParam: "{}", sideWeight: 50 };
  M.setMode(s, 1);
  assert.deepEqual([s.mode, s.modeParam], [1, '{"kgLX1":150,"kgLX2":100}']);
  M.setValue(s, "kgLX1", 200);
  M.setMode(s, 1);
  assert.equal(s.modeParam, '{"kgLX1":200,"kgLX2":100}');
  M.setMode(s, 0);
  assert.deepEqual([s.mode, s.modeParam, s.sideWeight], [0, "{}", 50]);
  M.setMode(s, 9);
  assert.equal(s.mode, 0);
});

test("setValue only touches fields of the active mode", () => {
  const s = { mode: 3, modeParam: '{"kgSD1":500}' };
  M.setValue(s, "kgLX1", 10);
  assert.equal(s.modeParam, '{"kgSD1":500}');
  M.setValue(s, "kgSD1", 800);
  assert.equal(s.modeParam, '{"kgSD1":800}');
  M.setValue(s, "kgSD1", -1);
  assert.equal(s.modeParam, '{"kgSD1":800}');
});

test("setModeAll skips weightless and unknown-mode steps, reports the count", () => {
  const steps = [
    { sideNum: 2, mode: 0 }, { sideNum: 1, mode: 0 }, { sideNum: 0, mode: 0 }, { sideNum: 2, mode: 6 }, { sideNum: 2, mode: 1, modeParam: '{"kgLX1":170,"kgLX2":90}' },
  ];
  assert.equal(M.setModeAll(steps, 1), 2);
  assert.deepEqual(steps.map((s) => s.mode), [1, 1, 0, 6, 1]);
  assert.equal(steps[4].modeParam, '{"kgLX1":170,"kgLX2":90}');
  assert.equal(M.supportsMode({ sideNum: 0 }), false);
  assert.equal(M.supportsMode({ sideNum: 2 }), true);
});

test("validate: non-standard modes need values above zero", () => {
  assert.equal(M.validate({ mode: 0, modeParam: "{}" }), null);
  assert.equal(M.validate({ mode: 6, modeParam: null }), null);
  assert.equal(M.validate({ mode: 1, modeParam: '{"kgLX1":150,"kgLX2":100}' }), null);
  assert.equal(M.validate({ mode: 1, modeParam: '{"kgLX1":0,"kgLX2":100}' }), "Enter a force above zero.");
  assert.equal(M.validate({ mode: 3, modeParam: "{}" }), "Enter a value above zero.");
});
