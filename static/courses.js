/* Courses screen: browse / search the official courses (inside the Programs tab,
   next to "My programs"). Logic is in courses-core.js; this file is DOM only.
   Depends on app.js globals: $, t, LANG, api, escapeHtml, openLightbox,
   loadPrograms, toast. */
(function () {
  const C = window.CoursesCore;
  const DUMBBELL = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6.5 6.5v11M17.5 6.5v11M3 9v6M21 9v6M6.5 12h11"/></svg>';

  const S = {
    view: "courses", showSeq: 0,
    all: null, loading: false, error: null,
    query: "", topics: new Set(), levels: new Set(), accessories: new Set(), maxDuration: null,
    facets: { topics: [], levels: [], durations: [], accessories: [] },
    page: 1, filtered: [], token: 0,
    detail: new Map(), // id -> course/detail data (per language)
    panelOpen: false,
  };
  let searchTimer = null;
  let modalOpener = null;

  const label = (map, id) => (map[id] ? t(map[id]) : String(id));
  const minLabel = (n) => t("{n} min", { n });

  function setView(view) {
    S.view = view;
    $("programs-courses").hidden = view !== "courses";
    $("programs-mine").hidden = view !== "mine";
    $("pg-seg-courses").setAttribute("aria-pressed", String(view === "courses"));
    $("pg-seg-mine").setAttribute("aria-pressed", String(view === "mine"));
  }

  async function load() {
    const token = ++S.token;
    S.loading = true; S.error = null;
    render();
    try {
      const res = await api("/course/list");
      if (token !== S.token) return;
      S.all = (res.data || []).filter((c) => !c.custom);
      S.facets = C.facetsFrom(S.all);
      for (const [set, key] of [[S.topics, "topics"], [S.levels, "levels"], [S.accessories, "accessories"]]) {
        for (const v of Array.from(set)) if (!S.facets[key].includes(v)) set.delete(v);
      }
      if (S.maxDuration !== null && !S.facets.durations.includes(S.maxDuration)) S.maxDuration = null;
    } catch (e) {
      if (token !== S.token) return;
      S.error = e.message;
    }
    S.loading = false;
    renderFilters();
    render();
  }

  function chip(text, pressed, onClick, value) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "chip";
    b.textContent = text;
    if (value !== undefined) b.dataset.value = value;
    b.setAttribute("aria-pressed", String(pressed));
    b.addEventListener("click", onClick);
    return b;
  }

  function group(key, title, opts, labelFn, selected, toggle) {
    const g = document.createElement("div");
    g.className = "mv-filter-group";
    g.dataset.filter = key;
    g.setAttribute("role", "group");
    g.setAttribute("aria-label", title);
    g.innerHTML = `<span class="mv-filter-title">${escapeHtml(title)}</span>`;
    const box = document.createElement("div");
    box.className = "mv-chips";
    for (const v of opts) {
      const b = chip(labelFn(v), selected(v), () => {
        toggle(v);
        S.page = 1;
        syncPressed();
        render();
      }, v);
      box.appendChild(b);
    }
    g.appendChild(box);
    return g;
  }

  // Update aria-pressed on all chips from state (single-select duration needs this).
  function syncPressed() {
    const sel = { topics: (v) => S.topics.has(v), levels: (v) => S.levels.has(v),
      accessories: (v) => S.accessories.has(v), durations: (v) => S.maxDuration === Number(v) };
    document.querySelectorAll("#programs-courses [data-filter]").forEach((g) => {
      g.querySelectorAll(".chip").forEach((c) => c.setAttribute("aria-pressed", String(sel[g.dataset.filter](c.dataset.value))));
    });
  }

  function renderFilters() {
    const tb = $("cs-topics");
    tb.innerHTML = "";
    tb.dataset.filter = "topics";
    tb.setAttribute("aria-label", t("Topic"));
    for (const v of S.facets.topics) {
      tb.appendChild(chip(label(C.TOPICS, v), S.topics.has(v), () => {
        if (S.topics.has(v)) S.topics.delete(v); else S.topics.add(v);
        S.page = 1; syncPressed(); render();
      }, v));
    }
    const panel = $("cs-panel");
    panel.innerHTML = "";
    const toggleSet = (set) => (v) => { if (set.has(v)) set.delete(v); else set.add(v); };
    if (S.facets.levels.length) panel.appendChild(group("levels", t("Difficulty"), S.facets.levels, (v) => label(C.LEVELS, v), (v) => S.levels.has(v), toggleSet(S.levels)));
    if (S.facets.durations.length) panel.appendChild(group("durations", t("Duration"), S.facets.durations.map(String), (v) => t("Up to {n} min", { n: v }),
      (v) => S.maxDuration === Number(v), (v) => { S.maxDuration = S.maxDuration === Number(v) ? null : Number(v); }));
    if (S.facets.accessories.length) panel.appendChild(group("accessories", t("Accessory"), S.facets.accessories, (v) => label(C.ACCESSORIES, v), (v) => S.accessories.has(v), toggleSet(S.accessories)));
    $("cs-filters-btn").hidden = !panel.children.length;
    setPanel(S.panelOpen && panel.children.length > 0);
  }

  function setPanel(open) {
    S.panelOpen = open;
    $("cs-panel").hidden = !open;
    $("cs-filters-btn").setAttribute("aria-expanded", String(open));
  }

  function pill(text) { return `<span class="cs-pill">${escapeHtml(text)}</span>`; }
  function pills(c) {
    return (c.duration ? pill(minLabel(c.duration)) : "") + (C.LEVELS[c.level] ? pill(t(C.LEVELS[c.level])) : "");
  }

  function cardEl(c) {
    const li = document.createElement("li");
    const b = document.createElement("button");
    b.type = "button";
    b.className = "cs-card";
    b.dataset.id = c.id;
    b.setAttribute("aria-label", c.name || "");
    b.innerHTML = `<span class="cs-img">${c.smallImg ? `<img src="${escapeHtml(c.smallImg)}" alt="" loading="lazy" decoding="async">` : `<span class="mv-ph">${DUMBBELL}</span>`}</span>` +
      `<span class="cs-body"><span class="cs-name">${escapeHtml(c.name)}</span><span class="cs-pills">${pills(c)}</span></span>`;
    const img = b.querySelector("img");
    if (img) img.addEventListener("error", () => {
      img.replaceWith(Object.assign(document.createElement("span"), { className: "mv-ph", innerHTML: DUMBBELL }));
    });
    b.addEventListener("click", () => openDetail(c, b));
    li.appendChild(b);
    return li;
  }

  const activeState = () => ({ topics: S.topics, levels: S.levels, maxDuration: S.maxDuration, accessories: S.accessories });

  function render() {
    const res = $("cs-results"), count = $("cs-count");
    const n = C.countActive(activeState());
    const dirty = !!S.query.trim() || n > 0;
    const reset = $("cs-reset");
    reset.hidden = !dirty;
    reset.textContent = n ? `${t("Reset")} (${n})` : t("Reset");
    const pn = C.countPanelActive(activeState());
    const badge = $("cs-badge");
    badge.hidden = !pn;
    badge.textContent = pn || "";

    if (S.loading || (!S.all && !S.error)) {
      count.textContent = "";
      res.innerHTML = `<p class="meta">${escapeHtml(t("Loading…"))}</p><ul class="cs-grid" aria-hidden="true">${'<li><div class="cs-card mv-skel cs-skel"></div></li>'.repeat(6)}</ul>`;
      return;
    }
    if (S.error) {
      count.textContent = "";
      res.innerHTML = `<p class="server-error">${escapeHtml(t("Failed to load: {msg}", { msg: S.error }))} <button type="button" id="cs-retry" class="secondary">${escapeHtml(t("Retry"))}</button></p>`;
      $("cs-retry").onclick = () => { S.all = null; load(); };
      return;
    }
    S.filtered = C.filterCourses(S.all, S);
    const p = C.paginate(S.filtered, S.page);
    count.textContent = I18N.plural(p.total, "course");
    if (!p.total) {
      res.innerHTML = `<div class="empty-state">${DUMBBELL.replace("<svg", '<svg class="mv-empty-icon"')}<p>${escapeHtml(t("No courses match your filters"))}</p>${dirty ? `<button type="button" id="cs-empty-reset" class="secondary">${escapeHtml(t("Reset"))}</button>` : ""}</div>`;
      const r = $("cs-empty-reset");
      if (r) r.onclick = resetAll;
      return;
    }
    res.innerHTML = "";
    const ul = document.createElement("ul");
    ul.className = "cs-grid";
    res.appendChild(ul);
    for (const c of p.items) ul.appendChild(cardEl(c));
    if (p.hasMore) addMore(ul, p);
  }

  function addMore(ul, p) {
    const more = document.createElement("button");
    more.type = "button";
    more.id = "cs-more";
    more.className = "secondary mv-more";
    more.textContent = t("Show more ({n} left)", { n: p.total - p.shown });
    more.onclick = () => {
      const before = ul.children.length;
      S.page += 1;
      const np = C.paginate(S.filtered, S.page);
      for (const c of np.items.slice(before)) ul.appendChild(cardEl(c));
      more.remove();
      if (np.hasMore) addMore(ul, np);
      const first = ul.children[before] && ul.children[before].querySelector("button");
      if (first) first.focus({ preventScroll: true });
    };
    $("cs-results").appendChild(more);
  }

  function resetAll() {
    S.query = ""; S.topics.clear(); S.levels.clear(); S.accessories.clear(); S.maxDuration = null; S.page = 1;
    $("cs-search").value = "";
    syncPressed();
    render();
  }

  // ----- read-only detail modal -----
  // opts.custom: a user program (always refetched: it may have been edited since last view)
  async function openDetail(c, opener, opts = {}) {
    modalOpener = opener || document.activeElement;
    $("course-modal-title").textContent = c.name || "";
    const body = $("course-modal-body");
    const hero = c.smallImg ? `<img class="cs-hero" src="${escapeHtml(c.smallImg)}" alt="">` : "";
    const head = `${hero}<div class="cs-pills">${pills(c)}</div>`;
    body.innerHTML = head + `<p class="meta">${escapeHtml(t("Loading…"))}</p>`;
    $("course-modal-backdrop").hidden = false;
    $("course-modal-close-btn").focus();
    const myId = c.id;
    try {
      let d = opts.custom ? null : S.detail.get(myId);
      if (!d) {
        const res = await api(`/course/${opts.custom ? "custom/" : ""}detail?id=${encodeURIComponent(myId)}`);
        d = res.data || {};
        if (!opts.custom) S.detail.set(myId, d);
      }
      if ($("course-modal-backdrop").hidden || $("course-modal-title").textContent !== (c.name || "")) return;
      const steps = C.stepsOf(d);
      const desc = (d.description || "").trim();
      let html = d.detailsImg && !c.smallImg ? `<img class="cs-hero" src="${escapeHtml(d.detailsImg)}" alt="">` : hero;
      html += `<div class="cs-pills">${pills(c)}</div>`;
      if (desc) html += `<p class="cs-desc">${escapeHtml(desc)}</p>`;
      html += `<h4 class="no-margin">${escapeHtml(t("Exercises"))}</h4>`;
      if (!steps.length) html += `<p class="empty-state">${escapeHtml(t("No exercises listed."))}</p>`;
      else html += `<ul class="cs-steps">${steps.map((s, i) => `<li class="cs-step">${
        s.picUrl ? `<img src="${escapeHtml(s.picUrl)}" alt="" loading="lazy" data-i="${i}">` : `<span class="cs-step-ph">${DUMBBELL}</span>`
      }<div><div>${escapeHtml(s.name)}</div>${s.stage !== "main" ? `<div class="meta">${escapeHtml(t(s.stage === "warmup" ? "Warm up" : "Stretch"))}</div>` : ""}${s.reps != null || s.sets != null ? `<div class="meta">${escapeHtml(t("{sets} × {reps} reps", { sets: s.sets ?? 1, reps: s.reps ?? "?" }))}</div>` : ""}</div></li>`).join("")}</ul>`;
      body.innerHTML = html;
      body.querySelectorAll("img[data-i]").forEach((im) => im.addEventListener("click", () => {
        const s = steps[Number(im.dataset.i)];
        openLightbox(s.picUrl, s.videoUrl, s.name);
      }));
    } catch (e) {
      body.innerHTML = head + `<p class="server-error">${escapeHtml(t("Failed to load: {msg}", { msg: e.message }))} <button type="button" class="secondary" id="cs-detail-retry">${escapeHtml(t("Retry"))}</button></p>`;
      $("cs-detail-retry").onclick = () => openDetail(c, modalOpener, opts);
    }
  }
  function closeDetail() {
    if ($("course-modal-backdrop").hidden) return;
    $("course-modal-backdrop").hidden = true;
    if (modalOpener && modalOpener.isConnected && modalOpener.focus) modalOpener.focus();
    modalOpener = null;
  }
  $("course-modal-close-btn").addEventListener("click", closeDetail);
  $("course-modal-backdrop").addEventListener("click", (e) => { if (e.target.id === "course-modal-backdrop") closeDetail(); });
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if (!$("course-modal-backdrop").hidden && $("lightbox-backdrop").hidden) closeDetail();
    else if (S.panelOpen && $("course-modal-backdrop").hidden) { setPanel(false); $("cs-filters-btn").focus(); }
  });

  // ----- wiring -----
  $("cs-search").addEventListener("input", () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => { S.query = $("cs-search").value; S.page = 1; render(); }, 150);
  });
  $("cs-reset").addEventListener("click", resetAll);
  $("cs-filters-btn").addEventListener("click", () => { if ($("cs-panel").children.length) setPanel(!S.panelOpen); });
  document.querySelectorAll("#pg-seg [data-view]").forEach((b) => b.addEventListener("click", () => {
    S.showSeq++; // a manual choice cancels any pending default
    setView(b.dataset.view);
    showView();
  }));

  function showView() {
    if (S.view === "mine") {
      // keep an open editor as-is; otherwise show the (refreshed) list like before
      if ($("editor").hidden) { $("list-view").hidden = false; loadPrograms(); }
    } else if (!S.all && !S.loading) load();
    else render();
  }

  // Entering the Programs tab: land on "My programs" when the user has any custom
  // program, otherwise on Courses. A manual toggle while the check is in flight wins.
  async function show() {
    const seq = ++S.showSeq;
    // show the current view immediately; correct it when the answer arrives
    if (S.view === "mine") { $("editor").hidden = true; $("list-view").hidden = false; }
    setView(S.view);
    let has = null;
    try { has = ((await api("/course/custom/list")).data || []).length > 0; } catch { /* keep current view */ }
    if (seq !== S.showSeq) return;
    if (has !== null) S.view = has ? "mine" : "courses";
    if (S.view === "mine") { $("editor").hidden = true; $("list-view").hidden = false; }
    setView(S.view);
    showView();
  }

  // Language changed: names come back translated, so drop caches and refetch;
  // search text and selected filters are kept.
  function relang() {
    closeDetail();
    S.all = null;
    S.detail.clear();
    setView(S.view);
    load();
  }

  window.CoursesUI = { show, relang, view: () => S.view, openCustomDetail: (p, opener) => openDetail(p, opener, { custom: true }), _state: S };

  // app.js loads first and may already have opened the Programs tab on page load
  // (stored session); that call found no CoursesUI, so load the panel now.
  if (!$("main-section").hidden && activeTab === "programs") show();
})();
