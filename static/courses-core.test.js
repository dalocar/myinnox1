// Run with: node --test static/
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path");
const C = require("./courses-core.js");

const L = [
  { id: 1, name: "Fuerza Básica", courseType: 3, level: 1, duration: 20, partsList: ["1", "3"] },
  { id: 2, name: "Estiramiento total", courseType: 2, level: 2, duration: 10, partsList: [] },
  { id: 3, name: "Quema grasa", courseType: 1, level: 3, duration: 45, partsList: ["99"] },
  { id: 4, name: "Piernas", courseType: 3, level: 2, duration: "30", partsList: ["3"] },
];
const ids = (l) => l.map((c) => c.id);

test("search is accent/case-insensitive", () => {
  assert.deepEqual(ids(C.filterCourses(L, { query: "BASICA" })), [1]);
  assert.deepEqual(ids(C.filterCourses(L, { query: "grasa" })), [3]);
  assert.equal(C.filterCourses(L).length, 4);
  assert.equal(C.filterCourses(null, {}).length, 0);
});

test("filters: OR within group, AND across groups, duration is an upper bound", () => {
  assert.deepEqual(ids(C.filterCourses(L, { topics: ["3"] })), [1, 4]);
  assert.deepEqual(ids(C.filterCourses(L, { topics: ["3", "2"] })), [1, 2, 4]);
  assert.deepEqual(ids(C.filterCourses(L, { levels: new Set(["2"]) })), [2, 4]);
  assert.deepEqual(ids(C.filterCourses(L, { maxDuration: 20 })), [1, 2]);
  assert.deepEqual(ids(C.filterCourses(L, { maxDuration: "30" })), [1, 2, 4]);
  assert.deepEqual(ids(C.filterCourses(L, { accessories: ["3", "1"] })), [1, 4]);
  assert.deepEqual(ids(C.filterCourses(L, { topics: ["3"], levels: ["2"], accessories: ["3"] })), [4]);
});

test("facets: only confirmed labels, hidden when < 2 options", () => {
  const f = C.facetsFrom(L);
  assert.deepEqual(f.topics, ["1", "2", "3"]);
  assert.deepEqual(f.accessories, ["1", "3"]); // "99" is unknown -> hidden
  assert.deepEqual(f.durations, [10, 20, 30, 40]);
  assert.deepEqual(C.facetsFrom([L[0]]).topics, []);
  assert.deepEqual(C.facetsFrom(null), { topics: [], levels: [], durations: [], accessories: [] });
});

test("countActive", () => {
  assert.equal(C.countActive({}), 0);
  assert.equal(C.countActive({ topics: ["1"], levels: ["1"], maxDuration: 10, accessories: [] }), 3);
  assert.equal(C.countPanelActive({ topics: ["1"], levels: ["1"], maxDuration: 10 }), 2);
});

test("stepsOf includes warm-up and stretch steps in order, tagged by stage", () => {
  const s = C.stepsOf({ relaxStepList: [{ actionName: "C" }], mainStepList: [{ actionName: "B" }], warmUpStepList: [{ actionName: "A" }] });
  assert.deepEqual(s.map((x) => [x.name, x.stage]), [["A", "warmup"], ["B", "main"], ["C", "stretch"]]);
});

test("stepsOf maps mainStepList", () => {
  const s = C.stepsOf({ mainStepList: [{ actionName: "Squat", picUrl: "p", count: 12, groupNum: 3 }, { name: "x" }] });
  assert.deepEqual(s[0], { name: "Squat", picUrl: "p", videoUrl: "", reps: 12, sets: 3, stage: "main" });
  assert.equal(s[1].reps, null);
  assert.deepEqual(C.stepsOf(null), []);
});

test("real fixture (75 courses)", (t) => {
  const f = path.join(__dirname, "..", "qa", "fixtures", "course-list-real.json");
  if (!fs.existsSync(f)) return t.skip("fixture missing");
  const raw = JSON.parse(fs.readFileSync(f, "utf8"));
  const all = Array.isArray(raw) ? raw : raw.data;
  assert.equal(all.length, 75);
  const n = (o) => C.filterCourses(all, o).length;
  assert.equal(n({ levels: ["1"] }), 25);
  assert.equal(n({ levels: ["2"] }), 37);
  assert.equal(n({ levels: ["3"] }), 13);
  assert.equal(n({ topics: ["1"] }), 20);
  assert.equal(n({ topics: ["2"] }), 3);
  assert.equal(n({ topics: ["3"] }), 30);
  assert.equal(n({ topics: ["4"] }), 4);
  assert.equal(n({ topics: ["5"] }), 18);
  assert.equal(n({ accessories: ["1"] }), 64);
  assert.equal(n({ accessories: ["8"] }), 1); // matches data, but is never offered (see facets)
  assert.equal(n({ maxDuration: 10 }), 2);
  assert.equal(n({ maxDuration: 40 }), all.filter((c) => c.duration <= 40).length);
  assert.equal(n({ maxDuration: 40 }), 69); // 45 (3), 50 (2), 60 (1) are excluded
  const fc = C.facetsFrom(all);
  assert.deepEqual(fc.topics, ["1", "2", "3", "4", "5"]);
  assert.deepEqual(fc.levels, ["1", "2", "3"]);
  assert.deepEqual(fc.durations, [10, 20, 30, 40]);
  assert.deepEqual(fc.accessories, ["1", "2", "3", "4", "5", "6", "14"]);
  assert.equal(C.paginate(all, 1).items.length, 60);
  assert.equal(C.paginate(all, 2).hasMore, false);
});
