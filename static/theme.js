/* Theme runtime: preference (auto|default|dark|ember|tide|graphite|fit-xmas|hallowfit) in localStorage,
   resolved id on <html data-theme>, color-scheme, meta theme-color, Profile picker.
   Client only: no API call. The first paint is handled by the boot script in index.html. */
(function () {
  const TC = window.ThemeCore;
  const root = document.documentElement;
  const mq = window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null;
  const listeners = [];
  let pref = read();
  let resolved = root.getAttribute("data-theme") || "default";

  function read() {
    try { return TC.normalizePref(localStorage.getItem(TC.KEY)); } catch { return "auto"; }
  }

  function apply() {
    const id = TC.resolve(pref, !!(mq && mq.matches));
    resolved = id;
    root.classList.add("theme-switching");
    root.setAttribute("data-theme", id);
    root.style.colorScheme = TC.schemeOf(id);
    // The CSS holds the colour (--meta-theme-color); the map is only the fallback.
    const css = getComputedStyle(root).getPropertyValue("--meta-theme-color").trim();
    const m = document.querySelector('meta[name="theme-color"]');
    if (m) m.setAttribute("content", css || TC.META[id]);
    clearTimeout(apply._t);
    apply._t = setTimeout(() => root.classList.remove("theme-switching"), 220);
    syncPicker();
    listeners.forEach((fn) => fn({ pref, theme: id }));
    document.dispatchEvent(new CustomEvent("themechange", { detail: { pref, theme: id } }));
  }

  const Theme = {
    get() { return pref; },
    resolved() { return resolved; },
    list() { return TC.PREFS.slice(); },
    set(next) {
      pref = TC.normalizePref(next);
      try { localStorage.setItem(TC.KEY, pref); } catch { /* storage unavailable: still applies this session */ }
      apply();
    },
    onChange(fn) { listeners.push(fn); },
  };
  window.Theme = Theme;

  // OS flips light/dark: only matters while the preference is Auto.
  if (mq) {
    const onOs = () => { if (pref === "auto") apply(); };
    if (mq.addEventListener) mq.addEventListener("change", onOs); else if (mq.addListener) mq.addListener(onOs);
  }
  // Another tab changed the preference.
  window.addEventListener("storage", (e) => {
    if (e.key !== TC.KEY) return;
    pref = read();
    apply();
  });

  // ----- Profile picker -----
  function syncPicker() {
    document.querySelectorAll('#theme-picker input[name="theme"]').forEach((r) => {
      r.checked = r.value === pref;
      const card = r.closest(".theme-card");
      if (card) card.classList.toggle("checked", r.checked);
    });
  }
  function wirePicker() {
    const picker = document.getElementById("theme-picker");
    if (!picker) return;
    picker.addEventListener("change", (e) => {
      const r = e.target;
      if (!r || r.name !== "theme") return;
      Theme.set(r.value);
      const name = r.closest(".theme-card").querySelector(".theme-name").textContent.trim();
      const live = document.getElementById("theme-live");
      if (live) live.textContent = window.t("Theme: {name}", { name });
    });
    syncPicker();
  }
  wirePicker();
  // Keep the in-sync state after the language switch re-translates labels (nothing to do) and
  // make sure the radios reflect the stored value when the Profile tab opens.
  document.addEventListener("click", (e) => {
    if (e.target.closest && e.target.closest('[data-tab="profile"]')) syncPicker();
  });
})();
