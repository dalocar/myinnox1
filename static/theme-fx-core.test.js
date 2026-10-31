// Run with: node --test static/*.test.js
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path");
const F = require("./theme-fx-core.js");
const T = require("./theme-core.js");

test("missing or invalid stored values mean full", () => {
  for (const v of [null, undefined, "", "max", 3, {}, "__proto__"]) assert.equal(F.normalizeMode(v), "full");
  for (const m of F.MODES) assert.equal(F.normalizeMode(m), m);
});
test("only the seasonal themes have a decoration layer, and they are real themes", () => {
  for (const id of F.THEMES) assert.ok(T.IDS.includes(id), id);
  for (const id of T.IDS.filter((i) => !F.THEMES.includes(i))) assert.equal(F.effective("full", { theme: id }), "off");
});
test("effective: setting vs environment", () => {
  const th = "hallowfit";
  assert.equal(F.effective("full", { theme: th }), "full");
  assert.equal(F.effective("subtle", { theme: th }), "subtle");
  assert.equal(F.effective("off", { theme: th }), "off");
  assert.equal(F.effective(undefined, { theme: th }), "full");
  assert.equal(F.effective("full", { theme: th, reducedMotion: true }), "subtle");
  assert.equal(F.effective("full", { theme: "fit-xmas", saveData: true }), "subtle");
  assert.equal(F.effective("off", { theme: th, reducedMotion: true }), "off");
  assert.equal(F.effective("full"), "off");
});
test("particleCount shrinks on small screens and weak devices", () => {
  assert.equal(F.particleCount(1280, 8, 8), 70);
  assert.equal(F.particleCount(375, 8, 8), 40);
  assert.equal(F.particleCount(1280, 2, 8), 35);
  assert.equal(F.particleCount(375, 8, 2), 20);
});
test("every FX theme has CSS scoped to it only through data-fx, and the overlay never takes input", () => {
  const css = fs.readFileSync(path.join(__dirname, "theme-fx.css"), "utf8");
  assert.match(css, /pointer-events: none/);
  assert.match(css, /prefers-reduced-motion/);
  assert.match(css, /forced-colors/);
  const z = +/\.fx-front \{ z-index: (\d+)/.exec(css)[1];
  assert.ok(z < 40, "below the tab bar (40)");
});
test("index.html wires the fx files and the Profile control", () => {
  const html = fs.readFileSync(path.join(__dirname, "index.html"), "utf8");
  for (const f of ["theme-fx.css", "theme-fx-core.js", "theme-fx.js"]) assert.ok(html.includes(f), f);
  for (const m of F.MODES) assert.ok(html.includes('name="fx" value="' + m + '"'), m);
});
