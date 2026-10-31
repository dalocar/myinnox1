/* Seasonal decoration runtime. Owns the #fx-root overlay (two aria-hidden layers,
   pointer-events none), the Full/Subtle/Off setting (innodigym_fx), and the
   html[data-fx] attribute the CSS keys off. Per-theme art plugs in through
   ThemeFx.register(themeId, { mount(ctx), unmount() }). */
(function () {
  const FC = window.ThemeFxCore;
  const html = document.documentElement;
  const handlers = {};
  const listeners = [];
  const svgCache = {};
  let setting = read();
  let mode = "off";
  let rootEl = null;
  let mounted = null; // theme id whose art is currently mounted
  const reduced = window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;

  function read() {
    try { return FC.normalizeMode(localStorage.getItem(FC.KEY)); } catch { return "full"; }
  }
  function env(theme) {
    const c = navigator.connection;
    return { theme, reducedMotion: !!(reduced && reduced.matches), saveData: !!(c && c.saveData) };
  }
  function theme() { return html.getAttribute("data-theme") || "default"; }

  function ensureRoot() {
    if (rootEl) return rootEl;
    rootEl = document.createElement("div");
    rootEl.id = "fx-root";
    rootEl.setAttribute("aria-hidden", "true");
    rootEl.innerHTML = '<div class="fx-layer fx-back"></div><div class="fx-layer fx-front"></div>';
    document.body.appendChild(rootEl);
    return rootEl;
  }
  function layers() {
    const r = ensureRoot();
    return { back: r.querySelector(".fx-back"), front: r.querySelector(".fx-front"), root: r };
  }

  function unmount() {
    if (!mounted) return;
    const h = handlers[mounted];
    try { if (h && h.unmount) h.unmount(); } catch (e) { console.error("fx unmount", e); }
    if (rootEl) rootEl.querySelectorAll(".fx-layer").forEach((l) => { l.textContent = ""; });
    mounted = null;
  }

  function apply() {
    const id = theme();
    const next = FC.effective(setting, env(id));
    const changed = next !== mode || (next !== "off") !== !!mounted || (mounted && mounted !== id);
    mode = next;
    html.setAttribute("data-fx", mode);
    syncControl();
    if (!changed) return;
    unmount();
    if (mode !== "off") {
      const h = handlers[id];
      mounted = id; // set first so a failing mount still gets unmounted next time
      const ctx = { theme: id, mode, setting, ...layers(), inline };
      if (h && h.mount) {
        try { h.mount(ctx); } catch (e) { console.error("fx mount", e); }
      }
    }
    listeners.forEach((fn) => fn({ setting, mode, theme: id }));
    document.dispatchEvent(new CustomEvent("fxchange", { detail: { setting, mode, theme: id } }));
  }

  /** Fetch an art SVG once and return its markup (inline it to keep CSS variables/animation hooks). */
  function inline(name) {
    if (!svgCache[name]) {
      // ?v=<build> lets the server cache the art forever (see _headers); a new deploy changes the URL.
      var build = window.APP_VERSION && window.APP_VERSION.sha;
      svgCache[name] = fetch("fx/art/" + name + ".svg" + (build ? "?v=" + build : "")).then((r) => (r.ok ? r.text() : ""), () => "");
    }
    return svgCache[name];
  }

  const ThemeFx = {
    get() { return setting; },
    mode() { return mode; },
    set(next) {
      setting = FC.normalizeMode(next);
      try { localStorage.setItem(FC.KEY, setting); } catch { /* applies this session only */ }
      apply();
    },
    register(themeId, h) {
      handlers[themeId] = h;
      // The art script can load after the first apply(): mount it now for the live theme.
      if (mode !== "off" && theme() === themeId && h && h.mount) {
        try { h.mount({ theme: themeId, mode, setting, ...layers(), inline }); } catch (e) { console.error("fx mount", e); }
      }
    },
    onChange(fn) { listeners.push(fn); },
    inline,
  };
  window.ThemeFx = ThemeFx;

  // ----- Profile control -----
  function syncControl() {
    const box = document.getElementById("fx-picker");
    if (!box) return;
    box.querySelectorAll('input[name="fx"]').forEach((r) => { r.checked = r.value === setting; });
    // Always visible so the choice can be made ahead of time; the note says when it applies.
    const note = document.getElementById("fx-note");
    if (note) note.hidden = FC.hasFx(theme());
  }
  const picker = document.getElementById("fx-picker");
  if (picker) picker.addEventListener("change", (e) => {
    if (e.target && e.target.name === "fx") ThemeFx.set(e.target.value);
  });

  // ----- environment -----
  document.addEventListener("themechange", apply);
  if (reduced) {
    if (reduced.addEventListener) reduced.addEventListener("change", apply); else if (reduced.addListener) reduced.addListener(apply);
  }
  window.addEventListener("storage", (e) => {
    if (e.key !== FC.KEY) return;
    setting = read();
    apply();
  });
  // No point animating a hidden tab: pause every decoration animation via CSS.
  document.addEventListener("visibilitychange", () => {
    html.classList.toggle("fx-paused", document.hidden);
  });
  apply();
})();
