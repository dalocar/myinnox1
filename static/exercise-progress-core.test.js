const test = require("node:test");
const assert = require("node:assert/strict");
const C = require("./exercise-progress-core.js");

const set = (actionId, weight, count, extra) => Object.assign({ actionId, actionName: "Ex " + actionId, weight, count, duration: 30, sort: 1 }, extra);
const detail = (id, start, sets) => ({ sportRecordId: id, startTime: start, extData: sets });

test("summarizeWorkout: heaviest set per exercise with its reps, set counts", () => {
  const s = C.summarizeWorkout(detail(7, "2026-10-28 10:24:44", [
    set(512, 160, 12), set(512, 200, 8), set(512, 200, 10), set(512, 100, 15), set(551, 187, 3),
  ]));
  assert.equal(s.recordId, 7);
  assert.equal(s.date, "2026-10-28");
  assert.equal(s.startTime, "2026-10-28 10:24:44");
  assert.deepEqual(s.exercises["512"], { actionName: "Ex 512", maxWeight: 200, repsAtMax: 10, bestCount: 15, sets: 4, wsets: 4, reps: 45 });
  assert.equal(s.exercises["551"].maxWeight, 187);
});
test("summarizeWorkout ignores count<=0 and weight<=0, keeps weightless exercises", () => {
  const s = C.summarizeWorkout(detail(1, "2026-01-02 08:00:00", [
    set(1, 0, 20), set(1, 50, 0), set(1, -5, 10), set(2, 50, 30, { actionName: "Plank" }), set(3, 0, 0),
  ]));
  assert.equal(s.exercises["1"].maxWeight, 0);
  assert.equal(s.exercises["1"].wsets, 0);
  assert.equal(s.exercises["1"].sets, 2);        // the count 20 set and the count 10 set (weight <= 0)
  assert.equal(s.exercises["1"].bestCount, 20);
  assert.equal(s.exercises["2"].maxWeight, 50);
  assert.equal(s.exercises["3"], undefined);       // no valid set at all
});
test("summarizeWorkout rejects garbage and tolerates null fields", () => {
  for (const bad of [null, undefined, 5, "x", {}, { sportRecordId: 0, startTime: "2026-01-01 00:00:00" }, { sportRecordId: 3, startTime: "nope" }, { sportRecordId: 3, startTime: "2026-02-30 00:00:00" }]) {
    assert.equal(C.summarizeWorkout(bad), null);
  }
  const s = C.summarizeWorkout({ sportRecordId: "9", startTime: "2026-01-01 00:00:00", extData: [null, 3, { actionId: null }, { actionId: 4, count: "x", weight: null }, set(5, "80", "10")] });
  assert.deepEqual(Object.keys(s.exercises), ["5"]);
  assert.equal(s.exercises["5"].maxWeight, 80);
  assert.equal(C.summarizeWorkout({ sportRecordId: 1, startTime: "2026-01-01 00:00:00", extData: null }).exercises && Object.keys(C.summarizeWorkout({ sportRecordId: 1, startTime: "2026-01-01 00:00:00", extData: null }).exercises).length, 0);
});
test("startTime is the local date (no timezone shift)", () => {
  assert.equal(C.summarizeWorkout(detail(1, "2026-12-31 23:59:59", [set(1, 10, 1)])).date, "2026-12-31");
  assert.equal(C.summarizeWorkout(detail(1, "2026-01-01 00:00:00", [set(1, 10, 1)])).date, "2026-01-01");
});

const idx = [
  C.summarizeWorkout(detail(1, "2026-02-01 09:00:00", [set(10, 100, 10), set(20, 0, 20)])),
  C.summarizeWorkout(detail(2, "2026-05-01 09:00:00", [set(10, 120, 8), set(20, 0, 25)])),
  C.summarizeWorkout(detail(3, "2026-08-01 09:00:00", [set(10, 60, 12), set(20, 0, 22)])), // deload dip
  C.summarizeWorkout(detail(4, "2026-10-20 07:00:00", [set(10, 150, 5), set(20, 0, 30)])),
  C.summarizeWorkout(detail(5, "2026-10-20 18:30:00", [set(10, 150, 6)])), // same-day duplicate
];
const TODAY = "2026-10-29";

test("buildSeries weight: points ascending, deload dip kept, same-day duplicates distinct", () => {
  const s = C.buildSeries(idx, 10, { today: TODAY, mode: { sideNum: 1 } });
  assert.equal(s.kind, "weight");
  assert.deepEqual(s.points.map((p) => p.value), [100, 120, 60, 150, 150]);
  assert.equal(s.points[3].date, s.points[4].date);
  assert.ok(s.points[4].x > s.points[3].x);
  assert.equal(s.points[4].reps, 6);
  assert.equal(s.hasAny, true);
  assert.equal(s.isEmpty, false);
  assert.equal(s.showTotal, false);
  assert.equal(s.name, "Ex 10");
});
test("summary: latest, best (earliest tie), sessions, change", () => {
  const s = C.buildSeries(idx, 10, { today: TODAY, mode: { sideNum: 1 } }).summary;
  assert.deepEqual(s.latest, { value: 150, date: "2026-10-20" });
  assert.deepEqual(s.best, { value: 150, date: "2026-10-20" });
  assert.equal(s.sessions, 5);
  assert.deepEqual(s.change, { abs: 50, pct: 50 });
  assert.deepEqual(s.first, { value: 100, date: "2026-02-01" });
});
test("change percent: one decimal, null when the first value is 0", () => {
  const a = C.buildSeries([C.summarizeWorkout(detail(1, "2026-01-01 00:00:00", [set(1, 30, 5)])), C.summarizeWorkout(detail(2, "2026-02-01 00:00:00", [set(1, 40, 5)]))], 1, { mode: { sideNum: 1 } });
  assert.equal(a.summary.change.pct, 33.3);
  const b = C.buildSeries(idx, 20, { today: TODAY, mode: { sideNum: 0, countType: 1 } });
  assert.equal(b.summary.first.value, 10 * 0 + 20); // count 20, not zero
  const neg = C.buildSeries(idx, 10, { today: TODAY, range: "6M", mode: { sideNum: 1 } }).summary;
  assert.equal(neg.change.abs, 150 - 100); // all-time: first ever session, not the first in the range
});
test("ranges filter by calendar months and keep hasAny", () => {
  const r3 = C.buildSeries(idx, 10, { today: TODAY, range: "3M", mode: { sideNum: 1 } });
  assert.deepEqual(r3.points.map((p) => p.recordId), [3, 4, 5]);
  assert.equal(r3.cutoff, "2026-07-29");
  const r6 = C.buildSeries(idx, 10, { today: TODAY, range: "6M", mode: { sideNum: 1 } });
  assert.deepEqual(r6.points.map((p) => p.recordId), [2, 3, 4, 5]);
  const r1y = C.buildSeries(idx, 10, { today: TODAY, range: "1Y", mode: { sideNum: 1 } });
  assert.equal(r1y.points.length, 5);
  const none = C.buildSeries(idx, 10, { today: "2028-01-01", range: "3M", mode: { sideNum: 1 } });
  assert.equal(none.isEmpty, true);
  assert.equal(none.hasAny, true);
  assert.equal(none.summary.sessions, 5); // all-time summary survives an empty range
  assert.equal(C.buildSeries(idx, 10, { today: TODAY, range: "bogus" }).range, "All");
});
test("range cutoff clamps month ends and is inclusive", () => {
  assert.equal(C.cutoffFor("3M", "2026-05-31"), "2026-02-28");
  assert.equal(C.cutoffFor("1Y", "2028-02-29"), "2027-02-28");
  assert.equal(C.cutoffFor("All", "2026-01-01"), null);
  const one = [C.summarizeWorkout(detail(1, "2026-07-29 00:00:01", [set(1, 10, 1)]))];
  assert.equal(C.buildSeries(one, 1, { today: TODAY, range: "3M", mode: { sideNum: 1 } }).points.length, 1);
});
test("empty and single-point states", () => {
  const e = C.buildSeries(idx, 999, { today: TODAY, mode: { sideNum: 1 } });
  assert.equal(e.isEmpty, true); assert.equal(e.hasAny, false); assert.equal(e.isSingle, false); assert.equal(e.summary, null);
  const one = C.buildSeries([idx[0]], 10, { today: TODAY, mode: { sideNum: 1 } });
  assert.equal(one.isSingle, true);
  assert.deepEqual(one.summary.change, { abs: 0, pct: 0 });
  assert.equal(C.buildSeries(null, 1).isEmpty, true);
  assert.equal(C.buildSeries([null, {}, { exercises: 5 }], 1).isEmpty, true);
});
test("Combined shows the total (2x per cable); Per side does not", () => {
  const c = C.buildSeries(idx, 10, { today: TODAY, mode: { sideNum: 2 } });
  assert.equal(c.showTotal, true); assert.equal(c.modeKey, "combined");
  assert.equal(c.points[0].weight, 100); assert.equal(c.points[0].total, 200);
  assert.equal(c.summary.best.value, 150); // charted value stays per cable
  const p = C.buildSeries(idx, 10, { today: TODAY, mode: { sideNum: 1 } });
  assert.equal(p.showTotal, false); assert.equal(p.points[0].total, 0); assert.equal(p.modeKey, "per-side");
});
test("sideNum 0 charts reps, or seconds when timed; ignores the stale default weight", () => {
  const stale = [C.summarizeWorkout(detail(1, "2026-03-01 08:00:00", [set(30, 50, 12, { actionName: "Push-up" }), set(30, 50, 20)])), C.summarizeWorkout(detail(2, "2026-04-01 08:00:00", [set(30, 50, 25)]))];
  const r = C.buildSeries(stale, 30, { mode: { sideNum: 0, countType: 1 } });
  assert.equal(r.kind, "reps"); assert.deepEqual(r.points.map((p) => p.value), [20, 25]); assert.equal(r.points[0].weight, 0);
  const sec = C.buildSeries(stale, 30, { mode: { sideNum: 0, countType: 2 } });
  assert.equal(sec.kind, "seconds");
  assert.equal(sec.showTotal, false);
});
test("unknown action mode: weight when weighted sets exist, otherwise reps; never throws", () => {
  assert.equal(C.buildSeries(idx, 10, { today: TODAY }).kind, "weight");
  assert.equal(C.buildSeries(idx, 20, { today: TODAY }).kind, "reps");
  assert.equal(C.buildSeries(idx, 10, { today: TODAY }).modeKey, "unknown");
  assert.equal(C.buildSeries(idx, 10, { today: TODAY, mode: { sideNum: "x" } }).kind, "weight");
  assert.equal(C.kindFor({ sideNum: 0, countType: 2 }, true), "seconds");
  assert.equal(C.kindFor(null, false), "reps");
});
test("a workout with only warm-up (weight 0) sets of a weighted action gives no weight point", () => {
  const s = C.buildSeries([C.summarizeWorkout(detail(1, "2026-01-01 00:00:00", [set(1, 0, 10)]))], 1, { mode: { sideNum: 1 } });
  assert.equal(s.isEmpty, true);
});
test("exerciseOptions: newest first, latest name, session counts", () => {
  const o = C.exerciseOptions(idx);
  assert.deepEqual(o.map((x) => x.actionId), ["10", "20"]);
  assert.equal(o[0].sessions, 5); assert.equal(o[1].sessions, 4); assert.equal(o[0].lastDate, "2026-10-20");
  assert.deepEqual(C.exerciseOptions(null), []);
});

// ---- calendar helpers
test("calendar helpers", () => {
  assert.equal(C.addMonths("2026-03-31", -1), "2026-02-28");
  assert.equal(C.addMonths("2026-01-15", -12), "2025-01-15");
  assert.equal(C.addDays("2026-12-31", 1), "2027-01-01");
  assert.equal(C.addDays("2026-03-01", -1), "2026-02-28");
  assert.equal(C.dayNumber("1970-01-02"), 1);
  assert.equal(C.fromDayNumber(C.dayNumber("2026-10-28")), "2026-10-28");
  assert.equal(C.dayNumber("garbage"), null);
  assert.equal(C.localISO(new Date(2026, 9, 5, 23, 59)), "2026-10-05");
  assert.equal(C.stamp("2026-10-05", false), "2026-10-05 00:00:00");
  assert.equal(C.stamp("2026-10-05", true), "2026-10-05 23:59:59");
  assert.equal(C.parseStart("2026-10-05T08:09").startTime, "2026-10-05 08:09:00");
  assert.equal(C.parseStart(5), null);
});
// DST: day numbers advance by exactly 1 across the spring-forward and fall-back dates
test("day numbers are DST safe", () => {
  for (const [a, b] of [["2026-03-28", "2026-03-29"], ["2026-03-29", "2026-03-30"], ["2026-10-24", "2026-10-25"], ["2026-10-25", "2026-10-26"]]) {
    assert.equal(C.dayNumber(b) - C.dayNumber(a), 1);
  }
});

// ---- windows
test("bisectWindow splits into newer and older halves without gap or overlap", () => {
  const [newer, older] = C.bisectWindow(C.makeWindow("2026-01-01", "2026-01-10"));
  assert.equal(older.startDate, "2026-01-01"); assert.equal(older.endDate, "2026-01-05");
  assert.equal(newer.startDate, "2026-01-06"); assert.equal(newer.endDate, "2026-01-10");
  const [n2, o2] = C.bisectWindow(C.makeWindow("2026-01-01", "2026-01-02"));
  assert.equal(o2.endDate, "2026-01-01"); assert.equal(n2.startDate, "2026-01-02");
  assert.equal(C.bisectWindow(C.makeWindow("2026-01-01", "2026-01-01")), null);
  assert.equal(C.bisectWindow(null), null);
});
// A fake server: workouts with dates, a row cap, windows inclusive.
function fakeServer(dates, cap) {
  const rows = dates.map((d, i) => ({ sportRecordId: 1000 + i, startTime: d + " 08:00:00" }));
  const calls = [];
  const fetchWindow = async (w) => {
    calls.push(w);
    const out = rows.filter((r) => r.startTime >= w.start && r.startTime <= w.end).sort((a, b) => (a.startTime < b.startTime ? 1 : -1));
    return out.slice(0, cap);
  };
  return { rows, calls, fetchWindow };
}
test("allWindow is one wide call with the API timestamp format", () => {
  const w = C.allWindow();
  assert.equal(w.start, "1990-01-01 00:00:00"); assert.equal(w.end, "2100-12-31 23:59:59");
  assert.equal(C.LIST_SIZE, 5000);
});
test("isFull: only a full page may be truncated", () => {
  assert.equal(C.isFull(5000, 5000), true); assert.equal(C.isFull(4999, 5000), false); assert.equal(C.isFull(0), false);
  assert.equal(C.isFull(50, 5000), false);
});
test("enumerateRecords: one call lists everything, whatever the history depth", async () => {
  const srv = fakeServer(["2026-10-01", "2025-06-01", "2010-03-03", "1995-01-01"], 100000);
  const res = await C.enumerateRecords({ fetchWindow: srv.fetchWindow });
  assert.equal(res.rows.length, 4); assert.equal(srv.calls.length, 1); assert.equal(res.saturated, false);
  assert.equal(res.coveredFrom, "1990-01-01");
});
test("enumerateRecords: empty account is one call; errors propagate", async () => {
  const srv = fakeServer([], 5000);
  const res = await C.enumerateRecords({ fetchWindow: srv.fetchWindow });
  assert.equal(res.rows.length, 0); assert.equal(srv.calls.length, 1);
  await assert.rejects(C.enumerateRecords({ fetchWindow: async () => { throw new Error("boom"); } }), /boom/);
});
test("fallback: a page exactly as full as requested is bisected until nothing is cut (cap = size)", async () => {
  const dates = [];
  for (let i = 0; i < 60; i++) dates.push(C.addDays("2026-10-29", -i * 5));
  const srv = fakeServer(dates, 7);
  const res = await C.enumerateRecords({ fetchWindow: srv.fetchWindow, size: 7 });
  assert.equal(res.rows.length, 60); assert.equal(res.saturated, false); assert.ok(srv.calls.length > 8);
});
test("fallback: a single day still full marks the listing saturated", async () => {
  const rows = Array.from({ length: 30 }, (_, i) => ({ sportRecordId: 1 + i, startTime: "2026-10-01 08:00:00" }));
  const res = await C.enumerateRecords({ size: 25, fetchWindow: async (w) => rows.filter((r) => r.startTime >= w.start && r.startTime <= w.end).slice(0, 25) });
  assert.equal(res.saturated, true); assert.equal(res.rows.length, 25);
});
test("enumerateRecords copes with garbage rows and duplicates", async () => {
  const res = await C.enumerateRecords({ fetchWindow: async () => [null, { sportRecordId: 5, startTime: "2026-10-01 00:00:00" }, { sportRecordId: 5 }, { sportRecordId: "x" }, 7, { recordId: 6 }] });
  assert.deepEqual(res.rows.map((r) => r.recordId).sort(), [5, 6]);
  assert.equal((await C.enumerateRecords({ fetchWindow: async () => ({}) })).rows.length, 0);
});
test("diffIds: missing ids newest first, listed duplicates ignored", () => {
  const list = [
    { sportRecordId: 1, startTime: "2026-01-01 08:00:00" }, { sportRecordId: 2, startTime: "2026-03-01 08:00:00" },
    { sportRecordId: 3, startTime: "2026-03-01 18:00:00" }, { sportRecordId: 3, startTime: "2026-03-01 18:00:00" }, { sportRecordId: 4, startTime: "2025-01-01 08:00:00" },
  ];
  const d = C.diffIds(list, new Set([1]));
  assert.deepEqual(d.toFetch.map((r) => r.recordId), [3, 2, 4]);
  assert.deepEqual(C.diffIds(list, [1, 2, 3, 4]).toFetch, []);
  assert.deepEqual(C.diffIds(list, { 1: true, 2: true }).toFetch.map((r) => r.recordId), [3, 4]);
  assert.deepEqual(C.diffIds(null, null), { toFetch: [], stale: [] });
});
test("diffIds: stale = cached inside the walked range that the server no longer lists", () => {
  const cache = new Map([[1, "2026-01-01 08:00:00"], [9, "2026-02-01 08:00:00"], [8, "2019-02-01 08:00:00"]]);
  const d = C.diffIds([{ sportRecordId: 1, startTime: "2026-01-01 08:00:00" }], cache, { coveredFrom: "2025-10-30" });
  assert.deepEqual(d.stale, [9]);
  assert.deepEqual(C.diffIds([], cache).stale, []);
});

// ---- retry
test("retryDelay: 1,2,4,8 s, honours Retry-After, caps", () => {
  assert.deepEqual([1, 2, 3, 4].map((a) => C.retryDelay(a)), [1000, 2000, 4000, 8000]);
  assert.equal(C.retryDelay(1, 5000), 5000);
  assert.equal(C.retryDelay(3, 1000), 4000);
  assert.equal(C.retryDelay(1, 99999999), 120000);
  assert.equal(C.retryDelay(0), 1000);
  assert.equal(C.retryDelay("x"), 1000);
  assert.equal(C.retryDelay(2, "bad"), 2000);
});
test("parseRetryAfter: seconds, HTTP date, garbage", () => {
  assert.equal(C.parseRetryAfter("7"), 7000);
  assert.equal(C.parseRetryAfter(0), 0);
  assert.equal(C.parseRetryAfter("Thu, 01 Jan 1970 00:00:10 GMT", 4000), 6000);
  assert.equal(C.parseRetryAfter("Thu, 01 Jan 1970 00:00:01 GMT", 4000), 0);
  assert.equal(C.parseRetryAfter(null), null);
  assert.equal(C.parseRetryAfter("soon"), null);
  assert.equal(C.parseRetryAfter("-3"), null);
});
test("isRetryable / isTransport", () => {
  assert.equal(C.isRetryable({ status: 429 }), true);
  assert.equal(C.isRetryable({ status: 503 }), true);
  assert.equal(C.isRetryable({ status: 404 }), false);
  assert.equal(C.isRetryable({ status: 401 }), false);
  assert.equal(C.isRetryable({ code: 500 }), true);
  assert.equal(C.isRetryable({ body: { code: 429 } }), true);
  assert.equal(C.isRetryable(new TypeError("Failed to fetch")), true);
  assert.equal(C.isRetryable({ fatal: true }), false);
  assert.equal(C.isRetryable(null), true);
  assert.equal(C.isTransport({ status: 429 }), true);
  assert.equal(C.isTransport({ code: 500 }), false);
  assert.equal(C.isTransport(new TypeError("x")), true);
});
test("withRetry: succeeds after 429s, waits 1,2 s, honours Retry-After", async () => {
  const waits = [];
  let n = 0;
  const r = await C.withRetry(async () => { n++; if (n < 3) { const e = new Error("x"); e.status = 429; if (n === 2) e.retryAfter = 7000; throw e; } return "ok"; }, { sleep: async (ms) => waits.push(ms) });
  assert.equal(r, "ok"); assert.deepEqual(waits, [1000, 7000]);
});
test("withRetry: gives up after 4 retries (5 attempts) with 1,2,4,8 s", async () => {
  const waits = []; let n = 0;
  await assert.rejects(C.withRetry(async () => { n++; const e = new Error("down"); e.status = 503; throw e; }, { sleep: async (ms) => waits.push(ms) }), /down/);
  assert.equal(n, 5); assert.deepEqual(waits, [1000, 2000, 4000, 8000]);
});
test("withRetry: no retry for 404, and stops when asked", async () => {
  let n = 0;
  await assert.rejects(C.withRetry(async () => { n++; const e = new Error("nf"); e.status = 404; throw e; }, { sleep: async () => {} }), /nf/);
  assert.equal(n, 1);
  n = 0;
  await assert.rejects(C.withRetry(async () => { n++; throw new Error("net"); }, { sleep: async () => {}, shouldStop: () => true }), /net/);
  assert.equal(n, 1);
});
test("makeGate: one cooldown delays every waiter", async () => {
  let t = 1000; const slept = [];
  const g = C.makeGate(() => t, async (ms) => { slept.push(ms); t += ms; });
  await g.wait(); assert.deepEqual(slept, []);
  g.delay(3000); g.delay(1000);
  await g.wait(); assert.deepEqual(slept, [3000]);
});

// ---- pool
test("runPool never exceeds the concurrency, runs in order, reports results", async () => {
  const order = []; let active = 0, peak = 0;
  const items = Array.from({ length: 20 }, (_, i) => i);
  const res = await C.runPool(items, async (i) => { order.push(i); active++; peak = Math.max(peak, active); await new Promise((r) => setTimeout(r, 2)); active--; }, { concurrency: 3 });
  assert.equal(peak, 3); assert.equal(res.maxActive, 3);
  assert.equal(res.done, 20); assert.equal(res.failed, 0);
  assert.deepEqual(order, items);
  const big = await C.runPool(items, async () => {}, { concurrency: 99 });
  assert.ok(big.maxActive <= 8);
  assert.equal(C.CONCURRENCY, 3);
});
test("runPool: failures are counted, 5 in a row pause, a pause error stops at once", async () => {
  const seen = [];
  const r = await C.runPool(Array.from({ length: 30 }, (_, i) => i), async (i) => { seen.push(i); throw new Error("no"); }, { concurrency: 1 });
  assert.equal(r.paused, true); assert.equal(r.failed, 5); assert.equal(r.remaining, 25); assert.equal(r.stopped, true);
  const r2 = await C.runPool([1, 2, 3, 4], async (i) => { if (i === 2) { const e = new Error("rate"); e.pause = true; throw e; } }, { concurrency: 1 });
  assert.equal(r2.paused, true); assert.equal(r2.done, 1); assert.equal(r2.remaining, 2);
  const r3 = await C.runPool([1, 2, 3, 4, 5, 6], async (i) => { if (i % 2) throw new Error("x"); }, { concurrency: 1 });
  assert.equal(r3.paused, false); assert.equal(r3.done, 3); assert.equal(r3.failed, 3);
});
test("runPool honours shouldStop (leaving the screen)", async () => {
  let stop = false; const done = [];
  const r = await C.runPool(Array.from({ length: 10 }, (_, i) => i), async (i) => { done.push(i); if (i === 3) stop = true; }, { concurrency: 1, shouldStop: () => stop });
  assert.equal(r.stopped, true); assert.deepEqual(done, [0, 1, 2, 3]); assert.equal(r.remaining, 6);
  const none = await C.runPool([], async () => {});
  assert.equal(none.done, 0);
});

// ---- account scoping
test("accountKey: stable, case-insensitive, differs per account, never contains the email", () => {
  const a = C.accountKey("Me@Example.com"), b = C.accountKey("me@example.com"), c = C.accountKey("other@example.com");
  assert.equal(a, b); assert.notEqual(a, c);
  assert.match(a, /^[0-9a-f]{16}$/);
  assert.ok(!C.dbName("me@example.com").includes("example"));
  assert.ok(C.dbName("x").startsWith(C.DB_PREFIX));
  assert.equal(C.accountKey(""), "anon"); assert.equal(C.accountKey(null), "anon");
});

// ---- i18n completeness: every string the screen passes to t() exists in Spanish and all other packs
test("every Exercise Progress string is translated in all seven languages", () => {
  const fs = require("fs"), path = require("path");
  const rd = (f) => fs.readFileSync(path.join(__dirname, f), "utf8");
  const ui = rd("exercise-progress.js");
  const keys = new Set([...ui.matchAll(/\bt\("((?:[^"\\]|\\.)*)"/g)].map((m) => JSON.parse('"' + m[1] + '"')));
  ["3M", "6M", "1Y", "All", "Last 3 months", "Last 6 months", "Last year", "All time"].forEach((k) => keys.add(k));
  keys.add(JSON.parse('"' + /t\("(View progress of \{name\})"/.exec(rd("activity-report.js"))[1] + '"'));
  assert.ok(keys.size > 30);
  const es = ["i18n.js", "exercise-progress.js", "activity-report.js", "activity-explorer.js"].map(rd).join("\n");
  const missing = [];
  for (const k of keys) if (!es.includes(JSON.stringify(k) + ":")) missing.push("es: " + k);
  for (const l of ["de", "fr", "it", "ja", "ko", "zh"]) {
    const src = rd(`i18n-${l}.js`);
    for (const k of keys) if (!src.includes(JSON.stringify(k) + ":")) missing.push(l + ": " + k);
  }
  assert.deepEqual(missing, []);
});
test("the stub, the screen and the CSS never use a non-/api network API", () => {
  const fs = require("fs"), path = require("path");
  const src = fs.readFileSync(path.join(__dirname, "exercise-progress.js"), "utf8");
  assert.ok(!/\bXMLHttpRequest\b|\bWebSocket\b|\bsendBeacon\b/.test(src));
  for (const m of src.matchAll(/api\(\s*[`"']([^`"']+)/g)) assert.ok(m[1].startsWith("/"), m[1]);
});

test("summary stats are all-time: 3M and All give the same best, first, latest, change and sessions", () => {
  const all = C.buildSeries(idx, 10, { today: TODAY, range: "All", mode: { sideNum: 1 } });
  for (const r of ["3M", "6M", "1Y"]) {
    const s = C.buildSeries(idx, 10, { today: TODAY, range: r, mode: { sideNum: 1 } });
    assert.deepEqual({ ...s.summary, rangeSessions: 0 }, { ...all.summary, rangeSessions: 0 }, r);
  }
  assert.equal(C.buildSeries(idx, 10, { today: TODAY, range: "3M", mode: { sideNum: 1 } }).summary.rangeSessions, 3);
  assert.equal(all.summary.rangeSessions, 5);
  // best lies outside the visible range: still reported
  const old = [C.summarizeWorkout(detail(1, "2025-01-01 08:00:00", [set(1, 200, 5)])), C.summarizeWorkout(detail(2, "2026-10-01 08:00:00", [set(1, 100, 5)]))];
  const s3 = C.buildSeries(old, 1, { today: TODAY, range: "3M", mode: { sideNum: 1 } });
  assert.equal(s3.points.length, 1); assert.deepEqual(s3.summary.best, { value: 200, date: "2025-01-01" });
  assert.deepEqual(s3.summary.change, { abs: -100, pct: -50 });
  // range with no points still has the all-time summary
  const none = C.buildSeries(idx, 10, { today: "2028-01-01", range: "3M", mode: { sideNum: 1 } });
  assert.equal(none.isEmpty, true); assert.equal(none.summary.sessions, 5); assert.equal(none.summary.rangeSessions, 0);
});
test("tiny histories are one call, not saturated, and purge-eligible", async () => {
  const rows = [{ sportRecordId: 1, startTime: "2026-10-20 07:15:00" }, { sportRecordId: 2, startTime: "2026-10-20 18:40:00" }];
  const res = await C.enumerateRecords({ today: "2026-10-29", fetchWindow: async (w) => rows.filter((r) => r.startTime >= w.start && r.startTime <= w.end) });
  assert.equal(res.saturated, false); assert.equal(res.rows.length, 2);
  const d = C.diffIds(res.rows, new Map([[1, "2026-10-20 07:15:00"], [9, "2026-10-21 08:00:00"]]), { coveredFrom: res.coveredFrom });
  assert.deepEqual(d.stale, [9]); // purge-eligible
  assert.equal(res.calls, 1);
});
test("an empty listing never makes anything stale (a 200 with [] must not wipe the cache)", () => {
  const cache = new Map([[1, "2026-01-01 08:00:00"], [2, "2025-06-01 08:00:00"]]);
  assert.deepEqual(C.diffIds([], cache, { coveredFrom: "2024-01-01" }).stale, []);
  assert.deepEqual(C.diffIds(null, cache, { coveredFrom: "2024-01-01" }).stale, []);
});

// ---- WAF pacing
function fakeClock(start) {
  let t = start || 100000;
  return { now: () => t, sleep: async (ms) => { t += ms; }, advance: (ms) => { t += ms; } };
}
async function runN(p, n) { const out = []; for (let i = 0; i < n; i++) out.push(await p.acquire()); return out; }
const maxIn = (times, ms) => { let m = 0; for (let i = 0; i < times.length; i++) { let c = 0; for (let j = i; j < times.length && times[j] < times[i] + ms; j++) c++; m = Math.max(m, c); } return m; };

test("pacer: never more than 4 sync requests in any 1 s", async () => {
  const c = fakeClock(), log = C.makeRequestLog(c.now), p = C.makePacer({ log, now: c.now, sleep: c.sleep });
  const t = await runN(p, 40);
  assert.ok(maxIn(t, 1000) <= 4, "burst " + maxIn(t, 1000));
  assert.equal(maxIn(t.slice(0, 4), 1), 4); // the first 4 go at once
});
test("pacer: never more than 40 requests in any rolling 10 s, over a long run", async () => {
  const c = fakeClock(), log = C.makeRequestLog(c.now), p = C.makePacer({ log, now: c.now, sleep: c.sleep });
  const t = await runN(p, 300);
  assert.ok(maxIn(t, 10000) <= 40, "window " + maxIn(t, 10000));
  assert.ok(maxIn(t, 10000) >= 39); // and it does use the budget
});
test("pacer: other api() calls in the shared log count against the 40 / 10 s budget", async () => {
  const c = fakeClock(), log = C.makeRequestLog(c.now), p = C.makePacer({ log, now: c.now, sleep: c.sleep });
  for (let i = 0; i < 30; i++) log.record(); // UI calls (counted, never throttled)
  const t = await runN(p, 15);
  const all = log.times.slice().sort((a, b) => a - b);
  assert.ok(maxIn(all, 10000) <= 40);
  assert.ok(t[10] >= 100000 + 10000, "the 11th sync request waits for the UI calls to age out");
});
test("pacer: a 429 sets a cooldown of max(Retry-After, 10 s) + 1..3 s jitter, then half rate", async () => {
  for (const r of [0, 0.5, 0.9999]) {
    const c = fakeClock(), log = C.makeRequestLog(c.now), p = C.makePacer({ log, now: c.now, sleep: c.sleep, random: () => r });
    const s = await p.acquire();
    const b = p.block(null, s);
    assert.ok(b.cooldownMs >= 11000 && b.cooldownMs <= 13000, String(b.cooldownMs));
    assert.equal(b.second, false); assert.equal(p.isHalf(), true);
    assert.equal(p.waitMs(), b.cooldownMs); // nothing goes during the cooldown
  }
  const c = fakeClock(), log = C.makeRequestLog(c.now), p = C.makePacer({ log, now: c.now, sleep: c.sleep, random: () => 0 });
  const b = p.block(30000, null);
  assert.equal(b.cooldownMs, 31000); // a longer Retry-After wins
  const t = await runN(p, 60);
  assert.ok(t[0] >= 100000 + 31000);
  assert.ok(maxIn(t, 1000) <= 2 && maxIn(t, 10000) <= 20, "half rate");
});
test("pacer: a second 429 in the same sync says pause; one already in flight before the block does not", async () => {
  const c = fakeClock(), log = C.makeRequestLog(c.now), p = C.makePacer({ log, now: c.now, sleep: c.sleep });
  const a = await p.acquire(), b = await p.acquire();
  c.advance(200);
  assert.equal(p.block(null, a).second, false);
  const late = p.block(null, b);
  assert.equal(late.second, false); assert.equal(late.repeat, true);
  const after = await p.acquire();
  assert.ok(after >= log.cooldownUntil);
  assert.equal(p.block(null, after).second, true);
  p.halt();
  assert.equal(await p.acquire(), null);
});
test("pacer: the cooldown is shared by every pacer on the same log (tab-wide)", async () => {
  const c = fakeClock(), log = C.makeRequestLog(c.now);
  C.makePacer({ log, now: c.now, sleep: c.sleep, random: () => 0 }).block(null, null);
  const p2 = C.makePacer({ log, now: c.now, sleep: c.sleep });
  assert.equal(p2.waitMs(), 11000);
  assert.equal(p2.isHalf(), false);
});
test("N4 purge guard: a suspiciously large purge is skipped, a few deletions still purge", () => {
  assert.equal(C.purgeAllowed(79, 86), false); // cap 7 vs 86 cached
  assert.equal(C.purgeAllowed(3, 86), true);
  assert.equal(C.purgeAllowed(1, 86), true);
  assert.equal(C.purgeAllowed(17, 86), true);  // 20 %
  assert.equal(C.purgeAllowed(18, 86), false);
  assert.equal(C.purgeAllowed(5, 6), true);    // floor of 5
  assert.equal(C.purgeAllowed(6, 6), false);
});
test("withRetry honours isRetryable / delayFor overrides", async () => {
  const waits = []; let n = 0;
  const r = await C.withRetry(async () => { n++; if (n < 3) { const e = new Error("rl"); e.status = 429; e.rateLimited = true; throw e; } return 1; },
    { sleep: async (ms) => waits.push(ms), delayFor: (e) => (e.rateLimited ? 0 : null) });
  assert.equal(r, 1); assert.deepEqual(waits, [0, 0]);
  n = 0;
  await assert.rejects(C.withRetry(async () => { n++; throw Object.assign(new Error("x"), { status: 503 }); }, { sleep: async () => {}, isRetryable: () => false }));
  assert.equal(n, 1);
});

// ---- N7 purge confirmation
const ids = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
test("N7: a cap-7 listing seen once does not purge (pending only)", () => {
  const d = C.decidePurge(ids(8, 86), 86, null, 1000);
  assert.deepEqual(d.purge, []); assert.equal(d.pending.ids.length, 79); assert.equal(d.pending.seenAt, 1000);
});
test("N7: 30 of 100 deleted and seen twice 10+ minutes apart purges; earlier than 10 min does not", () => {
  const first = C.decidePurge(ids(1, 30), 100, null, 0);
  assert.deepEqual(first.purge, []);
  const early = C.decidePurge(ids(1, 30), 100, first.pending, C.CONFIRM_MS - 1);
  assert.deepEqual(early.purge, []); assert.equal(early.pending.seenAt, 0);
  const later = C.decidePurge(ids(1, 30), 100, early.pending, C.CONFIRM_MS);
  assert.deepEqual(later.purge, ids(1, 30)); assert.equal(later.pending, null);
});
test("N7: a full listing that brings any pending id back clears the pending set and never purges it", () => {
  const p = C.decidePurge(ids(1, 30), 100, null, 0).pending;
  const back = C.decidePurge([], 100, p, C.CONFIRM_MS * 2);
  assert.deepEqual(back, { purge: [], pending: null });
  const partly = C.decidePurge(ids(2, 30), 100, p, C.CONFIRM_MS * 2); // id 1 came back
  assert.deepEqual(partly.purge, []); assert.equal(partly.pending.seenAt, C.CONFIRM_MS * 2); // judged afresh
});
test("N7: small deletions still purge at once, even with a pending set", () => {
  assert.deepEqual(C.decidePurge([5, 6], 100, null, 0).purge, [5, 6]);
  const p = C.decidePurge(ids(1, 30), 100, null, 0).pending;
  const d = C.decidePurge(ids(1, 30).concat([77, 78]), 100, p, C.CONFIRM_MS);
  assert.deepEqual(d.purge.sort((a, b) => a - b), ids(1, 30).concat([77, 78]));
});
test("a 429 anywhere starts the tab-wide cooldown (requestLog.noteBlock)", () => {
  const c = fakeClock(), log = C.makeRequestLog(c.now);
  const until = log.noteBlock(null, () => 0);
  assert.equal(until - c.now(), 11000);
  assert.equal(log.noteBlock(5000, () => 0), until); // never shortens
  assert.equal(C.makePacer({ log, now: c.now, sleep: c.sleep }).waitMs(), 11000);
});
test("N10: corrupted pending-purge meta fails safe: new pending set with now, never an immediate purge", () => {
  const now = C.CONFIRM_MS * 5, stale = ids(1, 30);
  const bad = [null, undefined, "x", 42, [], {}, { ids: "1,2" }, { ids: [] }, { ids: [1, "a"], seenAt: 0 }, { ids: stale }, { ids: stale, seenAt: NaN },
    { ids: stale, seenAt: "yesterday" }, { ids: stale, seenAt: now + 60000 }, { ids: [null], seenAt: 0 }, { ids: stale, seenAt: null }];
  for (const p of bad) {
    const d = C.decidePurge(stale, 100, p, now);
    assert.deepEqual(d.purge, [], JSON.stringify(p));
    assert.deepEqual(d.pending, { ids: stale, seenAt: now }, JSON.stringify(p));
  }
  // a well-formed pending set with a numeric-string timestamp still works
  assert.deepEqual(C.decidePurge(stale, 100, { ids: stale.map(String), seenAt: "0" }, now).purge, stale);
});
