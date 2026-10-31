// QA helper: paste as the body of evaluate_script (async function). Walks every real tab with the real
// tab buttons and returns, per screen: horizontal overflow, lite-mode state, layout rects with fx full vs off
// (shift check), elementFromPoint at several spots (overlay must never be hit), #fx-root focusables.
async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const html = document.documentElement;
  const out = { theme: html.dataset.theme, fxMode: html.dataset.fx, w: innerWidth, screens: {} };
  const rects = () => {
    const sel = "header, nav#tabs, .tab-panel:not([hidden]) > *, .tab-panel:not([hidden]) .program-card, .tab-panel:not([hidden]) .action-card, .tab-panel:not([hidden]) .record-card, .tab-panel:not([hidden]) button, .tab-panel:not([hidden]) input";
    return [...document.querySelectorAll(sel)].slice(0, 80).map((e) => { const r = e.getBoundingClientRect(); return [Math.round(r.x * 10) / 10, Math.round(r.y * 10) / 10, Math.round(r.width * 10) / 10, Math.round(r.height * 10) / 10]; });
  };
  const hitCheck = () => {
    let bad = 0, n = 0;
    for (const fx of [0.1, 0.5, 0.9]) for (const fy of [0.08, 0.3, 0.5, 0.7, 0.9]) {
      const el = document.elementFromPoint(innerWidth * fx, innerHeight * fy); n++;
      if (!el || el.closest("#fx-root") || el.matches?.(".xmas-top, .xmas-top *, .xmas-snow, .hf, .hf *")) bad++;
    }
    return { n, bad };
  };
  const tabs = [...document.querySelectorAll("#tabs .tab-btn")].map((b) => b.dataset.tab);
  for (const t of tabs) {
    const btn = document.querySelector('#tabs .tab-btn[data-tab="' + t + '"]');
    btn.click();
    await sleep(900);
    const s = { lite: html.classList.contains("xmas-lite") || html.classList.contains("hf-lite"), active: document.querySelector(".tab-panel:not([hidden])")?.id };
    s.overflowX = document.documentElement.scrollWidth - innerWidth;
    s.bodyOverflowX = document.body.scrollWidth - innerWidth;
    s.hit = hitCheck();
    s.fxFocusable = document.querySelectorAll("#fx-root a, #fx-root button, #fx-root input, #fx-root [tabindex]").length;
    s.canvas = document.querySelectorAll("canvas").length;
    s.canvasVisible = [...document.querySelectorAll("canvas.xmas-snow")].map((c) => getComputedStyle(c).display);
    const full = rects();
    window.ThemeFx.set("off"); await sleep(250);
    const off = rects();
    window.ThemeFx.set("full"); await sleep(1200);
    let shifts = 0; const L = Math.min(full.length, off.length);
    for (let i = 0; i < L; i++) if (full[i].some((v, k) => Math.abs(v - off[i][k]) > 0.6)) shifts++;
    s.rectCount = [full.length, off.length]; s.shifts = shifts;
    out.screens[t] = s;
  }
  return out;
}
