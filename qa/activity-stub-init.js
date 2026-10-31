// QA only: stub fetch + fixed clock for the Activity feature (History tab, explorer, medals, report).
// Use as the init script of a chrome-devtools page (or paste before app.js). Needs `node qa/fixture-server.js` on :8799.
// Variant = first bare token of location.hash, optional k=v params separated by &:
//   #real (default) | #empty | #error | #malformed | #slow | #race | #nomedals | #allmedals | #partialorder
//   #nullreceive | #imgfail | #xss | #todayrow | #todaynorow | #notarget | #grades | #dupes | #bigvol | #dst
//   #cross | #multimonth | #fullyear | #nosets | #nullsets | #multisets | #nopic | #detail404 | #recordsmany
//   #recordsempty | #badtime | #totalszero | #totalsbig | #statsfail | #badgefail | #listfail | #detailfail
//   extra params: now=2026-10-29T12:00:00 (fixed local clock, default 2026-10-29 12:00), delay=ms (default 4000 for #slow)
// Every request is logged in window.__reqs = [{method,url,variant}] (assert GET-only and statisticsType 1|2).
// DELETE /api/sport/record/... is answered {success:true} and logged (nothing is really deleted).
(() => {
  const H = (location.hash || "#real").slice(1), parts = H.split("&");
  const variant = parts[0].includes("=") ? "real" : (parts[0] || "real");
  const params = new URLSearchParams(parts.filter(p => p.includes("=")).join("&"));
  try { localStorage.setItem("innodigym_token", "dummy-qa-token"); localStorage.setItem("innodigym_email", "qa@example.test"); } catch (e) {}

  // fixed clock (local time)
  const NOW = new Date(params.get("now") || "2026-10-29T12:00:00").getTime(), T0 = Date.now(), RD = Date;
  function FDate(...a) { return a.length ? new RD(...a) : new RD(NOW + (RD.now() - T0)); }
  FDate.prototype = RD.prototype; FDate.now = () => NOW + (RD.now() - T0); FDate.UTC = RD.UTC; FDate.parse = RD.parse;
  window.Date = FDate;

  const F = "http://localhost:8799/", real = window.fetch.bind(window), reqs = (window.__reqs = []);
  const json = (o, status) => new Response(typeof o === "string" ? o : JSON.stringify(o), { status: status || 200, headers: { "Content-Type": "application/json" } });
  const fx = async (name) => json(await (await real(F + name)).text());
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const FAIL = { success: false, code: 500, msg: "Boom <b>x</b>", data: null };
  let raceN = 0;

  const STATS = { cross: "stats-daily-cross.json", todaynorow: "stats-daily-today-no-row.json", todayrow: "stats-daily-today-row.json",
    notarget: "stats-daily-no-targets.json", grades: "stats-daily-grades.json", dupes: "stats-daily-duplicates.json",
    bigvol: "stats-daily-bigvol.json", dst: "stats-daily-dst.json", empty: "stats-empty.json" };
  const MONTHS = { multimonth: "stats-monthly-multi.json", fullyear: "stats-monthly-full.json", empty: "stats-empty.json" };
  const BADGES = { nomedals: "badges-none.json", allmedals: "badges-all.json", partialorder: "badges-partial-order.json",
    nullreceive: "badges-null-receivetime.json", imgfail: "badges-imgfail.json" };
  const LISTS = { recordsmany: "records-list-many.json", recordsempty: "records-list-empty.json", empty: "records-list-empty.json",
    xss: "records-list-xss.json", badtime: "records-list-badtime.json" };
  const DETAIL = { xss: "record-detail-xss.json", nosets: "record-detail-nosets.json", nullsets: "record-detail-nullsets.json",
    multisets: "record-detail-multisets.json", nopic: "record-detail-nopic.json", imgfail: "record-detail-imgfail.json",
    detail404: "record-detail-404.json" };
  const TOTALS = { totalszero: "totals-zero.json", totalsbig: "totals-big.json", empty: "totals-zero.json" };

  window.fetch = async (u, o) => {
    const s = String(u), method = ((o && o.method) || "GET").toUpperCase();
    if (!s.startsWith("/api")) return real(u, o);
    reqs.push({ method, url: s, variant });
    const [p, qs] = s.split("?"), v = variant;
    if (method === "DELETE" || (method === "POST" && /record\/delete/.test(p))) return json({ code: 200, success: true, data: null });
    if (v === "slow" || v === "race") {
      // slow: fixed delay; race: every other request is much slower than the next one (out-of-order resolve)
      await sleep(v === "slow" ? +(params.get("delay") || 4000) : (raceN++ % 2 === 0 ? 1500 : 100));
    }
    const failFor = { statsfail: "/sport/record/statistics/list", badgefail: "/sport/record/badge/list", listfail: "/sport/record/list", detailfail: "/sport/record/detail" };
    if (v === "error" || (failFor[v] && p.endsWith(failFor[v]))) return json(FAIL, 500);
    if (v === "malformed") return new Response("<html>502 Bad Gateway</html>", { status: 200, headers: { "Content-Type": "text/html" } });
    const q = new URLSearchParams(qs || "");
    if (p === "/api/sport/record/statistics/list") {
      const t = q.get("statisticsType");
      if (t !== "1" && t !== "2") return json({ code: 500, success: false, msg: "type conversion error", data: null }, 500);
      const f = (t === "1" ? STATS : MONTHS)[v];
      if (f) return fx(f);
    } else if (p === "/api/sport/record/badge/list") { if (BADGES[v]) return fx(BADGES[v]); }
    else if (p === "/api/sport/record/list") { if (LISTS[v]) return fx(LISTS[v]); }
    else if (p === "/api/sport/record/detail") { if (DETAIL[v]) return fx(DETAIL[v]); }
    else if (p === "/api/app/statistics") { if (TOTALS[v]) return fx(TOTALS[v]); }
    else return json({ code: 200, success: true, data: [] });
    // default: real-shaped payloads from fixture-server routes (filters statistics by startTime/endTime)
    return json(await (await real(F + p.replace(/^\/api\//, "") + (qs ? "?" + qs : ""))).text());
  };
})();
