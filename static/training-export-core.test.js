// Run with: node --test static/
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path");
const C = require("./training-export-core.js");
const EP = require("./exercise-progress-core.js");
const fx = (n) => JSON.parse(fs.readFileSync(path.join(__dirname, "..", "qa", "fixtures", n), "utf8"));

const lib = () => {
  const j = fx("action-list-real.json");
  return new Map((Array.isArray(j) ? j : j.data).map((a) => [String(a.id), { sideNum: a.sideNum, countType: a.countType, name: a.name, parts: a.muscleParts }]));
};
const detail = () => fx("record-detail-22401.json").data;
const real = (over) => {
  const w = EP.summarizeWorkout(detail());
  const rows = C.filterRows([{ sportRecordId: w.recordId, startTime: w.startTime, name: "Rutina B" }], null);
  return C.buildModel(Object.assign({ rows, workouts: new Map([[w.recordId, w]]), library: lib(), range: null, today: "2026-11-01" }, over));
};

test("summarizeWorkout keeps every set for the export", () => {
  const w = EP.summarizeWorkout(detail());
  assert.equal(w.x.sets.length, detail().extData.length);
  assert.equal(w.x.volume, detail().coreData);
  assert.equal(EP.summarizeWorkout({ sportRecordId: 1, startTime: "2026-01-01 10:00:00" }).x, null);
});

test("presets and range checks", () => {
  assert.deepEqual(C.presetRange("4w", "2026-11-27"), { from: "2026-10-31", to: "2026-11-27" });
  assert.deepEqual(C.presetRange("3m", "2026-05-31"), { from: "2026-02-28", to: "2026-05-31" });
  assert.deepEqual(C.presetRange("12m", "2026-11-27"), { from: "2025-11-27", to: "2026-11-27" });
  assert.equal(C.rangeError("2026-01-02", "2026-01-01"), "order");
  assert.equal(C.rangeError("", "2026-01-01"), "missing");
  assert.equal(C.rangeError("2026-01-01", "2026-01-01"), "");
});

test("filterRows includes both boundary dates, newest first, without duplicates or bad rows", () => {
  const rows = [1, 2, 3, 4].map((d) => ({ sportRecordId: d, startTime: `2026-03-0${d} 23:59:00` }));
  const got = C.filterRows(rows.concat(rows[1], null, { sportRecordId: 9, startTime: "bad" }), { from: "2026-03-02", to: "2026-03-03" });
  assert.deepEqual(got.map((r) => r.recordId), [3, 2]);
  assert.equal(C.filterRows(rows, null).length, 4);
});

test("weeks start on Sunday and empty weeks are listed", () => {
  assert.equal(C.weekStart("2026-11-01"), "2026-11-01");
  assert.equal(C.weekStart("2026-10-31"), "2026-10-25");
  const m = real({ range: { from: "2026-10-18", to: "2026-11-07" } });
  assert.deepEqual(m.weeks.map((w) => [w.week, w.workouts]), [["2026-10-18", 0], ["2026-10-25", 1], ["2026-11-01", 0]]);
});

test("real workout: totals, per-cable volume and set text", () => {
  const m = real();
  assert.equal(m.totals.volume, 70320);
  // computed per-exercise volume agrees with the machine's figure (rounding of the stored tenths)
  assert.ok(Math.abs(m.exercises.reduce((a, e) => a + e.volume, 0) - 70320) <= 70);
  const md = C.toMarkdown(m, { unit: 0 });
  assert.match(md, /\| Seated Chest Fly \| per cable \| 16x12, 16x12, 16x8 \|/);
  assert.match(md, /\| Seated Mid Cable Row \| per cable \| 18\.7x3, 13\.4x9, 13\.4x2, 15\.5x10, 15\.5x12 \|/);
  assert.match(md, /### 2026-10-28 10:24 · Rutina B · 18:06 active · 7032 kg · 351 kcal/);
  assert.match(md, /Period: 2026-10-28 to 2026-11-01 \(full history\)/);
  assert.ok(!md.includes(String(detail().sportRecordId)) && !/https?:|@/.test(md));
});

test("pounds are converted from the stored tenths", () => {
  const md = C.toMarkdown(real(), { unit: 1 });
  assert.match(md, /Weight unit: lb/);
  assert.match(md, /\| Seated Chest Fly \| per cable \| 35\.3x12/);
});

test("unweighted, timed, special and unknown sets", () => {
  const w = EP.summarizeWorkout({ sportRecordId: 5, startTime: "2026-01-05 10:00:00", coreData: 600, duration: 90, extData: [
    { actionId: 1, actionName: "Plank", sort: 1, weight: 50, count: 0, duration: 30 },
    { actionId: 2, actionName: "Jump", sort: 2, weight: 50, count: 10, duration: 20 },
    { actionId: 3, actionName: "My | move\n# x", sort: 3, weight: 100, count: 6, duration: 20, powerMode: 1 },
    { actionId: 2, actionName: "Jump", sort: 4, weight: 50, count: 0, duration: 1 },
  ] });
  const library = new Map([["1", { sideNum: 0, countType: 2 }], ["2", { sideNum: 0, countType: 1 }]]);
  const m = C.buildModel({ rows: C.filterRows([w], null), workouts: new Map([[5, w]]), library, range: null, today: "2026-01-05" });
  const md = C.toMarkdown(m, { unit: 0 });
  assert.match(md, /\| Plank \| no weight \| 30s \|/);
  assert.match(md, /\| Jump \| no weight \| 10 reps, 0 reps \|/);
  assert.match(md, /\| My \/ move # x \| unknown \| 10x6\* \|/);
  assert.match(md, /Load type unknown.*My \/ move # x/);
  assert.match(md, /Sets marked \* \(1\)/);
  assert.match(md, /1 set\(s\) have zero reps/);
});

test("workouts without full data are reported as missing, not counted", () => {
  const rows = C.filterRows([{ sportRecordId: 7, startTime: "2026-02-01 09:00:00" }], null);
  const m = C.buildModel({ rows, workouts: new Map([[7, { recordId: 7 }]]), library: null, range: null, today: "2026-02-02" });
  assert.equal(m.totals.workouts, 0);
  assert.match(C.toMarkdown(m, {}), /INCOMPLETE: 1 workout\(s\).*2026-02-01 09:00/);
});

test("prompts: every question, language, goal and custom text", () => {
  for (const q of Object.keys(C.TASKS)) assert.ok(C.buildPrompt(q, {}).includes(C.TASKS[q]));
  const p = C.buildPrompt("custom", { custom: "Why?", goal: "grow\narms", lang: "es" });
  assert.match(p, /Task: Why\?/);
  assert.match(p, /My goal: grow arms\./);
  assert.match(p, /Answer in Spanish\./);
  assert.match(C.buildPrompt("progress", {}), /My goal: not stated\./);
  assert.equal(C.filename({ from: "2026-01-01", to: "2026-02-01" }), "myinnox1-training-2026-01-01_2026-02-01.md");
});

test("every export string is translated in all seven languages", () => {
  const rd = (f) => fs.readFileSync(path.join(__dirname, f), "utf8");
  const ui = rd("training-export.js");
  const keys = new Set([...ui.matchAll(/\btr?\("((?:[^"\\]|\\.)*)"/g)].map((m) => JSON.parse('"' + m[1] + '"')));
  const es = ui.slice(0, ui.indexOf("const PREF"));
  for (const m of es.matchAll(/"((?:[^"\\]|\\.)*)":/g)) keys.add(JSON.parse('"' + m[1] + '"'));
  assert.ok(keys.size > 40);
  const missing = [];
  for (const k of keys) if (!es.includes(JSON.stringify(k) + ":")) missing.push("es: " + k);
  for (const l of ["de", "fr", "it", "ja", "ko", "zh"]) {
    const src = rd(`i18n-${l}.js`);
    for (const k of keys) if (!src.includes(JSON.stringify(k) + ":")) missing.push(l + ": " + k);
  }
  assert.deepEqual(missing, []);
});
