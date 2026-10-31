const test = require("node:test");
const assert = require("node:assert/strict");
const X = require("./theme-fx-xmas.js");

const seq = (...v) => { let i = 0; return () => v[i++ % v.length]; };

test("makeFlakes: count, bounds, small radii", () => {
  const f = X.makeFlakes(40, 300, 500, seq(0.1, 0.5, 0.9));
  assert.equal(f.length, 40);
  for (const k of f) { assert.ok(k.x >= 0 && k.x <= 300 && k.y >= 0 && k.y <= 500); assert.ok(k.r >= 1 && k.r <= 3.7); assert.ok(k.vy > 0); }
});
test("wrap keeps values inside [-pad, max+pad)", () => {
  assert.equal(X.wrap(105, 100, 5), -5);
  assert.equal(X.wrap(-6, 100, 5), 104);
  assert.equal(X.wrap(50, 100, 5), 50);
});
test("stepFlake falls and wraps to the top", () => {
  const f = { x: 10, y: 99, r: 2, vy: 100, vx: 0, ph: 0, sw: 1 };
  X.stepFlake(f, 0.1, 200, 100, 0);
  assert.ok(f.y < 10, "wrapped: " + f.y);
  const g = { x: 10, y: 10, r: 2, vy: 20, vx: 0, ph: 0, sw: 1 };
  X.stepFlake(g, 0.5, 200, 100, 0);
  assert.ok(Math.abs(g.y - 20) < 1e-9);
});
test("frame budget: needs >= 2s window and avg > 24ms", () => {
  const s = X.newStats();
  for (let i = 0; i < 30; i++) X.addSample(s, 40, 33);
  assert.equal(X.budgetExceeded(s), false); // ~1s only
  for (let i = 0; i < 40; i++) X.addSample(s, 40, 33);
  assert.equal(X.budgetExceeded(s), true);
  const ok = X.newStats();
  for (let i = 0; i < 200; i++) X.addSample(ok, 2, 16.7);
  assert.equal(X.budgetExceeded(ok), false);
  assert.equal(X.budgetExceeded(X.newStats()), false);
});
test("isDataScreen", () => {
  for (const t of ["plans", "actions", "history", "fitness"]) assert.equal(X.isDataScreen(t, false), true);
  assert.equal(X.isDataScreen("profile", false), false);
  assert.equal(X.isDataScreen("programs", false), false);
  assert.equal(X.isDataScreen("programs", true), true);
  assert.equal(X.isDataScreen("", false), false);
});
test("shooting star delay is 40-60s; burst specs", () => {
  assert.equal(X.nextStarDelay(() => 0), 40000);
  assert.equal(X.nextStarDelay(() => 1), 60000);
  const b = X.burstSpecs(14);
  assert.equal(b.length, 14);
  assert.ok(b.every((p) => p.size >= 5 && p.size <= 10 && [0, 1, 2].includes(p.shape)));
});
