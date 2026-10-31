// Run with: node --test static/
const test = require("node:test");
const assert = require("node:assert/strict");
const W = require("./weight-mode-core.js");

test("sideNum 1 / 2 / 0 map to Per side / Combined / No weight", () => {
  assert.deepEqual([W.modeFor(1).key, W.modeFor(1).label, W.modeFor(1).hasWeight], ["per-side", "Per side", true]);
  assert.deepEqual([W.modeFor(2).key, W.modeFor(2).label, W.modeFor(2).hasWeight], ["combined", "Combined", true]);
  assert.deepEqual([W.modeFor(0).key, W.modeFor(0).label, W.modeFor(0).hasWeight], ["none", "No weight", false]);
});

test("numeric strings behave like numbers", () => {
  assert.equal(W.modeFor("1").key, "per-side");
  assert.equal(W.modeFor("2").key, "combined");
  assert.equal(W.modeFor("0").key, "none");
});

test("unknown / missing sideNum never locks the weight field", () => {
  for (const v of [null, undefined, "", 3, -1, NaN, "abc"]) {
    const m = W.modeFor(v);
    assert.equal(m.key, "unknown", String(v));
    assert.equal(m.label, null);
    assert.equal(m.hasWeight, true);
  }
});

test("totalTenths: Combined doubles the stored per-cable value, others stay as stored", () => {
  assert.equal(W.totalTenths(2, 50), 100);   // Calf Raise 5.0 kg each cable -> 10.0 kg
  assert.equal(W.totalTenths(2, 100), 200);  // "Nuevo" Combined 10.0 -> 20.0 kg
  assert.equal(W.totalTenths(1, 50), 50);
  assert.equal(W.totalTenths(1, 100), 100);
  assert.equal(W.totalTenths(0, 100), 0);
  assert.equal(W.totalTenths(null, 70), 70);  // unknown: never invent a multiplier
  assert.equal(W.totalTenths("2", "50"), 100);
});

test("totalTenths: bad stored values never give NaN or negatives", () => {
  for (const v of [null, undefined, "", "abc", NaN, -5, 0]) assert.equal(W.totalTenths(2, v), 0, String(v));
});

test("breakdown: showTotal only for Combined", () => {
  assert.deepEqual(W.breakdown(2, 50), { perCable: 50, total: 100, showTotal: true });
  assert.deepEqual(W.breakdown(1, 50), { perCable: 50, total: 50, showTotal: false });
  assert.deepEqual(W.breakdown(0, 50), { perCable: 0, total: 0, showTotal: false });
  assert.deepEqual(W.breakdown(undefined, 50), { perCable: 50, total: 50, showTotal: false });
  assert.deepEqual(W.breakdown(2, NaN), { perCable: 0, total: 0, showTotal: true });
});

test("lb display: total is converted from stored tenths, not doubled from a rounded lb value", () => {
  const U = require("./units-core.js");
  // 5.0 kg per cable: 11.0 lb each, 22.0 lb total (both agree)
  assert.equal(U.fmtTenths(50, 1), "11.0");
  assert.equal(U.fmtTenths(W.totalTenths(2, 50), 1), "22.0");
  // 3.7 kg per cable: per cable 8.2 lb, converted total 16.3 lb; doubling the rounded 8.2 would say 16.4
  assert.equal(U.fmtTenths(37, 1), "8.2");
  assert.equal(U.fmtTenths(W.totalTenths(2, 37), 1), "16.3");
  assert.notEqual(U.fmtTenths(W.totalTenths(2, 37), 1), (U.fromTenths(37, 1) * 2).toFixed(1));
  // metric stays exact
  assert.equal(U.fmtTenths(W.totalTenths(2, 100), 0), "20.0");
  assert.equal(U.fmtTenths(W.totalTenths(2, 68), 0), "13.6");
});
