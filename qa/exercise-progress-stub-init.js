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
// Phase 2/3 flags:
//   #lang=es / #theme=dark   UI language (also makes /action/list answer Spanish names) / theme, set in localStorage before the app boots
//   #synced[=N]            this device already completed a full sync: before the app starts the stub writes the progress cache
//                          (all 86 workouts, meta sync.complete and firstFull). N (or #behind=N) leaves the N newest workouts out, so a
//                          warm-up has N details to fetch. Without it the cache is whatever the app saved itself.
//   #syncage=120           minutes since that sync finished (default 120, so the 30 minute gate is open); #warmat=5 puts the last warm-up 5 min ago
//   #warmdelay=300         idle wait before the warm-up in ms (default 5000);  #warmevery=60000  the 30 minute gate in ms
//   #savedata / #hidden    navigator.connection.saveData = true / the tab starts hidden (document.visibilityState)
//   Runtime: window.__epHidden(bool) (fires visibilitychange), window.__epSaveData(bool), window.__epAdvance(ms) (moves the fake clock
//   forward), window.__epSeeded (promise of the #synced seeding), ExerciseProgressUI.warmUp.log() (decisions of the warm-up).
//   The program editor: Programs tab -> "Progress icon demo" -> Edit. Steps: 512 Combined, 530 Per side, 561 and 560 sideNum 0
//   (no icon), 9001 custom Combined, 777 unknown mode with a weight (icon), 888 unknown mode without weight (no icon), 570 Per side.
//   Saves are logged in window.__saves and answered {success:true}; nothing is stored.
// Runtime helpers: window.__epOffline(true|false), window.__reqs (log of every /api call), and the server's
// GET /ep/_stats (requests, maxInFlight) and /ep/_reset.
// DELETE/POST .../sport/record/delete/<id> is answered {success:true} and logged; nothing is deleted on the server.
(() => {
  const parts = (location.hash || "").slice(1).split("&").filter(Boolean);
  const P = new URLSearchParams(parts.map((x) => (x.includes("=") ? x : x + "=1")).join("&"));
  const email = P.get("email") || "qa@example.test";
  try { localStorage.setItem("innodigym_token", "dummy-qa-token"); localStorage.setItem("innodigym_email", email); } catch (e) {}
  try { if (P.get("lang")) localStorage.setItem("innodigym_lang", P.get("lang")); if (P.get("theme")) localStorage.setItem("innodigym_theme", P.get("theme")); } catch (e) {}

  let shift = 0;
  const NOW = new Date(P.get("now") || "2026-10-29T12:00:00").getTime(), T0 = Date.now(), RD = Date;
  const clock = () => NOW + shift + (RD.now() - T0);
  function FDate(...a) { return a.length ? new RD(...a) : new RD(clock()); }
  FDate.prototype = RD.prototype; FDate.now = clock; FDate.UTC = RD.UTC; FDate.parse = RD.parse;
  window.Date = FDate;
  window.__epAdvance = (ms) => { shift += Number(ms) || 0; return new FDate().toISOString(); };
  if (P.get("warmdelay")) window.__EP_WARM_DELAY = +P.get("warmdelay");
  if (P.get("warmevery")) window.__EP_WARM_EVERY = +P.get("warmevery");

  // Visibility and Save-Data, switchable at run time.
  let hid = P.has("hidden"), sd = P.has("savedata");
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => (hid ? "hidden" : "visible") });
  Object.defineProperty(document, "hidden", { configurable: true, get: () => hid });
  window.__epHidden = (v) => { hid = !!v; document.dispatchEvent(new Event("visibilitychange")); };
  Object.defineProperty(navigator, "connection", { configurable: true, get: () => ({ saveData: sd, effectiveType: "4g", addEventListener() {}, removeEventListener() {} }) });
  window.__epSaveData = (v) => { sd = !!v; };
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

  // #synced: write a finished sync into the progress cache (IndexedDB) once the app's scripts (and ExerciseProgressCore) are loaded.
  // The workouts come from the fixture server's admin route /ep/_dump, so the server's counters and the WAF limiter see nothing.
  // window.__EP_READY makes the warm-up wait for this.
  if (P.has("synced") || P.has("behind")) {
    const behind = Math.max(0, +(P.get("behind") || (P.get("synced") !== "1" ? P.get("synced") : 0)) || 0);
    window.__epSeeded = window.__EP_READY = new Promise((resolve) => {
      const go = async () => {
        try {
          const Core = window.ExerciseProgressCore;
          const all = (await (await real(F + "ep/_dump")).json()).sort((a, b) => (a.startTime < b.startTime ? 1 : -1)).slice(behind);
          const name = Core.dbName(email);
          await new Promise((res) => { const r = indexedDB.deleteDatabase(name); r.onsuccess = r.onerror = r.onblocked = () => res(); });
          const db = await new Promise((res, rej) => {
            const r = indexedDB.open(name, 1);
            r.onupgradeneeded = () => { r.result.createObjectStore("workouts", { keyPath: "recordId" }); r.result.createObjectStore("meta", { keyPath: "key" }); };
            r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
          });
          const tx = db.transaction(["workouts", "meta"], "readwrite");
          for (const w of all) { const sm = Core.summarizeWorkout(w); if (sm) tx.objectStore("workouts").put(sm); }
          const ago = (min) => clock() - (+min) * 60000;
          tx.objectStore("meta").put({ key: "sync", value: { complete: true, at: ago(P.get("syncage") || 120) } });
          tx.objectStore("meta").put({ key: "firstFull", value: { at: ago(P.get("syncage") || 120) } });
          if (P.get("warmat")) tx.objectStore("meta").put({ key: "warm", value: { at: ago(P.get("warmat")) } });
          await new Promise((res, rej) => { tx.oncomplete = res; tx.onerror = () => rej(tx.error); });
          db.close();
          const reg = JSON.parse(localStorage.getItem("myinnox1_progress_dbs") || "[]");
          if (!reg.includes(name)) localStorage.setItem("myinnox1_progress_dbs", JSON.stringify(reg.concat(name)));
        } catch (e) { console.warn("stub seeding failed", e); }
        resolve();
      };
      if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", go); else go();
    });
  }

  window.fetch = async (u, o) => {
    const s = String(u), method = ((o && o.method) || "GET").toUpperCase();
    if (!s.startsWith("/api")) return real(u, o);
    reqs.push({ method, url: s, t: RD.now() });
    if (off) throw new TypeError("Failed to fetch");
    await ready;
    const [pp, qs] = s.split("?"), p = pp.replace(/^\/api/, "");
    const forwarded = ["/sport/record/list", "/sport/record/detail", "/action/list", "/course/custom/list", "/course/custom/detail", "/sport/record/statistics/list", "/app/statistics", "/sport/record/badge/list"].includes(p);
    if (!forwarded && P.has("waf")) { const h = await real(F + "ep/_hit"); if (h.status === 429) return new Response(await h.text(), { status: 429, headers: { "Content-Type": "text/html" } }); }
    if (method !== "GET" && /\/sport\/record\/delete\//.test(p)) return ok(null);
    if (p === "/app/getInfo") return ok({ nickName: "QA", birthday: "1990-05-01", sex: 1, unit: P.has("imperial") ? 1 : 0, trainingTime: 30 });
    if (p === "/action/list" && P.has("nolibrary")) return json({ code: 500, success: false, msg: "library down", data: null }, 500);
    if (p === "/sport/record/list" && P.has("emptylist")) return ok([]);
    if (method === "POST" && p === "/course/custom/save") { (window.__saves = window.__saves || []).push(JSON.parse(o.body)); return ok(null); }
    if (p === "/course/custom/cover/list") return ok([]);
    if (p === "/sport/record/list" || p === "/sport/record/detail" || p === "/action/list" || p === "/course/custom/list" || p === "/course/custom/detail") return forward(F + "ep" + p + (qs ? "?" + qs : ""));
    if (["/sport/record/statistics/list", "/app/statistics", "/sport/record/badge/list"].includes(p)) return forward(F + p.slice(1) + (qs ? "?" + qs : ""));
    return ok([]);
  };
})();
