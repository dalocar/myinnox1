// Run with: node --test static/
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path");
const T = require("./theme-core.js");

test("auto follows the OS", () => {
  assert.equal(T.resolve("auto", true), "dark");
  assert.equal(T.resolve("auto", false), "default");
});
test("explicit preference ignores the OS", () => {
  for (const id of T.IDS) {
    assert.equal(T.resolve(id, true), id);
    assert.equal(T.resolve(id, false), id);
  }
});
test("missing or invalid stored values mean auto", () => {
  for (const v of [null, undefined, "", "neon", 5, {}, "__proto__", "constructor"]) {
    assert.equal(T.normalizePref(v), "auto");
    assert.equal(T.resolve(v, false), "default");
  }
});
test("color-scheme: only dark and hallowfit are dark", () => {
  for (const id of ["dark", "hallowfit"]) assert.equal(T.schemeOf(id), "dark");
  for (const id of ["default", "ember", "tide", "graphite", "fit-xmas"]) assert.equal(T.schemeOf(id), "light");
});
test("every theme has a CSS block, a meta colour equal to its --bg, and a picker card", () => {
  const css = fs.readFileSync(path.join(__dirname, "themes.css"), "utf8");
  const html = fs.readFileSync(path.join(__dirname, "index.html"), "utf8");
  for (const id of T.IDS) {
    const m = new RegExp('\\[data-theme="' + id + '"\\] \\{([\\s\\S]*?)\\n\\}').exec(css);
    assert.ok(m, "block for " + id);
    const bg = /--bg: (#[0-9a-f]{6});/.exec(m[1])[1];
    const meta = /--meta-theme-color: (#[0-9a-f]{6});/.exec(m[1])[1];
    assert.equal(meta, bg);
    assert.equal(T.META[id], bg);
    assert.ok(html.includes('name="theme" value="' + id + '"'), "picker card " + id);
    assert.ok(html.includes(id + ':') || html.includes('"' + id + '":'), "boot script knows " + id);
  }
  assert.ok(html.includes('name="theme" value="auto"'));
});
test("all theme blocks define the same tokens", () => {
  const css = fs.readFileSync(path.join(__dirname, "themes.css"), "utf8");
  const sets = T.IDS.map((id) => {
    const m = new RegExp('\\[data-theme="' + id + '"\\] \\{([\\s\\S]*?)\\n\\}').exec(css);
    return new Set([...m[1].matchAll(/(--[\w-]+):/g)].map((x) => x[1]));
  });
  for (const s of sets.slice(1)) assert.deepEqual([...s].sort(), [...sets[0]].sort());
});
test("components use no colour literals", () => {
  const files = ["style.css", ...fs.readdirSync(__dirname).filter((f) => /^activity-.*\.css$/.test(f))];
  const css = files.map((f) => fs.readFileSync(path.join(__dirname, f), "utf8")).join("\n")
    .replace(/\/\*[\s\S]*?\*\//g, "").replace(/url\("data:[^)]*\)/g, "");
  const hits = css.match(/:[^;{}]*(#[0-9a-fA-F]{3,8}\b|rgba?\()[^;{}]*/g) || [];
  assert.deepEqual(hits, []);
});

test("boot script META and colour-scheme match theme-core", () => {
  const html = fs.readFileSync(path.join(__dirname, "index.html"), "utf8");
  const boot = /var META = (\{[^}]*\});/.exec(html)[1];
  assert.deepEqual(new Function("return " + boot)(), T.META);
  for (const id of T.IDS) {
    const css = fs.readFileSync(path.join(__dirname, "themes.css"), "utf8");
    const m = new RegExp('\\[data-theme="' + id + '"\\] \\{\\s*color-scheme: (\\w+);').exec(css);
    assert.equal(m[1], T.schemeOf(id), "color-scheme of " + id);
  }
});
