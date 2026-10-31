#!/usr/bin/env node
// CI guard: this app handles passwords and session tokens, so any new network
// destination or network API in shipped code needs a deliberate, reviewed
// change. Fails if shipped code mentions a host not on the allowlist, or uses
// a network API other than fetch to a relative /api path.
// Usage: node scripts/check-external-hosts.js
const fs = require("fs"), path = require("path");
const ROOT = path.join(__dirname, "..");
const ALLOWED_HOSTS = new Set([
  "www.w3.org",               // SVG/XML namespace strings, never fetched
  "power.renhesports.com",    // upstream API (via the proxy) and its media
  "myinnox1.carralabs.app",   // production site
  "buymeacoffee.com",         // tip link
  "0.0.0.0", "localhost", "127.0.0.1",
]);
const FORBIDDEN_APIS = [
  [/\bXMLHttpRequest\b/, "XMLHttpRequest"],
  [/\bsendBeacon\b/, "navigator.sendBeacon"],
  [/\bnew\s+WebSocket\b/, "WebSocket"],
  [/\bnew\s+EventSource\b/, "EventSource"],
  [/\bimportScripts\b/, "importScripts"],
  [/\bimport\s*\(/, "dynamic import()"],
  [/\beval\s*\(/, "eval()"],
  [/\bnew\s+Function\s*\(/, "new Function()"],
];
const SCAN = [
  ["static", /\.(js|html|css)$/], ["functions", /\.js$/], ["server.py", /\.py$/],
];
const SKIP = (p) => /\.test\.js$/.test(p) || p.includes(`${path.sep}vendor${path.sep}`);
const files = [];
(function walk(p, re) {
  const st = fs.statSync(path.join(ROOT, p));
  if (st.isDirectory()) fs.readdirSync(path.join(ROOT, p)).forEach((n) => walk(path.join(p, n), re));
  else if (re.test(p) && !SKIP(p)) files.push(p);
})("static", SCAN[0][1]);
walkTop("functions", /\.js$/); files.push("server.py");
function walkTop(d, re) { (function w(p) { const s = fs.statSync(path.join(ROOT, p));
  if (s.isDirectory()) fs.readdirSync(path.join(ROOT, p)).forEach((n) => w(path.join(p, n)));
  else if (re.test(p)) files.push(p); })(d); }
let bad = 0;
for (const f of files) {
  const text = fs.readFileSync(path.join(ROOT, f), "utf8");
  for (const m of text.matchAll(/(?:https?|wss?):\/\/([A-Za-z0-9._-]+)/gi)) {
    if (!ALLOWED_HOSTS.has(m[1].toLowerCase())) { console.error(`${f}: host not allowlisted: ${m[1]}`); bad++; }
  }
  if (f.endsWith(".py")) continue;
  for (const [re, name] of FORBIDDEN_APIS) if (re.test(text)) { console.error(`${f}: uses ${name}`); bad++; }
  for (const m of text.matchAll(/<(?:script|link|img|iframe)\b[^>]*\b(?:src|href)=["']\s*(?:https?:)?\/\/([^/"']+)/gi))
    if (!ALLOWED_HOSTS.has(m[1].toLowerCase())) { console.error(`${f}: external resource from ${m[1]}`); bad++; }
}
if (bad) { console.error(`\n${bad} problem(s). If the change is intended, a maintainer must update scripts/check-external-hosts.js in the same PR.`); process.exit(1); }
console.log(`ok: ${files.length} files scanned`);
