// QA only: Exercise Progress routes for qa/fixture-server.js. Everything lives under /ep/ so it never
// collides with the Activity routes: /ep/<api path> mirrors the app's /api paths.
//   GET /ep/sport/record/list?startTime=&endTime=&size=   workouts (no extData) newest first, filtered to the
//        window (both bounds inclusive, format must be 'yyyy-MM-dd HH:mm:ss' else []), capped at
//        min(size or everything, cap). cap = EP_LIST_CAP env (default: none) or /ep/_config?cap=N, so a small cap (with the
//        client's page size set equal, stub flags size=N&cap=N) exercises the bisect fallback; a cap the client does not know
//        about is NOT detected (the real API has no cap).
//   GET /ep/sport/record/detail?recordId=   full workout with extData; unknown id -> HTTP 200 envelope code 500
//   GET /ep/action/list[?custom=true][&languageId=es]   library (sideNum / countType) or the custom actions (Spanish names for es)
//   GET /ep/course/custom/list, /ep/course/custom/detail   one program with weighted and weightless steps (editor icon, Phase 3)
//   GET /ep/_dump                            raw workouts.json (admin: not counted, no latency, no failure rules; used by the stub's #synced seeding)
// Failure injection (HTTP-level, shared by every /ep/ data route unless limited):
//   env EP_FAIL="429:5:detail:2"  or  GET /ep/_fail?status=429&n=5&route=detail&retryAfter=2
//     status  HTTP status to answer (429, 500, 502, 503, ...), or "envelope" for HTTP 200 with code 500
//     n       how many matching requests to fail (default 1; "all" = until reset)
//     route   list | detail | action | any (default any)
//     retryAfter  seconds sent in the Retry-After header (429 only; optional)
//   Rules stack; each is consumed independently. GET /ep/_reset clears rules, counters and config.
// Cloudflare-like WAF limiter (off by default): env EP_WAF="60:10:10" or GET /ep/_config?waf=60:10:10 (|off) means
//   limit:windowSeconds:blockSeconds, counted PER CLIENT IP over EVERY route this server answers (activity routes, /ep data
//   routes and /ep/_hit, which the stub pings for the calls it answers itself) except the /ep/_ admin routes. Over the
//   limit -> every request from that IP gets HTTP 429 with an HTML body and NO Retry-After for blockSeconds.
//   GET /ep/_waf?block=10 forces a block now. /ep/_stats.waf: {limit, windowS, blockS, counted, blocked, blocks, peak, blockedUntil}
//   where peak = most requests seen in any rolling window.
// Other helpers: GET /ep/_config?latency=ms&cap=N, GET /ep/_stats -> {total, byRoute, inFlight, maxInFlight, failed, rules, config}.
//   Default latency is 150 ms so progress and the concurrency limit are observable (EP_LATENCY_MS env).
const fs = require("fs"), path = require("path");
const DIR = path.join(__dirname, "fixtures", "exercise-progress");
const load = (n) => JSON.parse(fs.readFileSync(path.join(DIR, n), "utf8"));
const env = (d) => ({ code: 200, msg: "OK", traceId: "fixture", success: true, data: d });
const bad = (msg) => ({ code: 500, msg, traceId: "fixture", data: null, error: true, success: false, warn: false });
const FORMAT = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/;

const state = { rules: [], total: 0, byRoute: {}, inFlight: 0, maxInFlight: 0, failed: 0, config: { latency: +(process.env.EP_LATENCY_MS || 150), cap: +(process.env.EP_LIST_CAP || 100000) } };
function addRule(spec) {
  const [status, n, route, ra] = String(spec).split(":");
  if (!status) return;
  state.rules.push({ status, left: n === "all" ? Infinity : (n === undefined || n === "" ? 1 : +n), route: route || "any", retryAfter: ra ? +ra : null });
}
if (process.env.EP_FAIL) process.env.EP_FAIL.split(",").forEach(addRule);
function reset() { wafReset(); state.rules = []; state.total = 0; state.byRoute = {}; state.maxInFlight = 0; state.failed = 0; state.config = { latency: +(process.env.EP_LATENCY_MS || 150), cap: +(process.env.EP_LIST_CAP || 100000) }; }

// ---- WAF limiter
const parseWaf = (v) => { if (!v || v === "off") return null; const [l, w, b] = String(v).split(":").map(Number); return l > 0 ? { limit: l, windowS: w || 10, blockS: b || 10 } : null; };
const waf = { cfg: parseWaf(process.env.EP_WAF), clients: new Map(), counted: 0, blocked: 0, blocks: 0, peak: 0 };
function wafReset() { waf.clients = new Map(); waf.counted = 0; waf.blocked = 0; waf.blocks = 0; waf.peak = 0; }
const ADMIN = /^\/ep\/_(reset|fail|config|stats|waf|dump)$/;
function wafCheck(req, res, url) {
  if (!waf.cfg || req.method === "OPTIONS" || ADMIN.test(url.pathname)) return false;
  const ip = req.socket.remoteAddress || "?", now = Date.now();
  const c = waf.clients.get(ip) || { times: [], until: 0 };
  waf.clients.set(ip, c);
  c.times.push(now);
  const cut = now - waf.cfg.windowS * 1000;
  while (c.times.length && c.times[0] <= cut) c.times.shift();
  waf.counted++; waf.peak = Math.max(waf.peak, c.times.length);
  if (c.until <= now && c.times.length > waf.cfg.limit) { c.until = now + waf.cfg.blockS * 1000; waf.blocks++; }
  if (c.until > now) {
    waf.blocked++;
    res.statusCode = 429; res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.end("<!DOCTYPE html><html><head><title>Access denied | rate limited</title></head><body><h1>Error 1015</h1><p>You are being rate limited.</p></body></html>");
    return true;
  }
  return false;
}

const routeOf = (p) => (/record\/list$/.test(p) ? "list" : /record\/detail$/.test(p) ? "detail" : /action\/list$/.test(p) ? "action" : "other");
const json = (res, code, body, headers) => { res.statusCode = code; res.setHeader("Content-Type", "application/json"); Object.entries(headers || {}).forEach(([k, v]) => res.setHeader(k, v)); res.end(JSON.stringify(body)); };

function data(p, q) {
  if (p === "/sport/record/list") {
    const a = q.get("startTime"), b = q.get("endTime"), size = Math.max(1, +q.get("size") || 1e9); // like the real API: no size = everything
    if (!FORMAT.test(a || "") || !FORMAT.test(b || "")) return env([]);
    const rows = load("workouts.json").filter((w) => w.startTime >= a && w.startTime <= b)
      .sort((x, y) => (x.startTime < y.startTime ? 1 : -1)).slice(0, Math.min(size, state.config.cap))
      .map((w) => Object.assign({}, w, { extData: null }));
    return env(rows);
  }
  if (p === "/sport/record/detail") {
    const w = load("workouts.json").find((x) => String(x.sportRecordId) === q.get("recordId"));
    return w ? env(w) : bad("record not found");
  }
  if (p === "/action/list") { const es = q.get("languageId") === "es"; return q.get("custom") === "true" ? load(es ? "action-list-custom.es.json" : "action-list-custom.json") : load(es ? "action-list.es.json" : "action-list.json"); }
  if (p === "/course/custom/detail") return load("course-detail.json");
  if (p === "/course/custom/list") { const c = load("course-detail.json").data; return env([{ id: c.id, name: c.name, smallImg: c.smallImg, actionNum: c.mainStepList.length, duration: c.duration, updateTime: c.updateTime }]); }
  return null;
}

// Returns true when the request was handled.
function handle(req, res, url) {
  if (!url.pathname.startsWith("/ep/")) return false;
  const p = url.pathname.slice(3), q = url.searchParams;
  if (p === "/_reset") { reset(); json(res, 200, { ok: true }); return true; }
  if (p === "/_fail") {
    addRule([q.get("status") || "429", q.get("n") || "1", q.get("route") || "any", q.get("retryAfter") || ""].join(":"));
    json(res, 200, { ok: true, rules: state.rules }); return true;
  }
  if (p === "/_config") {
    if (q.get("latency") != null) state.config.latency = Math.max(0, +q.get("latency") || 0);
    if (q.get("waf") != null) { waf.cfg = parseWaf(q.get("waf")); wafReset(); }
    if (q.get("cap") != null) state.config.cap = Math.max(1, +q.get("cap") || 100000);
    json(res, 200, state.config); return true;
  }
  if (p === "/_waf") {
    if (q.get("block") != null && waf.cfg) { const c = waf.clients.get(req.socket.remoteAddress || "?") || { times: [], until: 0 }; c.until = Date.now() + (+q.get("block") || waf.cfg.blockS) * 1000; waf.clients.set(req.socket.remoteAddress || "?", c); waf.blocks++; }
    json(res, 200, { ok: !!waf.cfg }); return true;
  }
  if (p === "/_dump") { json(res, 200, load("workouts.json")); return true; }
  if (p === "/_hit") { res.statusCode = 204; res.end(); return true; }
  if (p === "/_stats") { json(res, 200, { waf: waf.cfg ? Object.assign({}, waf.cfg, { counted: waf.counted, blocked: waf.blocked, blocks: waf.blocks, peak: waf.peak, blockedUntil: Math.max(0, ...[...waf.clients.values()].map((c) => c.until)) }) : null, total: state.total, byRoute: state.byRoute, inFlight: state.inFlight, maxInFlight: state.maxInFlight, failed: state.failed, rules: state.rules, config: state.config }); return true; }
  const route = routeOf(p), body = data(p, q);
  if (!body) { json(res, 404, bad("no such route")); return true; }
  state.total++; state.byRoute[route] = (state.byRoute[route] || 0) + 1;
  state.inFlight++; state.maxInFlight = Math.max(state.maxInFlight, state.inFlight);
  setTimeout(() => {
    state.inFlight--;
    const rule = state.rules.find((r) => r.left > 0 && (r.route === "any" || r.route === route));
    if (rule) {
      rule.left--; state.failed++;
      if (rule.status === "envelope") return json(res, 200, bad("injected failure"));
      return json(res, +rule.status || 500, bad("injected " + rule.status), rule.retryAfter != null ? { "Retry-After": String(rule.retryAfter) } : {});
    }
    json(res, 200, body);
  }, state.config.latency);
  return true;
}
module.exports = { handle, wafCheck };
