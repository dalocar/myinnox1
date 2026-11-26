#!/usr/bin/env node
// CI guard: the desktop launcher is self-hosted only. Nothing that Cloudflare
// deploys (static/, functions/) may refer to it.
// Usage: node scripts/check-launcher-isolation.js
const fs = require("fs"), path = require("path");
const ROOT = path.join(__dirname, "..");
const FORBIDDEN = ["_local", "MYINNOX1_LAUNCHER"];
let bad = 0, count = 0;
function walk(p) {
  if (fs.statSync(path.join(ROOT, p)).isDirectory()) {
    fs.readdirSync(path.join(ROOT, p)).forEach((n) => walk(path.join(p, n)));
    return;
  }
  if (p.includes(`${path.sep}vendor${path.sep}`) || /\.(png|jpe?g|gif|webp|ico|woff2?)$/i.test(p)) return;
  count++;
  const text = fs.readFileSync(path.join(ROOT, p), "utf8");
  for (const word of FORBIDDEN) if (text.includes(word)) { console.error(`${p}: mentions ${word}`); bad++; }
}
["static", "functions"].forEach(walk);
if (bad) { console.error(`\n${bad} problem(s). Launcher code belongs in launcher/ or server.py.`); process.exit(1); }
console.log(`ok: ${count} deployed files do not refer to the launcher`);
