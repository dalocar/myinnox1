// Run with: node --test static/
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path");
const A = require("./activity-core.js");
const fx = (n) => JSON.parse(fs.readFileSync(path.join(__dirname, "..", "qa", "fixtures", n), "utf8"));

test("fmtDuration", () => {
  assert.equal(A.fmtDuration(1086), "00:18:06");
  assert.equal(A.fmtDuration(0), "00:00:00");
  assert.equal(A.fmtDuration(3661), "01:01:01");
  assert.equal(A.fmtDuration(360000), "100:00:00");
  assert.equal(A.fmtDuration(59.9), "00:00:59");
  for (const x of [null, undefined, NaN, "x", -5, Infinity]) assert.equal(A.fmtDuration(x), "00:00:00");
  assert.equal(A.fmtDuration("1086"), "00:18:06");
  assert.equal(A.minutesFromSeconds(961), 16);
  assert.equal(A.minutesFromSeconds(1062), 18);
  assert.equal(A.minutesFromSeconds(1062, 1), 17.7);
  assert.equal(A.fmtKcal(406.6), "407");
  assert.equal(A.fmtKcal(null), "0");
  assert.equal(A.minutesFromSeconds(null), 0);
});

test("kg from tenths", () => {
  assert.equal(A.kgFromTenths(65720), 6572);
  assert.equal(A.fmtKg(65720), "6572.0");
  assert.equal(A.fmtKg(133965), "13396.5");
  assert.equal(A.kgFromTenths(null), 0);
  assert.equal(A.kgFromTenths(NaN), 0);
  assert.equal(A.kgFromTenths(-10), 0);
  assert.equal(A.fmtKg(undefined), "0.0");
});

test("local date helpers", () => {
  assert.equal(A.addDays("2026-02-28", 1), "2026-03-01");
  assert.equal(A.addDays("2024-02-28", 1), "2024-02-29");
  assert.equal(A.addDays("2026-12-31", 1), "2027-01-01");
  assert.equal(A.addDays("2026-01-01", -1), "2025-12-31");
  assert.equal(A.addDays("garbage", 1), null);
  assert.equal(A.dayOfWeek("2026-10-25"), 0); // Sunday
  assert.equal(A.dayOfWeek("2026-10-31"), 6);
  assert.equal(A.localISO(new Date(2026, 9, 5, 23, 59)), "2026-10-05");
  assert.equal(A.localISO(new Date(2026, 0, 1, 0, 0)), "2026-01-01");
  assert.equal(A.parseDate("2026-02-30"), null);
  assert.equal(A.parseDate("2026/10/27").d, 27);
});

test("periodRange week is Sun-Sat", () => {
  const r = A.periodRange("week", "2026-10-28");
  assert.equal(r.start, "2026-10-25");
  assert.equal(r.end, "2026-10-31");
  assert.equal(r.label, "10.25-10.31");
  assert.equal(r.days.length, 7);
  assert.equal(A.periodRange("week", "2026-10-25").start, "2026-10-25"); // Sunday anchor
  assert.equal(A.periodRange("week", "2026-10-31").start, "2026-10-25"); // Saturday anchor
  assert.equal(A.periodRange("week", new Date(2026, 9, 28)).start, "2026-10-25");
});

test("periodRange week crossing month and year", () => {
  const m = A.periodRange("week", "2026-11-02");
  assert.equal(m.start, "2026-11-01"); // Sunday
  const x = A.periodRange("week", "2026-09-30");
  assert.deepEqual([x.start, x.end], ["2026-09-27", "2026-10-03"]);
  assert.equal(x.days[3], "2026-09-30");
  const y = A.periodRange("week", "2026-12-31"); // Thursday
  assert.deepEqual([y.start, y.end], ["2026-12-27", "2027-01-02"]);
  assert.equal(y.label, "12.27-01.02");
  assert.equal(y.ariaLabel, "2026-12-27 to 2027-01-02");
  assert.equal(A.periodRange("day", "2026-10-28").ariaLabel, "2026-10-28");
  assert.equal(y.days.length, 7);
});

test("periodRange month/year/day, leap February", () => {
  assert.equal(A.periodRange("month", "2026-10-28").days.length, 31);
  assert.equal(A.periodRange("month", "2026-10-28").label, "2026-10");
  assert.equal(A.periodRange("month", "2026-02-10").days.length, 28);
  assert.equal(A.periodRange("month", "2024-02-10").days.length, 29);
  assert.equal(A.periodRange("month", "2024-02-10").end, "2024-02-29");
  assert.equal(A.periodRange("month", "2100-02-10").days.length, 28);
  assert.equal(A.periodRange("month", "2000-02-10").days.length, 29);
  const y = A.periodRange("year", "2026-10-28");
  assert.equal(y.label, "2026");
  assert.equal(y.days.length, 0);
  assert.equal(y.months.length, 12);
  assert.equal(y.months[0], "202601");
  assert.equal(y.months[11], "202612");
  assert.deepEqual([y.start, y.end], ["2026-01-01", "2026-12-31"]);
  const d = A.periodRange("day", "2026-10-28");
  assert.deepEqual(d.days, ["2026-10-28"]);
  assert.equal(A.periodRange("bogus", "2026-10-28").view, "day");
});

test("periodRange is DST safe (EU/US switch weeks)", () => {
  for (const [a, days] of [["2026-03-29", 7], ["2026-10-25", 7], ["2026-03-08", 7], ["2026-11-01", 7]]) {
    const r = A.periodRange("week", a);
    assert.equal(r.days.length, days);
    assert.equal(new Set(r.days).size, days);
    assert.equal(A.dayOfWeek(r.days[0]), 0);
    assert.equal(r.days[6], A.addDays(r.days[0], 6));
  }
  assert.equal(A.periodRange("month", "2026-03-15").days.length, 31);
  assert.equal(A.periodRange("month", "2026-10-15").days.length, 31);
  assert.equal(A.periodRange("month", "2026-11-15").days.length, 30);
  // a Date at 00:30 local on a DST day keeps its local calendar date
  assert.equal(A.periodRange("day", new Date(2026, 2, 29, 0, 30)).start, "2026-03-29");
});

test("shiftPeriod", () => {
  assert.equal(A.shiftPeriod("day", "2026-03-01", -1), "2026-02-28");
  assert.equal(A.shiftPeriod("week", "2026-10-28", 1), "2026-11-04");
  assert.equal(A.shiftPeriod("week", "2026-01-03", -1), "2025-12-27");
  assert.equal(A.shiftPeriod("month", "2026-01-31", 1), "2026-02-28");
  assert.equal(A.shiftPeriod("month", "2024-01-31", 1), "2024-02-29");
  assert.equal(A.shiftPeriod("month", "2026-01-15", -1), "2025-12-15");
  assert.equal(A.shiftPeriod("month", "2026-12-15", 1), "2027-01-15");
  assert.equal(A.shiftPeriod("month", "2026-03-31", -13), "2025-02-28");
  assert.equal(A.shiftPeriod("year", "2024-02-29", 1), "2025-02-28");
  assert.equal(A.shiftPeriod("year", "2026-10-28", -1), "2025-10-28");
  assert.equal(A.shiftPeriod("day", "2026-10-28", 0), "2026-10-28");
  assert.equal(A.shiftPeriod("day", "2026-10-28", NaN), "2026-10-28");
});

test("canShift bounds", () => {
  const o = { today: "2026-10-29" };
  assert.equal(A.canShift("day", "2026-10-29", 1, o), false);
  assert.equal(A.canShift("day", "2026-10-28", 1, o), true);
  assert.equal(A.canShift("week", "2026-10-28", 1, o), false); // next week starts 11.01
  assert.equal(A.canShift("week", "2026-10-21", 1, o), true);
  assert.equal(A.canShift("month", "2026-10-01", 1, o), false);
  assert.equal(A.canShift("year", "2025-10-01", 1, o), true);
  assert.equal(A.canShift("year", "2026-10-01", 1, o), false);
  // back limit is 5 years before today, earliest data is ignored
  assert.equal(A.canShift("month", "2026-10-15", -1, { today: "2026-10-29", earliest: "2026-10-10" }), true);
  assert.equal(A.canShift("year", "2022-06-01", -1, o), true);
  assert.equal(A.canShift("year", "2021-06-01", -1, o), false);
  assert.equal(A.canShift("day", "2021-10-29", -1, o), false);
  assert.equal(A.canShift("day", "2021-10-30", -1, o), true);
  assert.equal(A.canShift("day", "2026-10-28", 1, { today: "garbage" }), false);
});

test("pickTarget", () => {
  const list = fx("stats-daily-all.json").data.dailyList;
  assert.deepEqual(A.pickTarget(list), { targetConsume: 500, targetDuration: 3600 }); // latest day 10-28
  assert.deepEqual(A.pickTarget(null), { targetConsume: 500, targetDuration: 1800 });
  assert.deepEqual(A.pickTarget([]), { targetConsume: 500, targetDuration: 1800 });
  assert.deepEqual(A.pickTarget([null, 3, { sportDate: "bad", targetConsume: 9 }]), A.DEFAULT_TARGET);
  assert.deepEqual(A.pickTarget([{ sportDate: "2026-10-01", targetConsume: 600, targetDuration: 0 }]), { targetConsume: 600, targetDuration: 1800 });
  assert.deepEqual(A.pickTarget([], { targetConsume: 1, targetDuration: 2 }), { targetConsume: 1, targetDuration: 2 });
  // unordered input: max date wins
  assert.equal(A.pickTarget([{ sportDate: "2026-10-28", targetConsume: 700, targetDuration: 1 }, { sportDate: "2026-10-01", targetConsume: 100, targetDuration: 1 }]).targetConsume, 700);
});

test("fillDaily with the real week payload", () => {
  const r = A.periodRange("week", "2026-10-28");
  const rows = A.fillDaily(r, fx("stats-daily-week.json").data.dailyList);
  assert.equal(rows.length, 7);
  assert.deepEqual(rows.map((x) => x.date), r.days);
  assert.deepEqual(rows.map((x) => x.realConsume), [0, 0, 362, 351, 0, 0, 0]);
  assert.deepEqual(rows.map((x) => A.minutesFromSeconds(x.realDuration, 0)), [0, 0, 20, 18, 0, 0, 0]);
  assert.deepEqual(rows.map((x) => x.hasData), [false, false, true, true, false, false, false]);
  assert.equal(rows[2].targetDuration, 1800);
  assert.equal(rows[3].targetDuration, 3600);
  assert.equal(rows[0].targetDuration, 3600); // gap days use the latest known target
  assert.equal(rows[2].realCapacity, 70342);
});

test("fillDaily null/empty/garbage", () => {
  const r = A.periodRange("week", "2026-10-28");
  for (const l of [null, undefined, [], "x", [null, 1, {}, { sportDate: "nope" }]]) {
    const rows = A.fillDaily(r, l);
    assert.equal(rows.length, 7);
    assert.ok(rows.every((x) => !x.hasData && x.realConsume === 0 && x.targetConsume === 500 && x.targetDuration === 1800));
  }
  assert.deepEqual(A.fillDaily(null, []), []);
  assert.deepEqual(A.fillDaily({}, []), []);
  const rows = A.fillDaily(A.periodRange("day", "2026-10-29"), [], { targetConsume: 400 });
  assert.deepEqual([rows[0].targetConsume, rows[0].targetDuration], [400, 1800]);
  // NaN / strings / negatives tolerated, out-of-range rows ignored
  const odd = A.fillDaily(A.periodRange("day", "2026-10-27"), [
    { sportDate: "2026-10-27", targetConsume: "x", targetDuration: null, realConsume: "12", realDuration: NaN, realCapacity: -4 },
    { sportDate: "2026-10-01", realConsume: 999 },
  ]);
  assert.equal(odd[0].realConsume, 12);
  assert.equal(odd[0].realDuration, 0);
  assert.equal(odd[0].realCapacity, 0);
  assert.equal(odd[0].targetConsume, 500);
  assert.equal(odd[0].hasData, true);
});

test("fillDaily month 1..31 on real data", () => {
  const rows = A.fillDaily(A.periodRange("month", "2026-10-05"), fx("stats-daily-month.json").data.dailyList);
  assert.equal(rows.length, 31);
  assert.equal(rows[23].realConsume, 13); // 10-24
  assert.equal(rows[26].realConsume, 362);
  assert.equal(rows.reduce((s, x) => s + x.realConsume, 0), 726);
});

test("fillMonths", () => {
  const rows = A.fillMonths(A.periodRange("year", "2026-03-01"), fx("stats-monthly.json").data.monthList);
  assert.equal(rows.length, 12);
  assert.equal(rows[9].totalConsume, 726);
  assert.equal(rows[9].yearMonth, "202610");
  assert.equal(rows[9].hasData, true);
  assert.equal(rows.filter((x) => x.hasData).length, 1);
  assert.equal(A.fillMonths(2025, fx("stats-monthly.json").data.monthList).filter((x) => x.hasData).length, 0);
  for (const l of [null, undefined, [], [null, { yearMonth: null }], "x"]) {
    const r = A.fillMonths(2026, l);
    assert.equal(r.length, 12);
    assert.ok(r.every((x) => x.totalConsume === 0 && !x.hasData));
  }
  assert.equal(A.fillMonths(2026, [{ yearMonth: 202601, totalConsume: "5" }])[0].totalConsume, 5);
  assert.deepEqual(A.fillMonths(2026, []).map((x) => x.month), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
});

test("empty stats fixture flows through", () => {
  const e = fx("stats-empty.json").data;
  assert.equal(e.dailyList, null);
  assert.equal(A.fillDaily(A.periodRange("week", "2026-10-28"), e.dailyList).length, 7);
  assert.equal(A.fillMonths(2026, e.monthList).length, 12);
});

test("ratios and ringProgress", () => {
  const r = A.ratios({ realConsume: 407, targetConsume: 500, realDuration: 1062, targetDuration: 1800 });
  assert.ok(Math.abs(r.consume - 0.814) < 1e-9);
  assert.ok(Math.abs(r.duration - 0.59) < 1e-9);
  assert.deepEqual(A.ratios({ realConsume: 10, targetConsume: 0 }), { consume: 0.02, duration: 0 }); // zero target -> default 500
  assert.deepEqual(A.ratios({ realConsume: 250, realDuration: 900 }), { consume: 0.5, duration: 0.5 }); // raw row, no targets
  assert.deepEqual(A.ratios({ realConsume: 250, realDuration: 900, targetConsume: null, targetDuration: null }), { consume: 0.5, duration: 0.5 });
  assert.deepEqual(A.ratios({ realConsume: 250, realDuration: 900, targetConsume: 0, targetDuration: -5 }), { consume: 0.5, duration: 0.5 });
  assert.deepEqual(A.ratios({ realConsume: 600, targetConsume: 1000 }), { consume: 0.6, duration: 0 }); // real targets still win
  assert.equal(A.gradeFor({ realConsume: 407, realDuration: 1062 }), "S"); // raw row without targets
  assert.equal(A.gradeFor({ realConsume: 394, realDuration: 500, targetConsume: null, targetDuration: 0 }), "B");
  assert.deepEqual(A.ratios(null), { consume: 0, duration: 0 });
  assert.deepEqual(A.ratios({ realConsume: NaN, targetConsume: NaN }), { consume: 0, duration: 0 });
  assert.equal(A.ratios({ realConsume: 1000, targetConsume: 500 }).consume, 2);
  assert.equal(A.ringProgress({ realConsume: 1000, targetConsume: 500, realDuration: 900, targetDuration: 1800 }).consume, 1);
  assert.equal(A.ringProgress({ realConsume: 1000, targetConsume: 500, realDuration: 900, targetDuration: 1800 }).duration, 0.5);
  assert.deepEqual(A.ringProgress(undefined), { consume: 0, duration: 0 });
});

test("gradeFor matches the two observed days", () => {
  assert.equal(A.gradeFor({ realConsume: 407, targetConsume: 500, realDuration: 1062, targetDuration: 1800 }), "S");
  assert.equal(A.gradeFor({ realConsume: 394, targetConsume: 500, realDuration: 961, targetDuration: 3600 }), "B");
  assert.equal(A.gradeFor({ realConsume: 0, targetConsume: 500, realDuration: 0, targetDuration: 1800 }), null);
  assert.equal(A.gradeFor({ realConsume: 50, targetConsume: 500, realDuration: 100, targetDuration: 1800 }), null);
  assert.equal(A.gradeFor(null), null);
  assert.equal(A.gradeFor({}), null);
  assert.equal(A.GRADE_THRESHOLDS.bothForS, 0.5);
  // exactly at threshold
  assert.equal(A.gradeFor({ realConsume: 250, targetConsume: 500, realDuration: 900, targetDuration: 1800 }), "S");
});

test("equivalents", () => {
  assert.equal(A.equivalents("day", 400, 100), null);
  assert.equal(A.equivalents("week", 400, 100), null);
  const m = A.equivalents("month", 816, 133960);
  assert.equal(m.food, "fries");
  assert.equal(m.heavy, "cars");
  assert.ok(Math.abs(m.foodCount - 816 / A.EQUIV.KCAL_PER_FRIES) < 1e-9);
  assert.ok(Math.abs(m.heavyCount - 13396 / A.EQUIV.KG_PER_CAR) < 1e-9); // tenths -> kg
  const y = A.equivalents("year", 816, 133960);
  assert.equal(y.food, "hamburgers");
  assert.equal(y.heavy, "eiffel");
  assert.ok(y.heavyCount < 0.01);
  assert.equal(A.fmtServings(y.heavyCount), "0.0");
  assert.deepEqual(A.equivalents("month", null, NaN), { food: "fries", foodCount: 0, heavy: "cars", heavyCount: 0 });
  assert.equal(A.fmtCount(0), "0");
  assert.equal(A.fmtCount(8), "8");
  assert.equal(A.fmtCount(7.64), "7.6");
  assert.equal(A.fmtCount(250.6), "251");
  assert.equal(A.fmtCount(NaN), "0");
  assert.equal(A.fmtServings(3.24), "3.2");
});

test("equivalents reproduce the official app video values", () => {
  const m = A.equivalents("month", 948, 156660);
  assert.equal(A.fmtServings(m.foodCount), "3.2");
  assert.equal(A.fmtCount(m.heavyCount), "8");
  const y = A.equivalents("year", 948, 156660);
  assert.equal(A.fmtServings(y.foodCount), "1.2");
  assert.equal(A.fmtServings(y.heavyCount), "0.0");
});

test("duplicate rows for one date are summed", () => {
  const rows = A.fillDaily(A.periodRange("day", "2026-10-27"), [
    { sportDate: "2026-10-27", targetConsume: 500, targetDuration: 1800, realConsume: 100, realDuration: 60, realCapacity: 10 },
    { sportDate: "2026-10-27", targetConsume: 500, targetDuration: 1800, realConsume: 50, realDuration: 40, realCapacity: 5 },
  ]);
  assert.deepEqual([rows[0].realConsume, rows[0].realDuration, rows[0].realCapacity], [150, 100, 15]);
  assert.equal(rows[0].targetConsume, 500);
  const m = A.fillMonths(2026, [{ yearMonth: "202610", totalConsume: 5 }, { yearMonth: "202610", totalConsume: 7 }]);
  assert.equal(m[9].totalConsume, 12);
});

test("groupSets on the real record 22401", () => {
  const d = fx("record-detail-22401.json").data;
  const g = A.groupSets(d.extData);
  assert.equal(g.length, new Set(d.extData.map((e) => e.actionId)).size);
  assert.equal(g.reduce((s, x) => s + x.totalSets, 0), d.extData.length);
  assert.equal(g[0].actionName, "Seated Chest Fly");
  assert.equal(g[0].sets.length, 3);
  assert.deepEqual(g[0].sets.map((s) => s.count), [12, 12, 8]);
  assert.equal(g[0].sets[0].weightKg, 16);
  assert.equal(g[0].totalReps, 32);
  assert.equal(g[0].totalDuration, 122);
  assert.equal(g[0].volumeKg, 16 * 32);
  assert.equal(g[0].picUrl, "https://power.renhesports.com/filestore/power/action-pic/LM012.png");
  // supersets 538/539 interleave and are merged per action, sets keep order
  const s538 = g.find((x) => x.actionId === 538);
  assert.equal(s538.sets.length, 3);
  assert.deepEqual(s538.sets.map((s) => s.sort), [12, 14, 16]);
  assert.ok(g.findIndex((x) => x.actionId === 538) < g.findIndex((x) => x.actionId === 539));
  assert.equal(d.coreData, 70320); // headline volume comes from coreData, not from the sets
  assert.equal(A.fmtKg(d.coreData), "7032.0");
  assert.equal(A.fmtDuration(d.duration), "00:18:06");
});

test("groupSets tolerance", () => {
  for (const x of [null, undefined, [], "x", [null, 3, {}]]) assert.deepEqual(A.groupSets(x), []);
  const g = A.groupSets([
    { actionId: 2, sort: 5, weight: "x", count: null, duration: NaN },
    { actionId: 2, sort: 2, weight: 100, count: 10, duration: 5 },
    { actionId: 1, sort: 3 },
  ]);
  assert.deepEqual(g.map((x) => x.actionId), [2, 1]);
  assert.deepEqual(g[0].sets.map((s) => s.sort), [2, 5]);
  assert.equal(g[0].volume, 1000);
  assert.equal(g[0].actionName, "");
  assert.equal(g[0].picUrl, null);
  assert.equal(g[1].totalSets, 1);
});

test("normalizeBadges on the real payload", () => {
  const b = A.normalizeBadges(fx("badges.json").data);
  assert.equal(b.total, 9);
  assert.equal(b.receivedCount, 3);
  assert.deepEqual(b.latest.map((x) => x.id), [9, 8, 7]); // server order kept
  assert.ok(b.latest.every((x) => x.received && x.key === "capacity"));
  assert.deepEqual(b.groups.map((g) => g.type), [1, 2, 3]);
  assert.deepEqual(b.groups.map((g) => g.key), ["consume", "duration", "capacity"]);
  assert.deepEqual(b.groups.map((g) => g.received), [0, 0, 3]);
  assert.deepEqual(b.groups.map((g) => g.locked), [3, 3, 0]);
  assert.deepEqual(b.groups[0].badges.map((x) => x.target), [1000, 3000, 10000]);
  assert.deepEqual(b.groups[1].badges.map((x) => x.level), [1, 2, 3]);
  const cap1 = b.groups[2].badges[0];
  assert.equal(cap1.receiveDate, "2026-10-27");
  assert.equal(cap1.pic, cap1.activePic);
  assert.equal(cap1.fallbackText, "5000 kg");
  const lock = b.groups[0].badges[0];
  assert.equal(lock.pic, lock.inactivePic);
  assert.equal(lock.receiveDate, null);
  assert.equal(lock.fallbackText, "1000 kcal");
  assert.equal(b.groups[1].badges[2].fallbackText, "1000 min");
});

test("normalizeBadges tolerance", () => {
  for (const x of [null, undefined, {}, "x", { allBadges: null, latestBadges: null }]) {
    const b = A.normalizeBadges(x);
    assert.deepEqual([b.latest, b.all, b.groups, b.receivedCount, b.total], [[], [], [], 0, 0]);
  }
  const b = A.normalizeBadges({
    allBadges: [null, { id: 5, type: 9, target: "x", received: "yes" }, { id: 4, type: 2, target: 300, received: true, receiveTime: "bad" }, { type: 1 }],
    latestBadges: [{ id: 77, type: 1, target: 5, received: true }],
  });
  assert.equal(b.total, 2);
  assert.equal(b.groups.find((g) => g.type === 9).key, "other");
  assert.equal(b.all.find((x) => x.id === 5).received, false); // strict boolean
  assert.equal(b.all.find((x) => x.id === 4).receiveDate, null);
  assert.equal(b.all.find((x) => x.id === 4).pic, null);
  assert.equal(b.latest[0].id, 77); // latest not in allBadges still normalised
});

test("totals fixture matches stats fixtures", () => {
  const t = fx("totals.json").data, all = fx("stats-daily-all.json").data, mo = fx("stats-monthly.json").data;
  assert.equal(t.totalConsume, all.totalConsume);
  assert.equal(t.totalCapacity, all.totalCapacity);
  assert.equal(t.totalDuration, mo.totalDuration);
  assert.equal(A.fmtKg(t.totalCapacity), "14333.7");
});

test("module is DOM free and exports the contract", () => {
  for (const k of ["fmtDuration", "kgFromTenths", "periodRange", "shiftPeriod", "fillDaily", "fillMonths", "ratios", "gradeFor", "ringProgress", "equivalents", "groupSets", "normalizeBadges", "pickTarget", "GRADE_THRESHOLDS"]) assert.ok(k in A, k);
  const src = fs.readFileSync(path.join(__dirname, "activity-core.js"), "utf8");
  assert.ok(!/toISOString|document\.|window\./.test(src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "")));
});

test("fmtWeight / weightFromTenths follow the account unit (tenths of kg in)", () => {
  assert.equal(A.fmtWeight(65720, 0), "6572.0");
  assert.equal(A.fmtWeight(65720, 1), "14488.8"); // 6572 kg * 2.20462
  assert.equal(A.fmtWeight(100, 1), "22.0");
  assert.equal(A.fmtWeight(100, undefined), "10.0");
  assert.equal(A.weightFromTenths(68, 1), 15);
  assert.equal(A.fmtKg(100), "10.0"); // unchanged helper
});

test("badgeCaption: Volume medals convert to whole lb for Imperial only", () => {
  const vol = { key: "capacity", target: 5000, unit: "kg" };
  assert.deepEqual(A.badgeCaption(vol, 1), { target: 11023, unit: "lb" });
  assert.deepEqual(A.badgeCaption({ ...vol, target: 20000 }, 1), { target: 44092, unit: "lb" });
  assert.deepEqual(A.badgeCaption({ ...vol, target: 50000 }, 1), { target: 110231, unit: "lb" });
  assert.deepEqual(A.badgeCaption(vol, 0), { target: 5000, unit: "kg" });
  assert.deepEqual(A.badgeCaption({ key: "consume", target: 1000, unit: "kcal" }, 1), { target: 1000, unit: "kcal" });
});
