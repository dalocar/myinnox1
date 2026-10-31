// QA only: stub fetch for the Units feature (kg/lb). Needs `node qa/fixture-server.js` on :8799.
// Init script of a chrome-devtools page, or paste before app.js. Variant = first token of location.hash:
//   #metric (default) | #imperial   -> profile.unit 0 / 1 returned by /api/app/getInfo
// Programs: /course/custom/list + /course/custom/detail serve qa/fixtures/course-detail-41.json (stored sideWeight
// in tenths of kg: 50, 85, ...). /course/custom/save is NOT sent anywhere: the body is kept in window.__saved.
// /app/updateInfo bodies are kept in window.__updates. Everything else is forwarded to the fixture server
// (activity stats/records/badges) or answered with fitness-last.json / an empty list.
(() => {
  const v = (location.hash || "#metric").slice(1).split("&")[0] || "metric";
  try { localStorage.setItem("innodigym_token", "dummy-qa-token"); localStorage.setItem("innodigym_email", "qa@example.test"); } catch (e) {}
  const F = "http://localhost:8799/", real = window.fetch.bind(window);
  const json = (o, status) => new Response(typeof o === "string" ? o : JSON.stringify(o), { status: status || 200, headers: { "Content-Type": "application/json" } });
  const ok = (data) => json({ code: 200, success: true, msg: "ok", data });
  window.__saved = []; window.__updates = []; window.__profile = { nickName: "QA", birthday: "1990-05-01", sex: 1, unit: v === "imperial" ? 1 : 0, trainingTime: 30, targetWeight: 70, height: 175, weight: 72.5 };
  window.fetch = async (u, o) => {
    const s = String(u); if (!s.startsWith("/api")) return real(u, o);
    const p = s.split("?")[0].replace(/^\/api/, "");
    if (p === "/app/getInfo") return ok(Object.assign({}, window.__profile));
    if (p === "/app/updateInfo") { const b = JSON.parse(o.body); window.__updates.push(b); Object.assign(window.__profile, b); return ok(null); }
    if (p === "/course/custom/list") return ok([{ id: 41, name: "Strength QA", smallImg: "", actionNum: 4, duration: 55, updateTime: "2026-10-31" }]);
    if (p === "/course/custom/detail") return json(await (await real(F + "course-detail-41.json")).text());
    if (p === "/course/custom/save") { window.__saved.push(JSON.parse(o.body)); return ok(41); }
    if (p === "/course/custom/cover/list") return ok({});
    if (p === "/physicalFitnessTest/last") return json(await (await real(F + "fitness-last.json")).text());
    if (p === "/action/list") return json(await (await real(F + "action-list.json")).text());
    if (/^\/(sport|app\/statistics)/.test(p)) { const r = await real(F + p.slice(1) + (s.includes("?") ? "?" + s.split("?")[1] : "")); return json(await r.text()); }
    return ok([]);
  };
})();
