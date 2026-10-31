/* Movements screen: browse / search the exercise library (inside the Actions
   tab, next to "My actions"). Pure logic lives in movements-core.js; this file
   is DOM + wiring only. Depends on app.js globals: $, t, LANG, escapeHtml,
   getActionLibrary, openLightbox, loadActions, MUSCLE_GROUPS. */
(function () {
  const C = window.MovementsCore;
  const LEVEL_NAMES = { 1: "Beginner", 2: "Intermediate", 3: "Advanced" };
  const DUMBBELL = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6.5 6.5v11M17.5 6.5v11M3 9v6M21 9v6M6.5 12h11"/></svg>';

  const S = {
    view: "library",
    all: null,          // library actions (non-custom), null until loaded
    loading: false,
    error: null,
    query: "",
    parts: new Set(), types: new Set(), levels: new Set(),
    facets: { parts: [], types: [], levels: [] },
    page: 1,
    filtered: [],
    token: 0,           // guards against out-of-order loads
  };
  let searchTimer = null;

  const partLabel = (id) => {
    const g = MUSCLE_GROUPS.find((m) => m.id === String(id));
    return g ? muscleName(g) : t("Part {n}", { n: id });
  };
  const TYPE_NAMES = { 1: "Stretching", 2: "Warm-up", 3: "Strength" };
  const typeLabel = (v) => (TYPE_NAMES[v] ? t(TYPE_NAMES[v]) : t("Type {n}", { n: v }));
  const levelLabel = (v) => (LEVEL_NAMES[v] ? t(LEVEL_NAMES[v]) : t("Level {n}", { n: v }));

  function setView(view) {
    S.view = view;
    $("actions-library").hidden = view !== "library";
    $("actions-mine").hidden = view !== "mine";
    $("mv-seg-library").setAttribute("aria-pressed", String(view === "library"));
    $("mv-seg-mine").setAttribute("aria-pressed", String(view === "mine"));
  }

  async function load() {
    const token = ++S.token;
    S.loading = true; S.error = null;
    render();
    try {
      const list = await getActionLibrary();
      if (token !== S.token) return;
      S.all = list.filter((a) => !a.custom);
      S.facets = C.facetsFrom(S.all, MUSCLE_GROUPS.map((g) => g.id));
      // drop selections that no longer exist (e.g. after a language reload)
      for (const [set, key] of [[S.parts, "parts"], [S.types, "types"], [S.levels, "levels"]]) {
        for (const v of Array.from(set)) if (!S.facets[key].includes(v)) set.delete(v);
      }
    } catch (e) {
      if (token !== S.token) return;
      S.error = e.message;
    }
    S.loading = false;
    renderFilters();
    render();
  }

  function renderFilters() {
    const box = $("mv-filters");
    box.innerHTML = "";
    const groups = [
      ["parts", t("Body part"), partLabel],
      ["types", t("Type"), typeLabel],
      ["levels", t("Difficulty"), levelLabel],
    ];
    for (const [key, title, labelFn] of groups) {
      const opts = S.facets[key];
      if (!opts.length) continue; // facet not backed by the data: hide it
      const g = document.createElement("div");
      g.className = "mv-filter-group";
      g.dataset.filter = key;
      g.setAttribute("role", "group");
      g.setAttribute("aria-label", title);
      g.innerHTML = `<span class="mv-filter-title">${escapeHtml(title)}</span>`;
      const chips = document.createElement("div");
      chips.className = "mv-chips";
      for (const v of opts) {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "chip";
        b.dataset.value = v;
        b.textContent = labelFn(v);
        b.setAttribute("aria-pressed", String(S[key].has(v)));
        b.addEventListener("click", () => {
          if (S[key].has(v)) S[key].delete(v); else S[key].add(v);
          b.setAttribute("aria-pressed", String(S[key].has(v)));
          S.page = 1;
          render();
        });
        chips.appendChild(b);
      }
      g.appendChild(chips);
      box.appendChild(g);
    }
  }

  function skeleton() {
    return `<ul class="mv-grid" aria-hidden="true">${'<li><div class="mv-card mv-skel"></div></li>'.repeat(8)}</ul>`;
  }

  function cardEl(a) {
    const li = document.createElement("li");
    const b = document.createElement("button");
    b.type = "button";
    b.className = "mv-card";
    b.dataset.id = a.id;
    b.setAttribute("aria-label", a.name || "");
    b.innerHTML = (a.picUrl
      ? `<img src="${escapeHtml(a.picUrl)}" alt="" loading="lazy" decoding="async">`
      : `<span class="mv-ph">${DUMBBELL}</span>`) +
      `<span class="mv-name">${escapeHtml(a.name)}</span>`;
    const img = b.querySelector("img");
    if (img) img.addEventListener("error", () => {
      img.replaceWith(Object.assign(document.createElement("span"), { className: "mv-ph", innerHTML: DUMBBELL }));
    });
    b.addEventListener("click", () => openLightbox(a.picUrl, a.videoUrl, a.name));
    li.appendChild(b);
    return li;
  }

  function appendCards(ul, from, to) {
    for (const a of S.filtered.slice(from, to)) ul.appendChild(cardEl(a));
  }

  function render() {
    if (!$("mv-results")) return;
    const res = $("mv-results"), count = $("mv-count");
    const activeFilters = C.countActive(S);
    const dirty = !!S.query.trim() || activeFilters > 0;
    const reset = $("mv-reset");
    reset.hidden = !dirty;
    reset.textContent = activeFilters ? `${t("Reset")} (${activeFilters})` : t("Reset");

    if (S.loading || (!S.all && !S.error)) {
      count.textContent = "";
      res.innerHTML = `<p class="meta">${escapeHtml(t("Loading…"))}</p>` + skeleton();
      return;
    }
    if (S.error) {
      count.textContent = "";
      res.innerHTML = `<p class="server-error">${escapeHtml(t("Failed to load: {msg}", { msg: S.error }))} <button type="button" id="mv-retry" class="secondary">${escapeHtml(t("Retry"))}</button></p>`;
      $("mv-retry").onclick = () => { S.all = null; load(); };
      return;
    }
    S.filtered = C.filterMovements(S.all, S);
    const p = C.paginate(S.filtered, S.page);
    count.textContent = I18N.plural(p.total, "movement");
    if (!p.total && !S.all.length) {
      res.innerHTML = `<div class="empty-state">${DUMBBELL.replace("<svg", '<svg class="mv-empty-icon"')}<p>${escapeHtml(t("The movement library is empty."))}</p></div>`;
      return;
    }
    if (!p.total) {
      res.innerHTML = `<div class="empty-state">${DUMBBELL.replace("<svg", '<svg class="mv-empty-icon"')}<p>${escapeHtml(t("No movements match your filters"))}</p>${dirty ? `<button type="button" id="mv-empty-reset" class="secondary">${escapeHtml(t("Reset"))}</button>` : ""}</div>`;
      const r = $("mv-empty-reset");
      if (r) r.onclick = resetAll;
      return;
    }
    res.innerHTML = "";
    const ul = document.createElement("ul");
    ul.className = "mv-grid";
    res.appendChild(ul);
    appendCards(ul, 0, p.items.length);
    if (p.hasMore) addMore(ul, p);
  }

  function addMore(ul, p) {
    const more = document.createElement("button");
    more.type = "button";
    more.id = "mv-more";
    more.className = "secondary mv-more";
    more.textContent = t("Show more ({n} left)", { n: p.total - p.shown });
    more.onclick = () => {
      const before = ul.children.length;
      S.page += 1;
      const np = C.paginate(S.filtered, S.page);
      appendCards(ul, before, np.items.length);
      more.remove();
      if (np.hasMore) addMore(ul, np);
      const first = ul.children[before] && ul.children[before].querySelector("button");
      if (first) first.focus({ preventScroll: true });
      $("mv-count").textContent = I18N.plural(np.total, "movement");
    };
    $("mv-results").appendChild(more);
  }

  function resetAll() {
    S.query = ""; S.parts.clear(); S.types.clear(); S.levels.clear(); S.page = 1;
    $("mv-search").value = "";
    document.querySelectorAll("#mv-filters .chip").forEach((c) => c.setAttribute("aria-pressed", "false"));
    render();
  }

  $("mv-search").addEventListener("input", () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => { S.query = $("mv-search").value; S.page = 1; render(); }, 150);
  });
  $("mv-reset").addEventListener("click", resetAll);
  document.querySelectorAll("#mv-seg [data-view]").forEach((b) =>
    b.addEventListener("click", () => {
      setView(b.dataset.view);
      if (b.dataset.view === "mine") loadActions(); else if (!S.all) load();
    }));

  function show() {
    setView(S.view);
    if (S.view === "mine") loadActions();
    else if (!S.all && !S.loading) load();
    else render();
  }

  // Language changed: names come back translated, so drop the data and reload;
  // search text and selected filters are kept.
  function relang() {
    S.all = null;
    setView(S.view);
    if (S.view === "mine") { loadActions(); return; }
    load();
  }

  window.MovementsUI = { show, relang, _state: S };
})();
