// QA only: stub fetch + fixed clock for Exercise Progress (History tab -> workout -> tap an exercise).
// Use as the init script of a chrome-devtools page (or paste into the console before the app boots).
// Needs `node qa/fixture-server.js` (default :8799, PORT env overrides; pass fxport=NNNN here to match).
// The workouts come from qa/fixtures/exercise-progress/ (86 workouts 2025-01 .. 2026-10, regenerate with
// `node qa/make-exercise-progress-fixtures.js`). Default clock 2026-10-29 12:00 local.
// Flags in location.hash, separated by & (bare token or k=v):
//   #imperial              profile unit = lb (default kg)
//   #now=2026-10-29T12:00:00   fixed local clock
//   #email=a@example.test  account used for the cache scope (default qa@example.test) - use two values to test isolation
//   #size=7&cap=7         exercise the bisect fallback: the client asks for size 7 (window.__EP_LIST_SIZE, default 5000) and the
//                          fixture server caps every list answer at 7 rows, so the single wide call comes back "full" and is bisected.
//                          #size=2&cap=2 makes the same-day pair a saturated day (warning "history may be missing").
//   #retryscale=0.05       multiply the client's backoff waits (1,2,4,8 s and Retry-After) by this, to test failures fast
//   #latency=400           fixture server latency per data call in ms (default 150)
//   #fail=429:5[:route[:retryAfter]]   inject failures (see qa/exercise-progress-routes.js); route = list|detail|action|any
//                          e.g. #fail=429:5::2 -> five 429 answers with Retry-After: 2 ; #fail=500:all:detail -> every detail call 500
//   #waf=60:10:10          turn on the fixture server's Cloudflare-like limiter (60 per 10 s per IP, 10 s block, HTML 429, no
//                          Retry-After). Calls the stub answers itself are reported to it via /ep/_hit so they are counted too.
//   #emptylist             /sport/record/list answers 200 with [] (a cached history must survive it)
//   #nolibrary             /action/list answers 500 (modes unknown: no labels, chart the stored value)
//   #offline               start offline (every /api call rejects, navigator.onLine=false)
// Runtime helpers: window.__epOffline(true|false), window.__reqs (log of every /api call), and the server's
// GET /ep/_stats (requests, maxInFlight) and /ep/_reset.
// DELETE/POST .../sport/record/delete/<id> is answered {success:true} and logged; nothing is deleted on the server.
(() => {
  const parts = (location.hash || "").slice(1).split("&").filter(Boolean);
  const P = new URLSearchParams(parts.map((x) => (x.includes("=") ? x : x + "=1")).join("&"));
  const email = P.get("email") || "qa@example.test";
  try { localStorage.setItem("innodigym_token", "dummy-qa-token"); localStorage.setItem("innodigym_email", email); } catch (e) {}

  const NOW = new Date(P.get("now") || "2026-10-29T12:00:00").getTime(), T0 = Date.now(), RD = Date;
  function FDate(...a) { return a.length ? new RD(...a) : new RD(NOW + (RD.now() - T0)); }
  FDate.prototype = RD.prototype; FDate.now = () => NOW + (RD.now() - T0); FDate.UTC = RD.UTC; FDate.parse = RD.parse;
  window.Date = FDate;
  if (P.get("size")) window.__EP_LIST_SIZE = +P.get("size");
  if (P.get("retryscale")) window.__EP_RETRY_SCALE = +P.get("retryscale");

  let off = P.has("offline");
  Object.defineProperty(navigator, "onLine", { configurable: true, get: () => !off });
  window.__epOffline = (v) => { off = !!v; window.dispatchEvent(new Event(off ? "offline" : "online")); };

  const F = `http://localhost:${P.get("fxport") || 8799}/`, real = window.fetch.bind(window), reqs = (window.__reqs = []);
  const json = (o, status) => new Response(JSON.stringify(o), { status: status || 200, headers: { "Content-Type": "application/json" } });
  const ok = (data) => json({ code: 200, success: true, msg: "OK", data });
  const forward = async (url) => {
    const r = await real(url), body = await r.text(), h = { "Content-Type": "application/json" };
    const ra = r.headers.get("Retry-After"); if (ra) h["Retry-After"] = ra;
    return new Response(body, { status: r.status, headers: h });
  };

  // Configure the fixture server once (failure injection, latency, cap) before any data call goes out.
  const ready = (async () => {
    try {
      if (P.has("fail") || P.has("cap") || P.has("latency") || P.has("waf")) await real(F + "ep/_reset");
      if (P.get("waf")) await real(F + "ep/_config?waf=" + encodeURIComponent(P.get("waf")));
      if (P.get("cap")) await real(F + "ep/_config?cap=" + encodeURIComponent(P.get("cap")));
      if (P.get("latency")) await real(F + "ep/_config?latency=" + encodeURIComponent(P.get("latency")));
      if (P.get("fail")) {
        const [status, n, route, ra] = P.get("fail").split(":");
        await real(F + `ep/_fail?status=${status || 429}&n=${n || 1}&route=${route || "any"}&retryAfter=${ra || ""}`);
      }
    } catch (e) { /* server not running: requests will fail visibly */ }
  })();

  window.fetch = async (u, o) => {
    const s = String(u), method = ((o && o.method) || "GET").toUpperCase();
    if (!s.startsWith("/api")) return real(u, o);
    reqs.push({ method, url: s, t: RD.now() });
    if (off) throw new TypeError("Failed to fetch");
    await ready;
    const [pp, qs] = s.split("?"), p = pp.replace(/^\/api/, "");
    const forwarded = ["/sport/record/list", "/sport/record/detail", "/action/list", "/sport/record/statistics/list", "/app/statistics", "/sport/record/badge/list"].includes(p);
    if (!forwarded && P.has("waf")) { const h = await real(F + "ep/_hit"); if (h.status === 429) return new Response(await h.text(), { status: 429, headers: { "Content-Type": "text/html" } }); }
    if (method !== "GET" && /\/sport\/record\/delete\//.test(p)) return ok(null);
    if (p === "/app/getInfo") return ok({ nickName: "QA", birthday: "1990-05-01", sex: 1, unit: P.has("imperial") ? 1 : 0, trainingTime: 30 });
    if (p === "/action/list" && P.has("nolibrary")) return json({ code: 500, success: false, msg: "library down", data: null }, 500);
    if (p === "/sport/record/list" && P.has("emptylist")) return ok([]);
    if (p === "/sport/record/list" || p === "/sport/record/detail" || p === "/action/list") return forward(F + "ep" + p + (qs ? "?" + qs : ""));
    if (["/sport/record/statistics/list", "/app/statistics", "/sport/record/badge/list"].includes(p)) return forward(F + p.slice(1) + (qs ? "?" + qs : ""));
    return ok([]);
  };
})();
