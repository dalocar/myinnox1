#!/usr/bin/env node
// Usage: node scripts/check-theme-contrast.js [themeId ...]
// Checks WCAG contrast of key token pairs in static/themes.css. Exit 1 on failure.
const fs = require("node:fs"), path = require("node:path");
const css = fs.readFileSync(path.join(__dirname, "..", "static", "themes.css"), "utf8");

// [foreground, background, minimum ratio]: 4.5 text, 3 UI components / large text.
const PAIRS = [
  ["--text", "--bg", 4.5], ["--text", "--surface", 4.5], ["--text-2", "--surface", 4.5],
  ["--muted", "--surface", 4.5], ["--muted", "--bg", 4.5], ["--placeholder", "--surface", 4.5],
  ["--on-primary", "--primary", 4.5], ["--on-primary", "--primary-hover", 4.5],
  ["--primary", "--surface", 3], ["--primary-hover", "--surface", 3],
  ["--text", "--primary-soft", 4.5], ["--on-danger", "--danger", 4.5],
  ["--danger-text", "--danger-soft", 4.5], ["--warn-text", "--warn-soft", 4.5],
  ["--chip-official-fg", "--chip-official-bg", 4.5], ["--toast-fg", "--toast-bg", 4.5],
  ["--brand-fg", "--brand-1", 4.5], ["--input-border", "--surface", 3],
  ["--focus", "--surface", 3], ["--focus", "--bg", 3], ["--ok", "--surface", 3],
  ["--fit-on-badge", "--fit-c", 3], ["--fit-on-badge", "--fit-b", 3],
  ["--fit-on-badge", "--fit-a", 3], ["--fit-on-badge", "--fit-s", 3],
  // States found missing in the seasonal QA (Phase 5): text actually drawn with these tokens in style.css.
  ["--danger", "--surface", 4.5],        // .err text (!important), .danger-btn text
  ["--danger", "--danger-soft", 4.5, "advisory"], // .danger-btn:hover (default theme is 4.41, known)
  ["--danger-text", "--surface", 4.5],   // .error, .row-menu-item.danger
  ["--ok", "--surface", 4.5],            // .ok text
  ["--primary", "--primary-soft", 4.5],  // active tab (nav#tabs .tab-btn.active)
  ["--muted", "--surface-2", 4.5],       // disabled input
  ["--text", "--surface-2", 4.5],
  ["--warn-text", "--warn-hover", 4.5],  // warn hover
  // Decorative outlines: every theme is below 3:1 (labels/fills carry the meaning), so these only warn.
  ["--border-strong", "--surface", 3, "advisory"],
  ["--chip-official-border", "--surface", 3, "advisory"],
];

function parse(id) {
  const m = new RegExp('\\[data-theme="' + id + '"\\] \\{([\\s\\S]*?)\\n\\}').exec(css);
  if (!m) throw new Error("no block for " + id);
  const t = {};
  for (const x of m[1].matchAll(/(--[\w-]+): (#[0-9a-fA-F]{6});/g)) t[x[1]] = x[2];
  return t;
}
function lum(hex) {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
function ratio(a, b) {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

const ids = process.argv.length > 2 ? process.argv.slice(2)
  : [...css.matchAll(/^\[data-theme="([\w-]+)"\] \{/gm)].map((m) => m[1]);
let bad = 0, warned = 0;
for (const id of [...new Set(ids)]) {
  const t = parse(id);
  for (const [fg, bg, min, advisory] of PAIRS) {
    if (!t[fg] || !t[bg]) continue;
    const r = ratio(t[fg], t[bg]);
    if (r < min && advisory) { warned++; console.log(`WARN ${id}: ${fg} ${t[fg]} on ${bg} ${t[bg]} = ${r.toFixed(2)} (< ${min}, advisory)`); continue; }
    if (r < min) { bad++; console.log(`FAIL ${id}: ${fg} ${t[fg]} on ${bg} ${t[bg]} = ${r.toFixed(2)} (< ${min})`); }
  }
}
console.log((bad ? `${bad} failing pair(s)` : "all pairs pass") + (warned ? ` (${warned} advisory warning(s))` : ""));
process.exit(bad ? 1 : 0);
