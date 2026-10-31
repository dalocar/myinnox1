// Run with: node --test static/*.test.js
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path");
const H = require("./theme-fx-halloween.js");

test("randDelay stays inside the range for any random source", () => {
  assert.equal(H.randDelay([8000, 20000], () => 0), 8000);
  assert.ok(H.randDelay([8000, 20000], () => 0.9999999) <= 20000);
  assert.equal(H.randDelay([8000, 20000], () => 0.5), 14000);
  for (const bad of [-1, 5, NaN]) {
    const v = H.randDelay([8000, 20000], () => bad);
    assert.ok(v >= 8000 && v <= 20000, String(bad));
  }
  for (let i = 0; i < 500; i++) {
    const v = H.randDelay(H.TRIP);
    assert.ok(v >= 8000 && v <= 20000);
  }
});

test("spider trips wait 8-20 s and never start when busy, hidden or lite", () => {
  const go = H.nextTrip({}, () => 0.25);
  assert.deepEqual(go, { go: true, wait: 11000 });
  for (const s of [{ lite: true }, { hidden: true }]) {
    const r = H.nextTrip(s, () => 0);
    assert.equal(r.go, false);
    assert.ok(r.wait >= 8000 && r.wait <= 20000);
  }
  const busy = H.nextTrip({ busy: true }, () => 0.5);
  assert.equal(busy.go, false);
  assert.ok(busy.wait >= 1500 && busy.wait <= 3000);
  assert.equal(H.nextTrip().go, true);
});

test("data-heavy tabs are lite; browsing tabs are not", () => {
  for (const t of ["plans", "history", "fitness"]) assert.equal(H.isLite(t, false), true, t);
  for (const t of ["programs", "actions", "profile", "", undefined]) assert.equal(H.isLite(t, false), false, String(t));
  assert.equal(H.isLite("programs", true), true); // workout editor open
  assert.equal(H.isLite("profile", true), false);
});

test("every lite tab exists in index.html and every art asset exists", () => {
  const idx = fs.readFileSync(path.join(__dirname, "index.html"), "utf8");
  for (const t of H.LITE_TABS) assert.ok(idx.includes('id="tab-' + t + '"'), t);
  const js = fs.readFileSync(path.join(__dirname, "theme-fx-halloween.js"), "utf8");
  const names = (js.match(/const ART = \[([^\]]*)\]/) || [, ""])[1].match(/"[^"]+"/g).map((s) => s.slice(1, -1));
  assert.ok(names.length >= 7);
  for (const n of names) assert.ok(fs.existsSync(path.join(__dirname, "fx/art", n + ".svg")), n);
});

test("only transform/opacity animate (no filter/box-shadow keyframes)", () => {
  const css = fs.readFileSync(path.join(__dirname, "theme-fx-halloween.css"), "utf8");
  for (const m of css.matchAll(/@keyframes[^{]+\{((?:[^{}]*\{[^}]*\})+)\s*\}/g)) {
    for (const d of m[1].matchAll(/\{([^}]*)\}/g)) {
      for (const decl of d[1].split(";").map((x) => x.trim()).filter(Boolean)) {
        assert.match(decl.split(":")[0].trim(), /^(transform|opacity)$/, decl);
      }
    }
  }
  assert.ok(!/filter|drop-shadow/.test(css.replace(/\/\*[\s\S]*?\*\//g, "")));
});
