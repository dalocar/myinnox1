// Run with: node --test static/
const test = require("node:test");
const assert = require("node:assert/strict");
const C = require("./movements-core.js");

const L = [
  { id: 1, name: "Bench Press", muscleParts: "1,4", actionType: 1, level: 1 },
  { id: 2, name: "Bíceps Curl", muscleParts: "4", actionType: 1, level: 2 },
  { id: 3, name: "Squat", muscleParts: "6", actionType: 2, level: 3 },
  { id: 4, name: "Pecho  Fly", muscleParts: "1", actionType: 2 },
  { id: 5, name: "Plank", muscleParts: "", actionType: 1, difficulty: 2 },
  { id: 6, name: "No parts", muscleParts: null },
];
const ids = (l) => l.map((a) => a.id);

test("normalize: case, diacritics, whitespace, nullish", () => {
  assert.equal(C.normalize("  Bíceps   CURL "), "biceps curl");
  assert.equal(C.normalize("Pecho"), "pecho");
  assert.equal(C.normalize(null), "");
  assert.equal(C.normalize(undefined), "");
  assert.equal(C.normalize(12), "12");
});

test("search is accent/case-insensitive substring", () => {
  assert.deepEqual(ids(C.filterMovements(L, { query: "biceps" })), [2]);
  assert.deepEqual(ids(C.filterMovements(L, { query: "BÍCEPS" })), [2]);
  assert.deepEqual(ids(C.filterMovements(L, { query: "pecho fly" })), [4]);
  assert.deepEqual(ids(C.filterMovements(L, { query: "zzz" })), []);
  assert.equal(C.filterMovements(L, {}).length, L.length);
  assert.equal(C.filterMovements(L).length, L.length);
  assert.equal(C.filterMovements(null, {}).length, 0);
});

test("body part: OR within the filter, handles empty/null muscleParts", () => {
  assert.deepEqual(ids(C.filterMovements(L, { parts: ["1"] })), [1, 4]);
  assert.deepEqual(ids(C.filterMovements(L, { parts: new Set(["4", "6"]) })), [1, 2, 3]);
  assert.deepEqual(C.partsOf({ muscleParts: " 1 , 4," }), ["1", "4"]);
  assert.deepEqual(C.partsOf({ muscleParts: [2, 3] }), ["2", "3"]);
  assert.deepEqual(C.partsOf({}), []);
});

test("filters combine with AND", () => {
  assert.deepEqual(ids(C.filterMovements(L, { parts: ["1"], types: ["2"] })), [4]);
  assert.deepEqual(ids(C.filterMovements(L, { parts: ["4"], levels: ["2"] })), [2]);
  assert.deepEqual(ids(C.filterMovements(L, { query: "p", types: ["1"], levels: [2] })), [2, 5]);
  assert.deepEqual(ids(C.filterMovements(L, { query: "pl", types: ["1"], levels: [2] })), [5]);
  assert.deepEqual(ids(C.filterMovements(L, { query: "press", types: [1], levels: [1] })), [1]);
});

test("level falls back through candidate fields; missing level never matches a level filter", () => {
  assert.equal(C.levelOf(L[0]), "1");
  assert.equal(C.levelOf(L[4]), "2"); // "difficulty"
  assert.equal(C.levelOf(L[3]), null);
  assert.deepEqual(ids(C.filterMovements(L, { levels: ["2"] })), [2, 5]);
});

test("facetsFrom: only options present in the data, in known order", () => {
  const f = C.facetsFrom(L, ["1", "2", "3", "4", "5", "6", "7", "8"]);
  assert.deepEqual(f.parts, ["1", "4", "6"]);
  assert.deepEqual(f.types, ["1", "2"]);
  assert.deepEqual(f.levels, ["1", "2", "3"]);
});

test("facetsFrom: single-valued or absent facets are hidden", () => {
  const only3 = [{ name: "a", actionType: 3, muscleParts: "1" }, { name: "b", actionType: 3, muscleParts: "1,2" }];
  const f = C.facetsFrom(only3, ["1", "2"]);
  assert.deepEqual(f.types, []);
  assert.deepEqual(f.levels, []);
  assert.deepEqual(f.parts, ["1", "2"]);
  assert.deepEqual(C.facetsFrom([], null), { parts: [], types: [], levels: [] });
  assert.deepEqual(C.facetsFrom(null), { parts: [], types: [], levels: [] });
});

test("paginate: cumulative pages and hasMore", () => {
  const big = Array.from({ length: 130 }, (_, i) => ({ id: i }));
  let p = C.paginate(big, 1);
  assert.equal(p.items.length, 60);
  assert.equal(p.total, 130);
  assert.equal(p.hasMore, true);
  p = C.paginate(big, 3);
  assert.equal(p.items.length, 130);
  assert.equal(p.hasMore, false);
  assert.equal(C.paginate(big, 0).items.length, 60); // clamped
  assert.deepEqual(C.paginate([], 1), { items: [], total: 0, shown: 0, hasMore: false });
  assert.equal(C.paginate(big, 2, 10).items.length, 20);
});

test("countActive counts non-empty filter groups", () => {
  assert.equal(C.countActive({}), 0);
  assert.equal(C.countActive({ parts: new Set(["1", "2"]), types: new Set(), levels: ["1"] }), 2);
});

test("real fixture (268 library actions)", (t) => {
  const fs = require("node:fs"), path = require("node:path");
  const f = path.join(__dirname, "..", "qa", "fixtures", "action-list-real.json");
  if (!fs.existsSync(f)) return t.skip("fixture missing");
  const raw = JSON.parse(fs.readFileSync(f, "utf8"));
  const all = Array.isArray(raw) ? raw : raw.data;
  assert.equal(all.length, 268);
  const n = (o) => C.filterMovements(all, o).length;
  assert.equal(n({ levels: ["1"] }), 130);
  assert.equal(n({ levels: ["2"] }), 102);
  assert.equal(n({ levels: ["3"] }), 36);
  assert.equal(n({ types: ["1"] }), 41);
  assert.equal(n({ types: ["2"] }), 40);
  assert.equal(n({ types: ["3"] }), 187);
  assert.equal(n({ types: ["1", "2"] }), 81);
  assert.equal(n({ parts: ["8"] }), 18);
  assert.equal(n({}), 268);
  assert.ok(n({ types: ["3"], levels: ["3"] }) <= 36);
  const f2 = C.facetsFrom(all, ["1", "2", "3", "4", "5", "6", "7", "8"]);
  assert.deepEqual(f2.parts, ["1", "2", "3", "4", "5", "6", "7", "8"]);
  assert.deepEqual(f2.types, ["1", "2", "3"]);
  assert.deepEqual(f2.levels, ["1", "2", "3"]);
  assert.equal(C.paginate(all, 1).items.length, 60);
  assert.equal(C.paginate(all, 5).hasMore, false);
});
