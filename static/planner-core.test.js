// Run with: node --test static/
const test = require("node:test");
const assert = require("node:assert/strict");
const C = require("./planner-core.js");

const A = { courseId: 1, name: "A", custom: 1 };
const B = { courseId: 2, name: "B", custom: 1 };
const O = { courseId: 41, name: "Official", custom: 0 };
const ids = (list) => list.map((i) => i.courseId);

test("date helpers: weekday numbering, month/year boundaries", () => {
  assert.equal(C.weekdayOf("2026-10-28"), 3); // Wed
  assert.equal(C.weekdayOf("2026-11-01"), 7); // Sun
  assert.equal(C.weekdayOf("2026-11-02"), 1); // Mon
  assert.equal(C.addDays("2026-10-31", 1), "2026-11-01");
  assert.equal(C.addDays("2026-12-31", 1), "2027-01-01");
  assert.equal(C.addDays("2028-02-28", 1), "2028-02-29");
  assert.equal(C.addDays("2026-03-01", -1), "2026-02-28");
  assert.equal(C.mondayOf("2026-11-01"), "2026-10-26");
  assert.equal(C.diffDays("2026-10-25", "2026-10-26"), 1); // across DST end in Europe
  assert.equal(C.diffDays("2026-03-28", "2026-03-30"), 2);
  assert.equal(C.parseDate("2026-02-30"), null);
  assert.equal(C.parseDate("2026/10/28"), null);
  assert.equal(C.formatDateTime(new Date(2026, 0, 5, 7, 8, 9)), "2026-01-05 07:08:09");
});

test("trainingDates: Mon/Wed/Fri over 2 weeks starting on a Monday", () => {
  const d = C.trainingDates("2026-10-26", 2, [1, 3, 5]);
  assert.deepEqual(d, ["2026-10-26", "2026-10-28", "2026-10-30", "2026-11-02", "2026-11-04", "2026-11-06"]);
});

test("trainingDates: start date is not a training day; window is 7*weeks days", () => {
  // Wed 28 Oct start, Mon only, 2 weeks: window 28 Oct .. 10 Nov -> Mon 2 Nov, Mon 9 Nov
  assert.deepEqual(C.trainingDates("2026-10-28", 2, [1]), ["2026-11-02", "2026-11-09"]);
  // Wed start, Mon/Wed/Fri, 1 week: Wed, Fri, Mon (window ends Tue 3 Nov)
  assert.deepEqual(C.trainingDates("2026-10-28", 1, [1, 3, 5]), ["2026-10-28", "2026-10-30", "2026-11-02"]);
});

test("trainingDates: year boundary, empty inputs", () => {
  assert.deepEqual(C.trainingDates("2026-12-28", 1, [1, 5]), ["2026-12-28", "2027-01-01"]);
  assert.deepEqual(C.trainingDates("2026-10-28", 2, []), []);
  assert.deepEqual(C.trainingDates("nope", 2, [1]), []);
  assert.deepEqual(C.trainingDates("2026-10-28", 0, [1]), []);
});

test("distribute all: every date gets all items in order", () => {
  const dates = C.trainingDates("2026-10-26", 1, [1, 3, 5]);
  const r = C.distribute(dates, [A, B], "all");
  assert.deepEqual(Object.keys(r), dates);
  for (const d of dates) assert.deepEqual(ids(r[d]), [1, 2]);
  r[dates[0]][0].name = "mutated"; // copies, not shared references
  assert.equal(r[dates[1]][0].name, "A");
});

test("distribute rotate: Mon/Wed/Fri + A,B continues across weeks", () => {
  const dates = C.trainingDates("2026-10-26", 2, [1, 3, 5]);
  const r = C.distribute(dates, [A, B], "rotate");
  assert.deepEqual(dates.map((d) => ids(r[d])), [[1], [2], [1], [2], [1], [2]]);
  // Mon A, Wed B, Fri A, next Mon B
  assert.deepEqual(ids(r["2026-11-02"]), [2]);
});

test("distribute rotate: restartEachWeek, 1 routine, more routines than days, no routines", () => {
  const dates = C.trainingDates("2026-10-26", 2, [1, 3, 5]);
  const r = C.distribute(dates, [A, B], "rotate", { restartEachWeek: true, startDate: "2026-10-26" });
  assert.deepEqual(dates.map((d) => ids(r[d])), [[1], [2], [1], [1], [2], [1]]);

  const one = C.distribute(dates, [A], "rotate");
  assert.ok(dates.every((d) => ids(one[d]).join() === "1"));

  const many = [1, 2, 3, 4, 5].map((n) => ({ courseId: n, name: "R" + n }));
  const m = C.distribute(["2026-10-26", "2026-10-28"], many, "rotate");
  assert.deepEqual([ids(m["2026-10-26"]), ids(m["2026-10-28"])], [[1], [2]]);

  assert.deepEqual(C.distribute(dates, [], "rotate")[dates[0]], []);
  assert.deepEqual(C.distribute(dates, [], "all")[dates[0]], []);
});

function mkDraft(extra = {}) {
  const d = C.createDraft(Object.assign({
    name: "P", startDate: "2026-10-26", weeks: 2, weekdays: [1, 3, 5], routines: [A, B], mode: "rotate",
  }, extra));
  return C.regenerate(d);
}

test("regenerate fills days; changing weeks/weekdays drops out-of-range dates", () => {
  const d = mkDraft();
  assert.equal(C.draftDates(d).length, 6);
  d.weeks = 1;
  C.regenerate(d);
  assert.deepEqual(C.draftDates(d), ["2026-10-26", "2026-10-28", "2026-10-30"]);
});

test("regenerate keeps hand-edited days by default, overwrites on request", () => {
  const d = mkDraft();
  C.addItem(d, "2026-10-28", O);
  assert.deepEqual(ids(d.days["2026-10-28"]), [2, 41]);
  assert.ok(d.edited.has("2026-10-28"));

  d.mode = "all";
  C.regenerate(d);
  assert.deepEqual(ids(d.days["2026-10-28"]), [2, 41], "edited day untouched");
  assert.deepEqual(ids(d.days["2026-10-26"]), [1, 2], "non-edited day regenerated");
  assert.ok(d.edited.has("2026-10-28"));

  C.regenerate(d, { overwriteEdited: true });
  assert.deepEqual(ids(d.days["2026-10-28"]), [1, 2]);
  assert.equal(d.edited.size, 0);
});

test("regenerate: edited days outside the new range are dropped from edited", () => {
  const d = mkDraft();
  C.removeItem(d, "2026-11-06", 0);
  d.weeks = 1;
  C.regenerate(d);
  assert.equal(d.edited.size, 0);
  assert.equal(d.days["2026-11-06"], undefined);
});

test("day edit helpers", () => {
  const d = mkDraft({ mode: "all", routines: [A, B] });
  const day = "2026-10-26";
  C.moveItem(d, day, 0, 1);
  assert.deepEqual(ids(d.days[day]), [2, 1]);
  C.replaceItem(d, day, 0, O);
  assert.deepEqual(ids(d.days[day]), [41, 1]);
  C.removeItem(d, day, 1);
  assert.deepEqual(ids(d.days[day]), [41]);
  C.setDayItems(d, "2026-10-28", [B]);
  assert.deepEqual(ids(d.days["2026-10-28"]), [2]);
  C.applyToDates(d, ["2026-10-30", "2026-11-02"], [A, O]);
  assert.deepEqual(ids(d.days["2026-10-30"]), [1, 41]);
  assert.deepEqual(ids(d.days["2026-11-02"]), [1, 41]);
  assert.deepEqual(Array.from(d.edited).sort(), [day, "2026-10-28", "2026-10-30", "2026-11-02"].sort());
  assert.throws(() => C.addItem(d, "2030-01-01", A));
  assert.deepEqual(C.moveInArray([1, 2, 3], 0, 2), [2, 3, 1]);
  assert.deepEqual(C.moveInArray([1, 2, 3], 0, 5), [1, 2, 3]);
});

test("validate: name, weekdays, weeks cap, empty days", () => {
  let d = mkDraft({ name: " " });
  let v = C.validate(d);
  assert.deepEqual(v.emptyDates, []);
  assert.equal(v.errors.length, 1);
  assert.match(v.errors[0], /name/i);

  d = mkDraft({ weekdays: [] });
  assert.ok(C.validate(d).errors.some((e) => /weekday/i.test(e)));
  assert.ok(C.validate(d).errors.some((e) => /no training days/i.test(e)));

  d = mkDraft();
  d.weeks = 5;
  assert.ok(C.validate(d).errors.some((e) => /Weeks/.test(e)));
  d.weeks = 0;
  assert.ok(C.validate(d).errors.some((e) => /Weeks/.test(e)));

  d = mkDraft();
  C.setDayItems(d, "2026-10-28", []);
  C.removeItem(d, "2026-11-04", 0);
  v = C.validate(d);
  assert.deepEqual(v.emptyDates, ["2026-10-28", "2026-11-04"]);
  assert.ok(v.errors.some((e) => /2 training days have no routine/.test(e)));

  d = mkDraft();
  assert.deepEqual(C.validate(d), { errors: [], emptyDates: [] });

  const noRoutines = mkDraft({ routines: [] });
  assert.equal(C.validate(noRoutines).emptyDates.length, 6);
});

test("toSavePayload: strings not arrays, keys equal trainDays, courseId only", () => {
  const d = mkDraft();
  C.addItem(d, "2026-10-28", O);
  const p = C.toSavePayload(d, "2026-10-28 10:00:00");
  assert.equal(p.curTime, "2026-10-28 10:00:00");
  assert.equal(p.preferDays, "1,3,5");
  assert.equal(typeof p.trainDays, "string");
  assert.equal(p.trainDays, "2026-10-26,2026-10-28,2026-10-30,2026-11-02,2026-11-04,2026-11-06");
  assert.deepEqual(Object.keys(p.planItemMap), p.trainDays.split(","));
  assert.deepEqual(p.planItemMap["2026-10-28"], [{ courseId: 2 }, { courseId: 41 }]);
  assert.equal(p.pic, "");
  assert.equal(p.weeks, 2);
  assert.equal(p.startDate, "2026-10-26");
  assert.equal("id" in p, false);
  assert.equal(C.toSavePayload(d, "x", 99).id, 99);
  d.weekdays = [5, 1, 3];
  assert.equal(C.toSavePayload(d, "x").preferDays, "1,3,5");
  d.pic = "http://x/COVER_PLAN_1.png";
  assert.equal(C.toSavePayload(d, "x").pic, "http://x/COVER_PLAN_1.png");
});

test("fromPlanGet: maps API shape, recomputes empty days, locks basics", () => {
  const api = {
    id: 7, name: "Plan", startDate: "2026-10-26", weeks: 2, status: 1, pic: "u",
    preferDays: "1,3,5",
    trainDays: "2026-10-26,2026-10-28,2026-10-30",
    planItemMap: {
      "2026-10-26": [{ courseId: 5, name: "X", custom: 1, smallImg: "i", duration: 3, planItemId: 9 }],
      "2026-10-30": [{ courseId: 41, name: "Y", custom: 0 }],
    },
  };
  const d = C.fromPlanGet(api);
  assert.equal(d.id, 7);
  assert.deepEqual(d.weekdays, [1, 3, 5]);
  assert.deepEqual(C.draftDates(d), ["2026-10-26", "2026-10-28", "2026-10-30"]);
  assert.deepEqual(d.days["2026-10-28"], []);
  assert.deepEqual(C.validate(d).emptyDates, ["2026-10-28"]);
  assert.equal(d.lockedBasics, true);
  assert.deepEqual(d.days["2026-10-26"][0], { courseId: 5, name: "X", custom: 1, smallImg: "i", duration: 3 });
  const p = C.toSavePayload(d, "t");
  assert.equal(p.id, 7);
  assert.equal(p.pic, "u");
});

test("groupByWeek and newIds", () => {
  const g = C.groupByWeek(["2026-10-28", "2026-10-30", "2026-11-02", "2026-11-04"]);
  assert.deepEqual(g.map((x) => x.monday), ["2026-10-26", "2026-11-02"]);
  assert.deepEqual(g[0].dates, ["2026-10-28", "2026-10-30"]);
  assert.deepEqual(C.newIds([1, 2], [2, 3, 1]), [3]);
  assert.deepEqual(C.newIds([], []), []);
});

test("toItem normalizes official, custom and plan items", () => {
  assert.deepEqual(C.toItem({ id: 41, name: "O", custom: 0, smallImg: "s", duration: 20 }),
    { courseId: 41, name: "O", custom: 0, smallImg: "s", duration: 20 });
  assert.equal(C.toItem({ courseId: 3, id: 99 }).courseId, 3);
});

// ---- QA additions: independent oracle (pure UTC arithmetic, no local-time Date) ----
function oracleDates(start, weeks, wds) {
  const [y, m, d] = start.split("-").map(Number);
  const base = Date.UTC(y, m - 1, d);
  const out = [];
  for (let i = 0; i < weeks * 7; i++) {
    const t = new Date(base + i * 86400000);
    const wd = ((t.getUTCDay() + 6) % 7) + 1;
    if (wds.includes(wd)) out.push(t.toISOString().slice(0, 10));
  }
  return out;
}

test("trainingDates matches a UTC-arithmetic oracle across DST/month/year boundaries", () => {
  const starts = ["2026-03-28", "2026-09-25", "2026-10-24", "2026-10-31", "2026-12-28", "2028-02-25", "2026-04-01"];
  for (const s of starts) for (const w of [1, 2, 3, 4]) for (const wds of [[1, 3, 5], [7], [1, 2, 3, 4, 5, 6, 7], [2, 6]]) {
    assert.deepEqual(C.trainingDates(s, w, wds), oracleDates(s, w, wds), `${s} ${w}w ${wds}`);
  }
});

test("rotate example from the spec: Mon/Wed/Fri + A,B continues across weeks", () => {
  const dates = C.trainingDates("2026-11-02", 2, [1, 3, 5]); // a Monday
  const out = C.distribute(dates, [A, B], "rotate");
  assert.deepEqual(dates.map((d) => out[d][0].name), ["A", "B", "A", "B", "A", "B"]);
  const three = C.trainingDates("2026-11-02", 3, [1, 3, 5]);
  const o3 = C.distribute(three, [A, B], "rotate");
  assert.deepEqual(three.map((d) => o3[d][0].name), ["A", "B", "A", "B", "A", "B", "A", "B", "A"]);
});

test("rotate restartEachWeek with a mid-week start restarts per 7-day block from startDate", () => {
  const start = "2026-10-28"; // Wed
  const dates = C.trainingDates(start, 2, [1, 3, 5]); // Wed Fri Mon | Wed Fri Mon(9)
  const out = C.distribute(dates, [A, B, O], "rotate", { restartEachWeek: true, startDate: start });
  assert.deepEqual(dates.map((d) => out[d][0].name), ["A", "B", "Official", "A", "B", "Official"]);
});

test("fromPlanGet -> toSavePayload round trip keeps the shape the server needs", () => {
  const data = {
    id: 7, name: "P", startDate: "2026-10-28", weeks: 1, preferDays: "1,3,5", pic: "u", status: 1,
    trainDays: "2026-10-28,2026-10-30,2026-11-02",
    planItemMap: { "2026-10-28": [{ courseId: 5, name: "x", custom: 1 }], "2026-11-02": [{ courseId: 6, name: "y", custom: 0 }] },
  };
  const d = C.fromPlanGet(data);
  assert.equal(C.validate(d).emptyDates.length, 1); // 10-30 vanished server side
  C.addItem(d, "2026-10-30", { courseId: 9, name: "z" });
  const p = C.toSavePayload(d, "2026-10-28 10:00:00");
  assert.equal(p.id, 7);
  assert.equal(p.preferDays, "1,3,5");
  assert.equal(p.trainDays, "2026-10-28,2026-10-30,2026-11-02");
  assert.deepEqual(Object.keys(p.planItemMap), p.trainDays.split(","));
  assert.equal(p.pic, "u");
  assert.deepEqual(p.planItemMap["2026-10-30"], [{ courseId: 9 }]);
});
