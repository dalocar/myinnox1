// Guards for the seasonal CSS/art contract found in the Phase 5 QA.
const test = require("node:test"), assert = require("node:assert");
const fs = require("node:fs"), path = require("node:path");
const rd = (f) => fs.readFileSync(path.join(__dirname, f), "utf8");
const TC = require("./theme-core.js");
const FC = require("./theme-fx-core.js");

const tokensIn = (files) => new Set([].concat(...files.map((f) => [...rd(f).matchAll(/var\((--fx-[a-z0-9-]+)/g)].map((m) => m[1]))));
const declared = (css, theme) => {
  const m = new RegExp('html\\[data-theme="' + theme + '"\\] \\{([\\s\\S]*?)\\n\\}').exec(css);
  return new Set(m ? [...m[1].matchAll(/(--fx-[a-z0-9-]+):/g)].map((x) => x[1]) : []);
};
const art = (names) => names.map((n) => "fx/art/" + n + ".svg");

test("every --fx-* token used by a theme's art is declared under that theme", () => {
  const xmas = declared(rd("theme-fx-xmas.css"), "fit-xmas");
  const hal = declared(rd("theme-fx-halloween.css"), "hallowfit");
  const used = (list) => tokensIn(art(list).concat([])).values();
  const xmasArt = ["light-string", "ornament", "garland", "santa-hat", "holly", "candy-cane", "snowflake-1", "snowflake-2", "snowflake-3", "snow-cap", "icicle", "icicle-row", "star", "sparkle", "gift"];
  const halArt = ["web-corner", "spider", "pumpkin", "jack-o-lantern", "bat", "ghost", "eyes-in-dark", "tombstone", "candy-corn", "bat-logo-accent"];
  for (const t of used(xmasArt)) assert.ok(xmas.has(t), t + " missing in theme-fx-xmas.css");
  for (const t of used(halArt)) assert.ok(hal.has(t), t + " missing in theme-fx-halloween.css");
});

test("pseudo-elements are never listed inside :is()/:where() (the selector would be dropped)", () => {
  for (const f of ["theme-fx.css", "theme-fx-xmas.css", "theme-fx-halloween.css"]) {
    for (const m of rd(f).matchAll(/:(?:is|where)\(([^)]*)\)/g)) assert.ok(!/::?(before|after)/.test(m[1]), f + ": " + m[0]);
  }
});

test("seasonal themes drop decorations in forced-colors and print, including pseudo-element art", () => {
  assert.match(rd("theme-fx.css"), /forced-colors: active\), print \{ #fx-root \{ display: none/);
  assert.match(rd("theme-fx-xmas.css"), /forced-colors: active\), print[\s\S]*\.xmas-snow[\s\S]*display: none !important/);
  assert.match(rd("theme-fx-halloween.css"), /forced-colors: active\), print[\s\S]*\.hf-perch[\s\S]*display: none !important/);
});

test("Auto never resolves to a seasonal theme", () => {
  for (const dark of [true, false]) assert.ok(!FC.hasFx(TC.resolve("auto", dark)));
});
