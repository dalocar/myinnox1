// Run with: node --test static/
const test = require("node:test");
const assert = require("node:assert/strict");
const U = require("./units-core.js");

const M = 0, I = 1;

test("normalizeUnit / unitFromProfile: only 1 is Imperial", () => {
  assert.equal(U.normalizeUnit(1), I);
  assert.equal(U.normalizeUnit("1"), I);
  for (const v of [0, "0", null, undefined, NaN, 2, "x", {}]) assert.equal(U.normalizeUnit(v), M);
  assert.equal(U.unitFromProfile({ unit: 1 }), I);
  assert.equal(U.unitFromProfile({ unit: 0 }), M);
  assert.equal(U.unitFromProfile({}), M);
  assert.equal(U.unitFromProfile(null), M);
  assert.equal(U.unitFromProfile(undefined), M);
});

test("label", () => {
  assert.equal(U.label(M), "kg");
  assert.equal(U.label(I), "lb");
  assert.equal(U.label(undefined), "kg");
});

test("tenths -> display (values seen in the official app)", () => {
  assert.equal(U.fromTenths(100, I), 22.0); // Calf Raise: 10.0 kg
  assert.equal(U.fromTenths(100, M), 10.0);
  assert.equal(U.fromTenths(68, I), 15.0);  // Rear Extension: 6.8 kg
  assert.equal(U.fromTenths(68, M), 6.8);
  assert.equal(U.fromTenths(50, I), 11.0);  // 5.0 kg
  assert.equal(U.fromTenths(0, I), 0);
});

test("display -> tenths rounds to 0.1 kg", () => {
  assert.equal(U.toTenths(22, I), 100); // 22 lb -> 9.979 kg -> 10.0 kg
  assert.equal(U.toTenths(15, I), 68);  // 15 lb -> 6.804 kg -> 6.8 kg
  assert.equal(U.toTenths(11, I), 50);  // 11 lb -> 4.989 kg -> 5.0 kg
  assert.equal(U.toTenths(10, M), 100);
  assert.equal(U.toTenths(6.8, M), 68);
  assert.equal(U.toTenths(0.1, M), 1);
  assert.equal(U.toTenths(2.25, M), 23); // rounds, never fractional
  assert.ok(Number.isInteger(U.toTenths(13.37, I)));
});

test("round trips are stable for every stored value up to 200 kg", () => {
  for (let tenths = 0; tenths <= 2000; tenths++) {
    // what the editor shows must save back to the same stored value
    assert.equal(U.toTenths(U.fromTenths(tenths, I), I), tenths, `imperial ${tenths}`);
    assert.equal(U.toTenths(U.fromTenths(tenths, M), M), tenths, `metric ${tenths}`);
  }
});

test("lb typed by users: whole pounds survive a save/display cycle within 0.1 kg", () => {
  for (let lb = 1; lb <= 400; lb++) {
    const shown = U.fromTenths(U.toTenths(lb, I), I);
    // 0.1 kg = 0.22 lb of rounding at most (plus display rounding)
    assert.ok(Math.abs(shown - lb) <= 0.12 + 1e-9, `${lb} -> ${shown}`);
  }
});

test("bad input -> 0, never NaN", () => {
  for (const v of [null, undefined, NaN, "abc", Infinity]) {
    assert.equal(U.fromTenths(v, I), 0);
    assert.equal(U.fromTenths(v, M), 0);
    assert.equal(U.toTenths(v, I), 0);
    assert.equal(U.toTenths(v, M), 0);
    assert.equal(U.kgToDisplay(v, I), 0);
    assert.equal(U.displayToKg(v, I), 0);
  }
  assert.equal(U.fromTenths("100", I), 22.0); // numeric strings are fine
});

test("plain kg <-> display (profile fields)", () => {
  assert.equal(U.kgToDisplay(70, M), 70);
  assert.equal(U.kgToDisplay(70, I), 154.3);
  assert.equal(U.kgToDisplay(54.7, I), 120.6);
  assert.equal(U.displayToKg(154.3, I), 70);
  assert.equal(U.displayToKg(70.04, M), 70);
});

test("formatting", () => {
  assert.equal(U.fmtTenths(100, I), "22.0");
  assert.equal(U.fmtTenths(100, M), "10.0");
  assert.equal(U.fmtTenths(7, M), "0.7");
  assert.equal(U.fmtWeight(100, I), "22.0 lb");
  assert.equal(U.fmtWeight(68, M), "6.8 kg");
  assert.equal(U.fmtWeight(null, M), "0.0 kg");
});

test("unitText relabels embedded kg in every pack's strings; Metric is a no-op", () => {
  const cases = [
    ["Weight (kg)", "Weight (lb)"],
    ["Kg / side", "Lb / side"],
    ["kg / côté", "lb / côté"],
    ["kg/Seite", "lb/Seite"],
    ["体重（kg）", "体重（lb）"],
    ["Volume {a} kg", "Volume {a} lb"],
    ["Peso por lado (kg)", "Peso por lado (lb)"],
  ];
  for (const [src, out] of cases) {
    assert.equal(U.unitText(src, I), out);
    assert.equal(U.unitText(src, M), src);
  }
  assert.equal(U.unitText("kilogram skg", I), "kilogram skg"); // whole word only
  assert.equal(U.unitText(null, I), "");
});
