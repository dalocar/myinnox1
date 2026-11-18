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
  assert.equal(M.serialize(1, { kgLX1: "x", kgLX2: "y" }), '{"kgLX1":150,"kgLX2":100}');
  assert.equal(M.serialize(1, { kgLX1: -5, kgLX2: 100 }), '{"kgLX1":30,"kgLX2":20}');
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
  assert.equal(s.modeParam, '{"kgSD1":100}');
  M.setValue(s, "kgSD1", "x");
  assert.equal(s.modeParam, '{"kgSD1":100}');
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

test("normalize rewrites missing or malformed params with the shown defaults, and only then", () => {
  const bad = { mode: 2, modeParam: "{bad" };
  assert.equal(M.normalize(bad), true);
  assert.equal(bad.modeParam, '{"kgTL1":100,"kgTL2":150,"kgTL3":500}');
  const partial = { mode: 1, modeParam: '{"kgLX1":200}' };
  M.normalize(partial);
  assert.equal(partial.modeParam, '{"kgLX1":200,"kgLX2":100}');
  const stale = { mode: 3, modeParam: '{"kgSD1":800,"kgLX1":150}' };
  assert.equal(M.normalize(stale), false);
  assert.equal(stale.modeParam, '{"kgSD1":800,"kgLX1":150}');
  const unknown = { mode: 6, modeParam: null };
  assert.equal(M.normalize(unknown), false);
  assert.equal(unknown.modeParam, null);
  const std = { mode: 0, modeParam: "" };
  assert.equal(M.normalize(std), false);
});

test("imperial: lb keys are written after the kg keys, as the official app does", () => {
  assert.equal(M.toLbTenths(150), 331);
  assert.equal(M.toLbTenths(100), 220);
  assert.equal(M.toLbTenths(600), 1323);
  assert.equal(M.serialize(1, { kgLX1: 150, kgLX2: 100 }, { lb: true }), '{"kgLX1":150,"kgLX2":100,"lbLX1":331,"lbLX2":220}');
  assert.equal(M.serialize(2, {}, { lb: true }), '{"kgTL1":100,"kgTL2":150,"kgTL3":500,"lbTL1":220,"lbTL2":331}');
  assert.equal(M.serialize(3, {}, { lb: true }), '{"kgSD1":500}');
  assert.equal(M.serialize(1, {}), '{"kgLX1":150,"kgLX2":100}');
});

test("imperial accounts get lb keys on setMode and setValue; metric accounts do not", () => {
  const s = { mode: 0, modeParam: "{}" };
  M.setMode(s, 1, { imperial: true });
  assert.equal(s.modeParam, '{"kgLX1":150,"kgLX2":100,"lbLX1":331,"lbLX2":220}');
  M.setValue(s, "kgLX1", 600, { imperial: true });
  assert.equal(s.modeParam, '{"kgLX1":600,"kgLX2":100,"lbLX1":1323,"lbLX2":220}');
  const m = { mode: 0, modeParam: "{}" };
  M.setMode(m, 1, { imperial: false });
  assert.equal(m.modeParam, '{"kgLX1":150,"kgLX2":100}');
});

test("a step that already has lb keys keeps them in step with kg, even on a metric account", () => {
  const s = { mode: 1, modeParam: '{"kgLX1":150,"kgLX2":100,"lbLX1":331,"lbLX2":220}' };
  M.setValue(s, "kgLX1", 200, { imperial: false });
  assert.equal(s.modeParam, '{"kgLX1":200,"kgLX2":100,"lbLX1":441,"lbLX2":220}');
  M.setMode(s, 2, { imperial: false });
  assert.equal(s.modeParam, '{"kgTL1":100,"kgTL2":150,"kgTL3":500,"lbTL1":220,"lbTL2":331}');
});

test("normalize adds missing or stale lb keys: always when the step has some, otherwise on imperial accounts only", () => {
  const plain = { mode: 1, modeParam: '{"kgLX1":600,"kgLX2":100}' };
  assert.equal(M.needsNormalize(plain, { imperial: false }), false);
  assert.equal(M.normalize(plain, { imperial: false }), false);
  assert.equal(M.normalize(plain, { imperial: true }), true);
  assert.equal(plain.modeParam, '{"kgLX1":600,"kgLX2":100,"lbLX1":1323,"lbLX2":220}');
  assert.equal(M.normalize(plain, { imperial: true }), false);
  // like the official app's own program: lbLX1 only
  const half = { mode: 1, modeParam: '{"kgLX1":600,"kgLX2":100,"lbLX1":1323}' };
  assert.equal(M.normalize(half, { imperial: false }), true);
  assert.equal(half.modeParam, '{"kgLX1":600,"kgLX2":100,"lbLX1":1323,"lbLX2":220}');
  const stale = { mode: 1, modeParam: '{"kgLX1":200,"kgLX2":100,"lbLX1":331,"lbLX2":220}' };
  assert.equal(M.normalize(stale, { imperial: false }), true);
  assert.equal(stale.modeParam, '{"kgLX1":200,"kgLX2":100,"lbLX1":441,"lbLX2":220}');
  const std = { mode: 0, modeParam: "{}" };
  assert.equal(M.normalize(std, { imperial: true }), false);
});

test("the official app's saved imperial eccentric data is already consistent", () => {
  const a = { mode: 1, modeParam: '{"kgLX1":150,"kgLX2":100,"kgTL1":100,"kgTL2":150,"kgTL3":500,"kgSD1":500,"lbLX1":331,"lbLX2":220}' };
  assert.equal(M.needsNormalize(a, { imperial: true }), false);
});

test("ranges measured in the official app: values clamp into min/max", () => {
  const lim = (m, k) => M.byId(m).fields.find((f) => f.key === k);
  assert.deepEqual([lim(1, "kgLX1").min, lim(1, "kgLX1").max], [30, 600]);
  assert.deepEqual([lim(1, "kgLX2").min, lim(1, "kgLX2").max], [20, 590]);
  assert.deepEqual([lim(2, "kgTL1").min, lim(2, "kgTL1").max], [20, 590]);
  assert.deepEqual([lim(2, "kgTL2").min, lim(2, "kgTL2").max], [30, 600]);
  assert.deepEqual([lim(2, "kgTL3").min, lim(2, "kgTL3").max], [20, 2500]);
  assert.deepEqual([lim(3, "kgSD1").min, lim(3, "kgSD1").max], [100, 2500]);
  const e = { mode: 1, modeParam: "{}" };
  M.setValue(e, "kgLX1", 999999);
  assert.equal(M.values(e).kgLX1, 600);
  M.setValue(e, "kgLX1", 0);
  assert.equal(M.values(e).kgLX1, 30);
  assert.equal(M.serialize(2, { kgTL3: 1e9 }), '{"kgTL1":100,"kgTL2":150,"kgTL3":2500}');
  assert.equal(M.serialize(3, { kgSD1: 5 }), '{"kgSD1":100}');
});

test("Concentric stays at least 1 kg below Eccentric, whichever field is edited", () => {
  const s = { mode: 1, modeParam: "{}" };                       // 15 / 10
  M.setValue(s, "kgLX1", 600); M.setValue(s, "kgLX2", 999999);   // concentric capped at 59 kg
  assert.equal(s.modeParam, '{"kgLX1":600,"kgLX2":590}');
  M.setValue(s, "kgLX1", 300);                                   // lowering Eccentric pulls Concentric down
  assert.equal(M.values(s).kgLX2, 290);
  M.setValue(s, "kgLX2", 400);                                   // the official app allows this; we clamp it
  assert.equal(M.values(s).kgLX2, 290);
  M.setValue(s, "kgLX1", 0);                                     // Eccentric min 3 kg -> Concentric at most 2 kg
  assert.deepEqual([M.values(s).kgLX1, M.values(s).kgLX2], [30, 20]);
});

test("Spring max force stays at least 0.5 kg above Initial, whichever field is edited", () => {
  const s = { mode: 2, modeParam: "{}" };                        // 10 / 15 / 0.5 m
  M.setValue(s, "kgTL1", 9999);                                  // initial capped at 59 kg, max follows to 59.5
  assert.deepEqual([M.values(s).kgTL1, M.values(s).kgTL2], [590, 595]);
  M.setValue(s, "kgTL2", 0);                                     // max min 3 kg, but never below initial + 0.5
  assert.equal(M.values(s).kgTL2, 595);
  M.setValue(s, "kgTL1", 100); M.setValue(s, "kgTL2", 120);
  assert.deepEqual([M.values(s).kgTL1, M.values(s).kgTL2], [100, 120]);
});

test("untouched stored values are not rewritten, even if the official app left an unordered pair", () => {
  const s = { mode: 1, modeParam: '{"kgLX1":30,"kgLX2":400}' };
  assert.equal(M.normalize(s, { imperial: false }), false);
  assert.equal(s.modeParam, '{"kgLX1":30,"kgLX2":400}');
});

test("imperial: the typed pounds are kept in the lb key, not re-derived from the rounded kg", () => {
  const s = { mode: 2, modeParam: "{}" };
  M.setValue(s, "kgTL1", 181, { imperial: true, typed: 400 });      // 40.0 lb -> 18.1 kg
  const p = JSON.parse(s.modeParam);
  assert.deepEqual([p.kgTL1, p.lbTL1], [181, 400]);                 // derived would be 399
  M.setValue(s, "kgTL2", 300, { imperial: true });                  // editing another field keeps lbTL1 as typed
  assert.equal(JSON.parse(s.modeParam).lbTL1, 400);
  M.setValue(s, "kgTL1", 200, { imperial: true });                  // a kg change without typed lb re-derives it
  assert.equal(JSON.parse(s.modeParam).lbTL1, 441);
  M.setValue(s, "kgTL1", 181, { imperial: true, typed: 999 });      // a typed value far from the kg value is ignored
  assert.equal(JSON.parse(s.modeParam).lbTL1, 399);
});

test("the official app's own imperial program keeps its typed lb keys through normalize", () => {
  const s = { mode: 2, modeParam: '{"lbLX1":150,"lbLX2":140,"kgLX1":68,"kgLX2":64,"lbTL1":610,"lbTL2":615,"kgTL3":500,"kgTL1":277,"kgTL2":279}' };
  assert.equal(M.normalize(s, { imperial: true }), false);
  assert.equal(M.needsNormalize(s, { imperial: true }), false);
});

test("lbValues returns the stored lb values that match the kg value, for display", () => {
  const s = { mode: 1, modeParam: '{"kgLX1":454,"kgLX2":227,"lbLX1":1000,"lbLX2":500}' };
  assert.deepEqual(M.lbValues(s), { kgLX1: 1000, kgLX2: 500 });
  assert.deepEqual(M.lbValues({ mode: 1, modeParam: '{"kgLX1":454,"kgLX2":227,"lbLX1":2000}' }), {});   // lb far from kg: ignored
  assert.deepEqual(M.lbValues({ mode: 0, modeParam: "{}" }), {});
  assert.deepEqual(M.lbValues({ mode: 3, modeParam: '{"kgSD1":500}' }), {});
});
