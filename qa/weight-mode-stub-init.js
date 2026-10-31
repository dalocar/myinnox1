// QA only: stub fetch for the weight-mode feature (sideNum badges + My actions). Needs
// `node qa/fixture-server.js` on :8799. Init script of a chrome-devtools page.
// Variant = first token of location.hash: #metric (default) | #imperial -> profile.unit 0 / 1.
// Programs: /course/custom/detail serves qa/fixtures/course-detail-41.json with the main steps'
// sideNum forced to 2, 1, 0, 2, ... (Combined, Per side, No weight, Combined) so every badge shows.
// /action/list (default) has NO custom actions (like the real server);
// /action/list?custom=true returns two custom actions, sideNum 1 and 2, like the real account.
// /course/custom/save bodies are kept in window.__saved, never sent.
(() => {
  const v = (location.hash || "#metric").slice(1).split("&")[0] || "metric";
  try { localStorage.setItem("innodigym_token", "dummy-qa-token"); localStorage.setItem("innodigym_email", "qa@example.test"); } catch (e) {}
  const F = "http://localhost:8799/", real = window.fetch.bind(window);
  const json = (o, status) => new Response(typeof o === "string" ? o : JSON.stringify(o), { status: status || 200, headers: { "Content-Type": "application/json" } });
  const ok = (data) => json({ code: 200, success: true, msg: "ok", data });
  const MODES = [2, 1, 0, 2];
  const custom = [
    { id: 2290, name: "Custom - Per side", picUrl: "", actionType: 3, countType: 1, sideNum: 1, sideWeight: "0", custom: true },
    { id: 2291, name: "Custon - Combined", picUrl: "", actionType: 3, countType: 1, sideNum: 2, sideWeight: "0", custom: true },
  ];
  window.__saved = [];
  window.fetch = async (u, o) => {
    const s = String(u); if (!s.startsWith("/api")) return real(u, o);
    const p = s.split("?")[0].replace(/^\/api/, "");
    if (p === "/app/getInfo") return ok({ nickName: "QA", birthday: "1990-05-01", sex: 1, unit: v === "imperial" ? 1 : 0, trainingTime: 30 });
    if (p === "/course/custom/list") return ok([{ id: 41, name: "Strength QA", smallImg: "", actionNum: 4, duration: 55, updateTime: "2026-10-31" }]);
    if (p === "/course/custom/detail") {
      const d = JSON.parse(await (await real(F + "course-detail-41.json")).text());
      (d.data.mainStepList || []).forEach((st, i) => { st.sideNum = MODES[i % MODES.length]; });
      return json(d);
    }
    if (p === "/course/custom/save") { window.__saved.push(JSON.parse(o.body)); return ok(41); }
    if (p === "/course/custom/cover/list") return ok({});
    if (p === "/action/list") {
      if (s.includes("custom=true")) return ok(custom);
      const lib = JSON.parse(await (await real(F + "action-list.json")).text());
      return json(lib);
    }
    return ok([]);
  };
})();
