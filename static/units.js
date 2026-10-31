/* Units - shared current-unit state for every screen (kg / lb). The unit is the
   account's profile `unit` (0 Metric, 1 Imperial); nothing is persisted locally.
   Pure conversions live in units-core.js. Loaded before app.js. */
(function () {
  const C = window.UnitsCore;
  let unit = C.METRIC;
  let loaded = false;
  const listeners = [];

  const get = () => unit;
  const set = (u) => {
    const next = C.normalizeUnit(u);
    loaded = true;
    if (next === unit) return;
    unit = next;
    listeners.slice().forEach((fn) => { try { fn(unit); } catch (e) { console.error(e); } });
  };
  // Fetch the profile once (after login / on start) so every screen knows the unit.
  // `apiFn` is app.js's api(). Failures keep the current (Metric) default.
  async function load(apiFn) {
    try {
      const res = await apiFn("/app/getInfo");
      set(C.unitFromProfile(res && res.data));
    } catch { /* keep default */ }
  }

  // Static labels that embed the kg symbol: <span data-unit-src="English source string">.
  // Re-derived from the source string every time (so Imperial -> Metric restores "kg"),
  // and again after a language switch (I18N.applyStatic rewrites static text first).
  function relabel() {
    document.querySelectorAll("[data-unit-src]").forEach((el) => {
      const txt = C.unitText(window.t(el.dataset.unitSrc), unit);
      if (el.firstChild && el.firstChild.nodeType === 3) el.firstChild.nodeValue = txt; // keep the node I18N tracks
      else el.textContent = txt;
    });
  }
  listeners.push(relabel);
  if (window.I18N) window.I18N.onChange.push(relabel);

  window.Units = {
    get, set, load, relabel, isLoaded: () => loaded,
    onChange: (fn) => listeners.push(fn),
    isImperial: () => C.isImperial(unit),
    label: () => C.label(unit),
    text: (str) => C.unitText(str, unit),            // relabel a translated "…kg…" string
    fromTenths: (tn) => C.fromTenths(tn, unit),
    toTenths: (v) => C.toTenths(v, unit),
    fmtTenths: (tn) => C.fmtTenths(tn, unit),
    fmtWeight: (tn) => C.fmtWeight(tn, unit),
  };
})();
