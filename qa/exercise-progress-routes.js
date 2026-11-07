// QA only: Exercise Progress routes for qa/fixture-server.js. Everything lives under /ep/ so it never
// collides with the Activity routes: /ep/<api path> mirrors the app's /api paths.
//   GET /ep/sport/record/list?startTime=&endTime=&size=   workouts (no extData) newest first, filtered to the
//        window (both bounds inclusive, format must be 'yyyy-MM-dd HH:mm:ss' else []), capped at
//        min(size or 50, cap). cap = EP_LIST_CAP env (default 500) or /ep/_config?cap=N, so a small cap exercises
//        the client's window bisection.
//   GET /ep/sport/record/detail?recordId=   full workout with extData; unknown id -> HTTP 200 envelope code 500
//   GET /ep/action/list[?custom=true]        library (sideNum / countType) or the custom actions
// Failure injection (HTTP-level, shared by every /ep/ data route unless limited):
//   env EP_FAIL="429:5:detail:2"  or  GET /ep/_fail?status=429&n=5&route=detail&retryAfter=2
//     status  HTTP status to answer (429, 500, 502, 503, ...), or "envelope" for HTTP 200 with code 500
//     n       how many matching requests to fail (default 1; "all" = until reset)
//     route   list | detail | action | any (default any)
//     retryAfter  seconds sent in the Retry-After header (429 only; optional)
//   Rules stack; each is consumed independently. GET /ep/_reset clears rules, counters and config.
// Other helpers: GET /ep/_config?latency=ms&cap=N, GET /ep/_stats -> {total, byRoute, inFlight, maxInFlight, failed, rules, config}.
//   Default latency is 150 ms so progress and the concurrency limit are observable (EP_LATENCY_MS env).
const fs = require("fs"), path = require("path");
const DIR = path.join(__dirname, "fixtures", "exercise-progress");
const load = (n) => JSON.parse(fs.readFileSync(path.join(DIR, n), "utf8"));
const env = (d) => ({ code: 200, msg: "OK", traceId: "fixture", success: true, data: d });
const bad = (msg) => ({ code: 500, msg, traceId: "fixture", data: null, error: true, success: false, warn: false });
const FORMAT = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/;

const state = { rules: [], total: 0, byRoute: {}, inFlight: 0, maxInFlight: 0, failed: 0, config: { latency: +(process.env.EP_LATENCY_MS || 150), cap: +(process.env.EP_LIST_CAP || 500) } };
function addRule(spec) {
  const [status, n, route, ra] = String(spec).split(":");
  if (!status) return;
  state.rules.push({ status, left: n === "all" ? Infinity : (n === undefined || n === "" ? 1 : +n), route: route || "any", retryAfter: ra ? +ra : null });
}
if (process.env.EP_FAIL) process.env.EP_FAIL.split(",").forEach(addRule);
function reset() { state.rules = []; state.total = 0; state.byRoute = {}; state.maxInFlight = 0; state.failed = 0; state.config = { latency: +(process.env.EP_LATENCY_MS || 150), cap: +(process.env.EP_LIST_CAP || 500) }; }

const routeOf = (p) => (/record\/list$/.test(p) ? "list" : /record\/detail$/.test(p) ? "detail" : /action\/list$/.test(p) ? "action" : "other");
const json = (res, code, body, headers) => { res.statusCode = code; res.setHeader("Content-Type", "application/json"); Object.entries(headers || {}).forEach(([k, v]) => res.setHeader(k, v)); res.end(JSON.stringify(body)); };

function data(p, q) {
  if (p === "/sport/record/list") {
    const a = q.get("startTime"), b = q.get("endTime"), size = Math.max(1, +q.get("size") || 50);
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
  if (p === "/action/list") return q.get("custom") === "true" ? load("action-list-custom.json") : load("action-list.json");
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
    if (q.get("cap") != null) state.config.cap = Math.max(1, +q.get("cap") || 500);
    json(res, 200, state.config); return true;
  }
  if (p === "/_stats") { json(res, 200, { total: state.total, byRoute: state.byRoute, inFlight: state.inFlight, maxInFlight: state.maxInFlight, failed: state.failed, rules: state.rules, config: state.config }); return true; }
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
module.exports = { handle };
