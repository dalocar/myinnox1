// QA only: serves static/ and injects a stub-init script as the first script of index.html, for browsers
// where you cannot register an init script. No proxy: /api is expected to be intercepted by the stub.
//   node qa/serve-with-stub.js [stub-file]      default qa/exercise-progress-stub-init.js, port 8812 (PORT env)
//   open http://localhost:8812/#size=6&latency=300      (flags are the stub's location.hash flags)
const http = require("http"), fs = require("fs"), path = require("path");
const ROOT = path.join(__dirname, "..", "static");
const STUB = path.resolve(process.argv[2] || path.join(__dirname, "exercise-progress-stub-init.js"));
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png", ".json": "application/json", ".txt": "text/plain" };
http.createServer((req, res) => {
  const u = new URL(req.url, "http://x");
  if (u.pathname === "/__qa/stub.js") { res.setHeader("Content-Type", TYPES[".js"]); res.setHeader("Cache-Control", "no-store"); return res.end(fs.readFileSync(STUB)); }
  if (u.pathname.startsWith("/api/")) { res.statusCode = 502; return res.end("{}"); }
  let p = path.normalize(decodeURIComponent(u.pathname)).replace(/^(\.\.[/\\])+/, "");
  if (p === "/" || p === path.sep) p = "/index.html";
  const f = path.join(ROOT, p);
  if (!f.startsWith(ROOT)) { res.statusCode = 403; return res.end("no"); }
  fs.readFile(f, (e, d) => {
    if (e) { res.statusCode = 404; return res.end("not found"); }
    res.setHeader("Content-Type", TYPES[path.extname(f)] || "application/octet-stream");
    res.setHeader("Cache-Control", "no-store");
    if (p === "/index.html") d = Buffer.from(String(d).replace(/<head>/i, '<head><script src="/__qa/stub.js"></script>'));
    res.end(d);
  });
}).listen(+process.env.PORT || 8812, () => console.log("stubbed app on http://localhost:" + (+process.env.PORT || 8812) + "/"));
