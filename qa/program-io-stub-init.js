// QA only: stateful in-memory stub of /api/course/custom/* (+ action/list) for the export / import / clone UI.
// Load as an init script on the app page (needs `node qa/fixture-server.js` on :8799 for the action library).
// Test hooks: window.__saves (every save body), window.__downloads ({name, text}), window.__store (programs by id).
// A save whose name contains "FAIL" returns a 500 envelope; "SLOW" delays 600 ms.
(() => {
  try { localStorage.setItem("innodigym_token", "dummy-qa-token"); localStorage.setItem("innodigym_email", "qa@example.test"); } catch (e) {}
  const F = "http://localhost:8799/", real = window.fetch.bind(window);
  const step = (id, name, o = {}) => Object.assign({
    id: id * 10, courseId: 0, sort: 1, actionLibraryId: id, actionName: name, actionNo: "LM" + id, actionType: 3,
    picUrl: "", videoUrl: "", stage: 2, count: 12, consume: null, sideNum: 2, countType: 1, sideWeight: 100,
    muscleGroups: "1", muscleParts: "1", trainingPoint: "tp", reqParts: "3", restTime: 45, groupNum: 3,
    mode: 0, modeParam: "{}", breathTip: "bt", custom: false, duration: 12,
  }, o);
  const prog = (id, name, steps) => ({
    id, courseNo: "LM-" + id, name, level: 1, courseType: 1, smallImg: "https://power.renhesports.com/filestore/power/course/COVER_RACK_3_4.jpg",
    detailsImg: "https://power.renhesports.com/filestore/power/course/COVER_RACK_1_4.jpg", deviceCategory: 7, sportType: 2,
    muscleParts: "1,2", tags: null, custom: null, duration: 55, capacity: 0, heartRateMin: 0, heartRateMax: 0, actionNum: steps.length,
    collected: false, description: "", updateTime: "2026-10-31 12:00:00", deviceTypeList: ["35"], partsList: ["1", "13"],
    warmUpStepList: [], mainStepList: steps.map((s, i) => Object.assign({}, s, { courseId: id, sort: i + 1 })), relaxStepList: [],
  });
  const store = window.__store = {
    2266: prog(2266, "Rutina A", [step(500, "Press inclinado con barra"), step(501, "Press de banca plano", { sideNum: 1, sideWeight: 68 })]),
    2220: prog(2220, "Rutina B <i>x</i> con un nombre muy largo para comprobar el ajuste de línea en pantallas estrechas", [step(502, "Aperturas en polea")]),
    2300: prog(2300, "Con acción propia", [step(500, "Press inclinado con barra"), step(9999, "Acción personalizada ajena")]),
  };
  let nextId = 3000;
  window.__saves = []; window.__downloads = [];
  const env = (data) => new Response(JSON.stringify({ code: 200, msg: "OK", success: true, data }), { status: 200, headers: { "Content-Type": "application/json" } });
  const err = (msg) => new Response(JSON.stringify({ code: 500, success: false, msg, data: null }), { status: 200, headers: { "Content-Type": "application/json" } });
  const origCreate = URL.createObjectURL.bind(URL);
  URL.createObjectURL = (b) => { try { b.text().then((text) => window.__downloads.push({ text })); } catch (e) {} return origCreate(b); };
  const origClick = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function () { if (this.download) { const d = window.__downloads; d.name = this.download; (window.__dlNames = window.__dlNames || []).push(this.download); return; } return origClick.call(this); };

  window.fetch = async (u, o) => {
    const s = String(u);
    if (!s.startsWith("/api")) return real(u, o);
    const url = new URL(s, location.origin), p = url.pathname.replace(/^\/api/, "");
    if (p === "/action/list") return new Response(await (await real(F + "action-list.json")).text(), { status: 200, headers: { "Content-Type": "application/json" } });
    if (p === "/course/custom/list") return env(Object.values(store).map((c) => ({ id: c.id, name: c.name, smallImg: c.smallImg, actionNum: c.mainStepList.length, duration: c.duration, updateTime: c.updateTime })));
    if (p === "/course/custom/detail") { const c = store[url.searchParams.get("id")]; return c ? env(JSON.parse(JSON.stringify(c))) : err("not found"); }
    if (p === "/course/custom/save") {
      const body = JSON.parse(o.body); window.__saves.push(body);
      if (/SLOW/.test(body.name)) await new Promise((r) => setTimeout(r, 600));
      if (/FAIL/.test(body.name)) return err("boom: 系统异常");
      if (!body.mainStepList || !body.name) return err("incomplete body");
      const id = body.id || nextId++;
      store[id] = Object.assign({}, body, { id, courseNo: "LM-" + id, updateTime: "2026-10-31 13:00:00" });
      return env(null);
    }
    if (/^\/course\/custom\/delete\//.test(p)) { delete store[p.split("/").pop()]; return env(null); }
    return env([]);
  };
})();
