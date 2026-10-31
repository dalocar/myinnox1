// Run with: node --test static/
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path");
const F = require("./fitness-core.js");

const REAL = [{ testId: 348, testTime: "2026-10-28", testType: 3, resultValue: 54.7, resultLevel: "C", resultLevelPercent: 9.12 }];

const FULL = [
  { testId: 452, testTime: "2026-10-30", testType: 2, resultValue: 41.0, resultLevel: "S+", resultLevelPercent: 90.48 },
  { testId: 451, testTime: "2026-10-30", testType: 4, resultValue: 190.0, resultLevel: "S", resultLevelPercent: 85.05 },
  { testId: 391, testTime: "2026-10-28", testType: 3, resultValue: 54.7, resultLevel: "C", resultLevelPercent: 8.98 },
];

test("real 3-test payload maps type 3=upper, 4=lower, 2=endurance", () => {
  const { slots, extras } = F.normalizeTests(FULL);
  const [u, l, e] = slots;
  assert.deepEqual([u.value, u.level, u.tested], [54.7, "C", true]);
  assert.deepEqual([l.value, l.level, l.tested], [190, "S", true]);
  assert.deepEqual([e.value, e.level, e.tested], [41, "S+", true]);
  assert.equal(extras.length, 0);
  assert.deepEqual(F.formatValue(l), { text: "190.0", unit: "kg" });
  assert.deepEqual(F.formatValue(e), { text: "41", unit: "Reps" });
});

test("level ladder: S+ is the top of 5 segments, S is 4", () => {
  assert.equal(F.levelIndex("S+"), 4);
  assert.equal(F.segments("S+", 90).filled, 5);
  assert.equal(F.segments("S", 85).filled, 4);
});

test("only upper tested: the other two slots are untested", () => {
  const { slots, extras } = F.normalizeTests(REAL);
  assert.deepEqual(slots.map((s) => s.key), ["upper", "lower", "endurance"]);
  const [u, l, e] = slots;
  assert.equal(u.tested, true);
  assert.equal(u.value, 54.7);
  assert.equal(u.level, "C");
  assert.equal(u.percent, 9.12);
  assert.equal(u.date, "2026-10-28");
  assert.equal(l.tested, false);
  assert.equal(e.tested, false);
  assert.equal(extras.length, 0);
});

test("empty / garbage input gives three untested slots", () => {
  for (const x of [[], null, undefined, "x", [null, 5]]) {
    const { slots, extras } = F.normalizeTests(x);
    assert.equal(slots.length, 3);
    assert.ok(slots.every((s) => !s.tested));
    assert.equal(extras.length, 0);
  }
});

test("unknown testType is kept as an extra, never mapped to a slot", () => {
  const { slots, extras } = F.normalizeTests([...REAL, { testId: 9, testTime: "2026-01-01", testType: 7, resultValue: 12, resultLevel: "B", resultLevelPercent: 40 }]);
  assert.ok(!slots[1].tested && !slots[2].tested);
  assert.equal(extras.length, 1);
  assert.equal(extras[0].typeId, "7");
  assert.equal(extras[0].value, 12);
  assert.deepEqual(F.formatValue(extras[0]), { text: "12", unit: "" });
});

test("duplicate type keeps the most recent test", () => {
  const { slots } = F.normalizeTests([
    { testId: 1, testTime: "2026-01-01", testType: 3, resultValue: 10, resultLevel: "C", resultLevelPercent: 1 },
    { testId: 2, testTime: "2026-03-01", testType: 3, resultValue: 30, resultLevel: "B", resultLevelPercent: 2 },
    { testId: 3, testTime: "2026-02-01", testType: 3, resultValue: 20, resultLevel: "C", resultLevelPercent: 3 },
  ]);
  assert.equal(slots[0].value, 30);
});

test("levelIndex and segments", () => {
  assert.equal(F.levelIndex("c"), 0);
  assert.equal(F.levelIndex("S"), 3);
  assert.equal(F.levelIndex("Z"), -1);
  assert.equal(F.levelIndex(null), -1);
  assert.deepEqual(F.segments("C", 9.12), { filled: 1, total: 5 });
  assert.deepEqual(F.segments("A", 0), { filled: 3, total: 5 });
  assert.deepEqual(F.segments("C", 90, false), { filled: 0, total: 5 });
});

test("unknown level letter falls back to percent", () => {
  assert.equal(F.segments("Z", 0).filled, 0);
  assert.equal(F.segments("Z", 9.12).filled, 1);
  assert.equal(F.segments("Z", 50).filled, 3);
  assert.equal(F.segments("Z", 100).filled, 5);
  assert.equal(F.segments(null, 41).filled, 3);
});

test("percent clamping", () => {
  assert.equal(F.clampPercent(-5), 0);
  assert.equal(F.clampPercent(250), 100);
  assert.equal(F.clampPercent(NaN), 0);
  assert.equal(F.clampPercent(null), 0);
  assert.equal(F.clampPercent(undefined), 0);
  assert.equal(F.clampPercent("abc"), 0);
  assert.equal(F.clampPercent("42.5"), 42.5);
  assert.equal(F.normalizeTests([{ testType: 3, resultValue: 1, resultLevelPercent: 300 }]).slots[0].percent, 100);
});

test("formatValue: 54.7, 0.0, 0", () => {
  const { slots } = F.normalizeTests(REAL);
  assert.deepEqual(F.formatValue(slots[0]), { text: "54.7", unit: "kg" });
  assert.deepEqual(F.formatValue(slots[1]), { text: "0.0", unit: "kg" });
  assert.deepEqual(F.formatValue(slots[2]), { text: "0", unit: "Reps" });
  assert.equal(F.formatValue(F.normalizeTests([{ testType: 3, resultValue: 50 }]).slots[0]).text, "50.0");
  assert.equal(F.formatValue(F.normalizeTests([{ testType: 3, resultValue: null }]).slots[0]).text, "0.0");
});

test("radar geometry: 3 axes, 4 rings, polygon proportional to percent", () => {
  const { slots } = F.normalizeTests([{ testType: 3, resultValue: 50, resultLevel: "A", resultLevelPercent: 100 }]);
  const r = F.radarPoints(slots, 360);
  assert.equal(r.axes.length, 3);
  assert.equal(r.rings.length, 4);
  assert.equal(r.dots.length, 3);
  const [top, right, left] = r.axes;
  assert.ok(top.y < r.cy && top.x === r.cx);
  assert.ok(right.x > r.cx && right.y > r.cy); // lower = bottom-right
  assert.ok(left.x < r.cx && left.y > r.cy);   // endurance = bottom-left
  assert.deepEqual(r.dots[0], { x: top.x, y: top.y }); // 100 % reaches the vertex
  // untested axes sit near the centre (min radius), never exactly on it
  const d = (p) => Math.hypot(p.x - r.cx, p.y - r.cy);
  assert.ok(d(r.dots[1]) > 0 && d(r.dots[1]) < r.R * 0.06);
  assert.equal(r.polygon.split(" ").length, 3);
  // 50 % is half-way
  const half = F.radarPoints([{ key: "upper", tested: true, percent: 50 }, ...slots.slice(1)]);
  assert.ok(Math.abs(Math.hypot(half.dots[0].x - half.cx, half.dots[0].y - half.cy) - half.R / 2) < 0.1);
});

test("fitness tokens exist in every theme block", () => {
  const css = fs.readFileSync(path.join(__dirname, "themes.css"), "utf8");
  const T = require("./theme-core.js");
  for (const id of T.IDS) {
    const m = new RegExp('\\[data-theme="' + id + '"\\] \\{([\\s\\S]*?)\\n\\}').exec(css);
    for (const tok of ["--fit-on-badge", "--fit-c", "--fit-b", "--fit-a", "--fit-s"]) assert.ok(m[1].includes(tok + ":"), id + " " + tok);
  }
});

test("QA: rows without testType are skipped; negative values clamp to 0", () => {
  const { slots, extras } = F.normalizeTests([{}, { testId: 1 }, { testType: 3, resultValue: -5, resultLevel: "C", resultLevelPercent: 5 }]);
  assert.equal(extras.length, 0);
  assert.equal(slots[0].value, 0);
});

test("formatValue converts kg slots to lb for Imperial, leaves reps alone", () => {
  const slots = F.normalizeTests([{ testType: 3, resultValue: 54.7 }]).slots;
  assert.deepEqual(F.formatValue(slots[0], 1), { text: "120.6", unit: "lb" });
  assert.deepEqual(F.formatValue(slots[0], 0), { text: "54.7", unit: "kg" });
  assert.deepEqual(F.formatValue(slots[1], 1), { text: "0.0", unit: "lb" });
  assert.deepEqual(F.formatValue(slots[2], 1), { text: "0", unit: "Reps" });
});
