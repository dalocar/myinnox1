// QA helper (evaluate_script body): after a navigation, reads LCP, CLS, long-task based TBT (approx: sum of
// (duration-50) of long tasks after FCP) and fx state from buffered PerformanceObservers.
async () => {
  await new Promise((r) => setTimeout(r, 4500));
  const get = (type) => new Promise((res) => { const out = []; try { new PerformanceObserver((l) => { out.push(...l.getEntries()); }).observe({ type, buffered: true }); } catch (e) { return res(out); } setTimeout(() => res(out), 300); });
  const [lcp, ls, lt] = await Promise.all([get("largest-contentful-paint"), get("layout-shift"), get("longtask")]);
  const fcp = (performance.getEntriesByName("first-contentful-paint")[0] || {}).startTime || 0;
  const tbt = lt.filter((e) => e.startTime + e.duration > fcp).reduce((s, e) => s + Math.max(0, e.duration - 50), 0);
  const cls = ls.filter((e) => !e.hadRecentInput).reduce((s, e) => s + e.value, 0);
  const l = lcp[lcp.length - 1];
  const h = document.documentElement;
  return { theme: h.dataset.theme, fx: h.dataset.fx, fcp: Math.round(fcp), lcp: l ? Math.round(l.startTime) : null, lcpEl: l && l.element ? (l.element.tagName + "." + String(l.element.className).slice(0, 20)) : null, cls: +cls.toFixed(4), tbt: Math.round(tbt), longTasks: lt.length, canvases: document.querySelectorAll("canvas").length };
}
