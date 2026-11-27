// Run with: node --test static/
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path");
const C = require("./changelog-core.js");

test("releases: newest first, unique versions, real dates, each with something to say", () => {
  const num = (v) => v.split(".").reduce((a, n) => a * 1000 + Number(n), 0);
  C.RELEASES.forEach((r, i) => {
    assert.match(r.version, /^\d+\.\d+$/);
    assert.match(r.date, /^\d{4}-\d{2}-\d{2}$/);
    assert.equal(new Date(r.date + "T00:00:00Z").toISOString().slice(0, 10), r.date);
    assert.ok(r.title && r.items.length > 0);
    const older = C.RELEASES[i + 1];
    if (older) { assert.ok(num(r.version) > num(older.version)); assert.ok(r.date >= older.date); }
  });
});

test("footer label and dates", () => {
  const v = C.latest().version;
  assert.equal(C.buildLabel({ sha: "abc1234", date: "2026-11-27" }), `MyInnoX1 v${v} · build abc1234 · 2026-11-27`);
  assert.equal(C.buildLabel(undefined), `MyInnoX1 v${v} · build dev`);
  assert.equal(C.formatDate("2026-11-07", "en"), "November 7, 2026");
  assert.equal(C.formatDate("soon", "en"), "soon");
});

test("every change log string is translated in all seven languages", () => {
  const rd = (f) => fs.readFileSync(path.join(__dirname, f), "utf8");
  const keys = C.keys().concat("What's new", "Close", "Version {v}");
  const missing = [];
  for (const [lang, file] of [["es", "footer-version.js"]].concat(["de", "fr", "it", "ja", "ko", "zh"].map((l) => [l, `i18n-${l}.js`]))) {
    const src = rd(file);
    for (const k of keys) if (!src.includes(JSON.stringify(k) + ":")) missing.push(`${lang}: ${k}`);
  }
  assert.deepEqual(missing, []);
});
