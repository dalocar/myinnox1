// QA helper (evaluate_script body): computed-colour contrast scan of every visible text node on the
// current screen (background = nearest opaque ancestor, alpha composited). Returns the worst offenders.
async () => {
  const parse = (c) => { const m = c.match(/rgba?\(([^)]+)\)/); if (!m) return null; const p = m[1].split(/[ ,\/]+/).filter(Boolean).map(Number); return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 }; };
  const lum = (c) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b); };
  const over = (top, bot) => ({ r: top.r * top.a + bot.r * (1 - top.a), g: top.g * top.a + bot.g * (1 - top.a), b: top.b * top.a + bot.b * (1 - top.a), a: 1 });
  const bgOf = (el) => { const stack = []; for (let e = el; e; e = e.parentElement) { const c = parse(getComputedStyle(e).backgroundColor); if (c && c.a > 0) { stack.push(c); if (c.a >= 1) break; } } let base = { r: 255, g: 255, b: 255, a: 1 }; const root = parse(getComputedStyle(document.body).backgroundColor); if (root && root.a >= 1) base = root; for (let i = stack.length - 1; i >= 0; i--) base = over(stack[i], base); return base; };
  const scan = () => {
  const out = [], seen = new Set();
  const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  while (w.nextNode()) {
    const n = w.currentNode; if (!n.textContent.trim()) continue; const el = n.parentElement;
    if (!el || el.closest("#fx-root,script,style,[hidden],.sr-only") || !el.offsetParent && getComputedStyle(el).position !== "fixed") continue;
    const cs = getComputedStyle(el); if (cs.visibility === "hidden" || +cs.opacity === 0) continue;
    const r = el.getBoundingClientRect(); if (!r.width || !r.height) continue;
    const fg = parse(cs.color), bg = bgOf(el); if (!fg) continue;
    const f = over({ ...fg, a: fg.a * (+cs.opacity) }, bg);
    const [a, b] = [lum(f), lum(bg)].sort((x, y) => y - x); const ratio = (a + 0.05) / (b + 0.05);
    const size = parseFloat(cs.fontSize), bold = +cs.fontWeight >= 700; const large = size >= 24 || (size >= 18.66 && bold);
    const need = large ? 3 : 4.5;
    if (ratio < need) { const k = (el.className || el.tagName) + "|" + n.textContent.trim().slice(0, 24); if (!seen.has(k)) { seen.add(k); out.push({ t: n.textContent.trim().slice(0, 30), cls: String(el.className).slice(0, 40), ratio: +ratio.toFixed(2), need, fg: cs.color, bg: `rgb(${bg.r | 0},${bg.g | 0},${bg.b | 0})`, size }); } }
  }
  return { theme: document.documentElement.dataset.theme, tab: document.querySelector(".tab-panel:not([hidden])")?.id, fails: out.sort((x, y) => x.ratio - y.ratio).slice(0, 15), n: out.length };
  };
  const res = {};
  for (const t of [...document.querySelectorAll('#tabs .tab-btn')].map((b) => b.dataset.tab)) { document.querySelector('#tabs .tab-btn[data-tab="' + t + '"]').click(); await new Promise((r) => setTimeout(r, 900)); res[t] = scan(); }
  return res;
}
