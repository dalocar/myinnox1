/* Exercises list (History tab sub-view, Phase 2 of issue #9): every exercise found in the local Exercise Progress index,
   one row per actionId, with search and sort. Pure logic is ExerciseProgressCore.listExercises; the cache, the sync (pacer,
   cooldown, Web Lock) and the progress screen belong to exercise-progress.js (ExerciseProgressUI) and are reused as they
   are. Depends on app.js globals: $, t, LANG, Units. Public API: window.ExerciseListUI = { open({onBack}), close(), restore() }.
   Spanish strings are added to I18N.es below; the other packs hold their own entries. */
(function () {
  const Core = window.ExerciseProgressCore, EP = window.ExerciseProgressUI;
  if (!Core || !EP) return;
  const AC = window.ActivityCore, WM = window.WeightModeCore;
  if (window.I18N && I18N.es) Object.assign(I18N.es, {
    "Exercises": "Ejercicios",
    "Search every exercise and open its progress": "Busca cualquier ejercicio y abre su progreso",
    "Search exercises": "Buscar ejercicios",
    "Sort by": "Ordenar por",
    "Most recent": "Más reciente",
    "Most sessions": "Más sesiones",
    "Name A–Z": "Nombre A–Z",
    "{n} exercise": "{n} ejercicio",
    "{n} exercises": "{n} ejercicios",
    "{n} of {m} exercises": "{n} de {m} ejercicios",
    "No exercises match “{q}”": "Ningún ejercicio coincide con «{q}»",
    "Clear search": "Borrar búsqueda",
    "No exercise history yet": "Aún no hay historial de ejercicios",
    "Complete a workout and its exercises will show up here.": "Completa un entrenamiento y sus ejercicios aparecerán aquí.",
    "Last session {date}": "Última sesión {date}",
    "Best {value}": "Mejor {value}",
    "Up {v} since first": "+{v} desde el primero",
    "Down {v} since first": "−{v} desde el primero",
    "No change since first": "Sin cambios desde el primero",
    "One session so far": "Una sola sesión por ahora",
    "Exercise list": "Lista de ejercicios",
    "Progress for {name}": "Progreso de {name}",
  });

  const SORT_LABEL = { recent: "Most recent", sessions: "Most sessions", name: "Name A–Z" };
  const DUMBBELL = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6.5 6.5v11M17.5 6.5v11M3 9v6M21 9v6M6.5 12h11"/></svg>';
  const CHEV = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg>';
  const ARROW = {
    up: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 19V5M5 12l7-7 7 7"/></svg>',
    down: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 5v14M5 12l7 7 7-7"/></svg>',
    same: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" aria-hidden="true"><path d="M5 12h14"/></svg>',
  };

  // L survives the trip to Exercise Progress and back (search text, sort, scroll, last row); open() starts fresh.
  const L = { open: false, query: "", sort: Core.DEFAULT_SORT, onBack: null, scrollY: 0, lastId: "", focusQ: false, renderTimer: 0, searchTimer: 0, shown: false };
  let nodes = null;
  // A status change (error, paused, done...) reaches us as data(true): repaint the banner with the rows.
  const listener = { data: (now) => { scheduleRows(now); if (now) paintBanner(); }, sync: () => paintBanner() };

  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const unit = () => (window.Units ? Units.get() : 0);
  const unitLabel = () => (window.Units ? Units.label() : "kg");
  const fmtW = (tenths) => (AC && AC.fmtWeight ? AC.fmtWeight(tenths, unit()) : String(Math.round(tenths) / 10));
  const fmtN = (n) => String(Math.round(Number(n) || 0));
  const safeUrl = (u) => (typeof u === "string" && /^https?:\/\//i.test(u.trim()) ? u.trim() : "");
  function fmtDate(iso) {
    try { const d = Core.parseDate(iso); return new Intl.DateTimeFormat(LANG(), { dateStyle: "medium", timeZone: "UTC" }).format(new Date(Date.UTC(d.y, d.m - 1, d.d))); } catch (e) { return iso; }
  }
  // A value in the units of the row: kg/lb for weight, "n reps", "n s".
  function fmtValue(kind, v) {
    if (kind === "weight") return `${fmtW(v)} ${unitLabel()}`;
    if (kind === "seconds") return `${fmtN(v)} s`;
    return t("{n} reps", { n: fmtN(v) });
  }
  function trendText(r) {
    if (r.trend === "single") return t("One session so far");
    if (r.trend === "same") return t("No change since first");
    if (r.trend === "up" || r.trend === "down") return t(r.trend === "up" ? "Up {v} since first" : "Down {v} since first", { v: fmtValue(r.kind, Math.abs(r.change.abs)) });
    return "";
  }

  // ---------- model ----------
  function model() {
    const v = EP.view();
    const res = Core.listExercises(v.index, { query: L.query, sort: L.sort, lang: LANG(), names: v.nameFor, modeFor: v.modeFor });
    return { v, rows: res.rows, total: res.total };
  }

  // ---------- rendering ----------
  function imgBox(url) {
    const box = el("span", "exl-pic");
    box.setAttribute("aria-hidden", "true");
    const fallback = () => { box.textContent = ""; box.classList.add("is-fallback"); box.insertAdjacentHTML("beforeend", DUMBBELL); };
    const u = safeUrl(url);
    if (!u) { fallback(); return box; }
    const img = document.createElement("img");
    img.alt = ""; img.loading = "lazy"; img.decoding = "async"; img.referrerPolicy = "no-referrer";
    img.addEventListener("error", fallback, { once: true });
    img.src = u;
    box.appendChild(img);
    return box;
  }

  function rowEl(r, v) {
    const li = el("li", "exl-item");
    const b = el("button", "exl-row");
    b.type = "button"; b.dataset.id = r.actionId;
    const body = el("span", "exl-body");
    const head = el("span", "exl-head");
    head.appendChild(el("span", "exl-name", r.name || "—"));
    const wm = WM && WM.modeFor(v.modeFor(r.actionId) ? v.modeFor(r.actionId).sideNum : null);
    if (wm && wm.label) head.appendChild(el("span", "wm-badge exl-badge wm-" + wm.key, t(wm.label)));
    const sessions = t(r.sessions === 1 ? "{n} session" : "{n} sessions", { n: r.sessions });
    const last = t("Last session {date}", { date: fmtDate(r.lastDate) });
    const best = r.best ? t("Best {value}", { value: fmtValue(r.kind, r.best.value) }) : "";
    const meta = el("span", "exl-meta");
    [last, sessions, best].filter(Boolean).forEach((txt, i) => { if (i) meta.append(el("span", "exl-dot", "·")); meta.append(el("span", null, txt)); });
    body.append(head, meta);
    const tt = trendText(r);
    if (tt) {
      const tr = el("span", "exl-trend is-" + r.trend);
      if (ARROW[r.trend]) tr.insertAdjacentHTML("beforeend", ARROW[r.trend]);
      tr.appendChild(el("span", null, tt));
      body.appendChild(tr);
    }
    b.append(imgBox(v.picFor(r.actionId)), body);
    b.insertAdjacentHTML("beforeend", CHEV.replace("<svg", '<svg class="exl-chev"'));
    b.setAttribute("aria-label", [t("View progress of {name}", { name: r.name }), wm && wm.label ? t(wm.label) : "", last, sessions, best, tt].filter(Boolean).join(", "));
    li.appendChild(b);
    return li;
  }

  function countText(m) {
    if (!m.total) return "";
    return L.query.trim() ? t("{n} of {m} exercises", { n: m.rows.length, m: m.total }) : t(m.total === 1 ? "{n} exercise" : "{n} exercises", { n: m.total });
  }

  function renderRows() {
    if (!nodes || !L.open) return;
    const m = model(), st = m.v.sync.status;
    const a = document.activeElement, focusId = a && a.classList && a.classList.contains("exl-row") && nodes.list.contains(a) ? a.dataset.id : "";
    nodes.count.textContent = countText(m);
    nodes.list.textContent = "";
    nodes.msg.textContent = "";
    let msg = "", sub = "";
    if (!m.total) {
      if (st === "offline") msg = ""; // the banner (with Retry) already says it
      else if (st === "done" || st === "stale") { msg = t("No exercise history yet"); sub = t("Complete a workout and its exercises will show up here."); }
      else if (st === "error" || st === "paused") msg = ""; // the banner says what happened
      else msg = t("Loading…");
    } else if (!m.rows.length) msg = t("No exercises match “{q}”", { q: L.query.trim() });
    if (msg) {
      nodes.msg.appendChild(el("span", "exl-msg-main", msg));
      if (sub) nodes.msg.appendChild(el("span", "exl-msg-sub", sub));
      if (m.total && !m.rows.length) {
        const c = el("button", "secondary exl-clear", t("Clear search")); c.type = "button";
        c.addEventListener("click", () => { L.query = ""; nodes.q.value = ""; renderRows(); announce(); nodes.q.focus(); });
        nodes.msg.appendChild(c);
      }
    }
    nodes.msg.hidden = !msg;
    nodes.list.hidden = !m.rows.length;
    nodes.tools.hidden = !m.total;
    nodes.count.hidden = !m.total;
    for (const r of m.rows) nodes.list.appendChild(rowEl(r, m.v));
    if (focusId) { const n = nodes.list.querySelector('.exl-row[data-id="' + CSS.escape(focusId) + '"]'); if (n) n.focus({ preventScroll: true }); }
  }
  function scheduleRows(now) {
    if (!L.open || !nodes || !L.shown) return;
    if (now) { clearTimeout(L.renderTimer); L.renderTimer = 0; renderRows(); return; }
    if (L.renderTimer) return;
    L.renderTimer = setTimeout(() => { L.renderTimer = 0; renderRows(); }, 700);
  }
  // The banner is the progress screen's own (same texts, countdown, Resume / Retry). Status changes also re-render the rows
  // (empty-state wording), which exercise-progress.js already requests through the data callback.
  function paintBanner() {
    if (!nodes || !L.open || !L.shown) return;
    EP.paintSync(nodes);
  }
  // Polite live region: the result count after a search or sort change only (never during the sync).
  function announce() {
    if (!nodes) return;
    const m = model();
    nodes.live.textContent = m.rows.length || !m.total ? countText(m) : t("No exercises match “{q}”", { q: L.query.trim() });
  }

  function build() {
    const root = $("ex-list");
    root.textContent = "";
    root.className = "exp-root exl-root";
    root.setAttribute("role", "region");
    root.setAttribute("aria-labelledby", "exl-title");
    const bar = el("div", "exp-bar");
    const back = el("button", "exp-back secondary");
    back.type = "button"; back.setAttribute("aria-label", t("Back"));
    back.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>';
    back.addEventListener("click", goBack);
    const titles = el("div", "exp-titles");
    const h = el("h2", "exp-title", t("Exercises")); h.id = "exl-title"; h.tabIndex = -1;
    titles.appendChild(h);
    bar.append(back, titles);

    const syncBox = el("div", "exp-sync"); syncBox.hidden = true;
    const syncLive = el("div", "sr-only exp-sync-live"); syncLive.setAttribute("aria-live", "polite");
    const live = el("div", "sr-only"); live.setAttribute("role", "status"); live.setAttribute("aria-live", "polite");

    const tools = el("div", "exl-tools");
    const qf = el("div", "exl-field exl-search");
    const ql = el("label", null, t("Search exercises")); ql.htmlFor = "exl-q";
    const q = el("input"); q.type = "search"; q.id = "exl-q"; q.value = L.query; q.autocomplete = "off"; q.spellcheck = false;
    q.setAttribute("enterkeyhint", "search");
    const flush = () => { if (!L.searchTimer) return; clearTimeout(L.searchTimer); L.searchTimer = 0; L.query = q.value; renderRows(); announce(); };
    q.addEventListener("input", () => {
      clearTimeout(L.searchTimer);
      L.searchTimer = setTimeout(() => { L.searchTimer = 0; L.query = q.value; renderRows(); announce(); }, 200);
    });
    // Tab right after typing: apply the pending filter BEFORE focus moves, or the row that gets focus may be filtered away.
    q.addEventListener("keydown", (e) => { if (e.key === "Tab") flush(); });
    q.addEventListener("blur", flush);
    q.addEventListener("search", () => { clearTimeout(L.searchTimer); L.query = q.value; renderRows(); announce(); }); // the clear (x) button
    qf.append(ql, q);
    const sf = el("div", "exl-field exl-sort");
    const sl = el("label", null, t("Sort by")); sl.htmlFor = "exl-sort";
    const sel = el("select"); sel.id = "exl-sort";
    for (const k of Core.SORTS) { const o = el("option", null, t(SORT_LABEL[k])); o.value = k; sel.appendChild(o); }
    sel.value = L.sort;
    sel.addEventListener("change", () => { L.sort = sel.value; renderRows(); announce(); });
    sf.append(sl, sel);
    tools.append(qf, sf);

    const count = el("p", "exl-count");
    const msg = el("div", "exl-msg"); msg.hidden = true;
    const list = el("ul", "exl-list"); list.setAttribute("role", "list"); list.setAttribute("aria-label", t("Exercise list"));
    list.addEventListener("click", (e) => {
      const b = e.target instanceof Element ? e.target.closest(".exl-row") : null;
      if (b) openRow(b);
    });
    root.append(bar, syncBox, syncLive, live, tools, count, msg, list);
    nodes = { root, title: h, syncBox, syncLive, live, tools, q, sel, count, msg, list };
    EP.resetAnnounce();
  }

  // ---------- navigation ----------
  const SIBLINGS = ["act-dashboard", "act-medals", "act-explorer", "act-report", "ex-progress"];
  function show() {
    const root = $("ex-list");
    SIBLINGS.forEach((id) => { const n = $(id); if (n) n.hidden = true; });
    root.hidden = false;
    L.shown = true;
  }
  function openRow(b) {
    const m = model(), r = m.rows.find((x) => x.actionId === b.dataset.id);
    if (!r) return;
    L.scrollY = window.scrollY; L.lastId = r.actionId; L.shown = false;
    EP.open(r.actionId, { name: r.name, onBack: restore });
  }
  // Back from Exercise Progress: same list, same search text, sort and scroll position, focus on the row that was opened.
  function restore() {
    if (!L.open || !nodes) return;
    show();
    EP.resetAnnounce();
    renderRows();
    paintBanner();
    window.scrollTo(0, L.scrollY);
    const n = L.lastId && nodes.list.querySelector('.exl-row[data-id="' + CSS.escape(L.lastId) + '"]');
    (n || nodes.title).focus({ preventScroll: true });
    EP.attachList(listener); // resume the sync that Exercise Progress stopped (skipped when one just finished)
  }

  function onKey(e) {
    if (e.key !== "Escape" || e.defaultPrevented || !L.open || !L.shown || EP.isOpen()) return;
    if (document.querySelector("dialog[open], .modal:not([hidden])")) return;
    // Escape in a search box with text clears the search; only an empty box leaves the list.
    if (nodes && e.target === nodes.q && nodes.q.value) {
      e.preventDefault();
      clearTimeout(L.searchTimer); L.searchTimer = 0;
      nodes.q.value = ""; L.query = ""; renderRows(); announce();
      return;
    }
    e.preventDefault();
    goBack();
  }
  function open(opts) {
    opts = opts || {};
    L.open = true; L.onBack = opts.onBack || null;
    L.query = ""; L.sort = Core.DEFAULT_SORT; L.scrollY = 0; L.lastId = "";
    build();
    show();
    document.removeEventListener("keydown", onKey);
    document.addEventListener("keydown", onKey);
    renderRows();
    paintBanner();
    nodes.title.focus({ preventScroll: true });
    window.scrollTo(0, 0);
    EP.attachList(listener);
  }
  // Called by DashboardUI.show() too (History tab re-shown): stop syncing for the list and hide it.
  function close() {
    const was = L.open;
    L.open = false; L.shown = false;
    clearTimeout(L.renderTimer); L.renderTimer = 0; clearTimeout(L.searchTimer); L.searchTimer = 0;
    document.removeEventListener("keydown", onKey);
    if (was) EP.detachList(listener);
    const root = $("ex-list");
    if (root) { root.hidden = true; root.textContent = ""; }
    nodes = null;
  }
  function goBack() {
    const cb = L.onBack;
    close();
    if (typeof cb === "function") cb();
  }

  // Language, unit and theme changes: rebuild the chrome, keep search text and sort. A new language also needs the library
  // names in that language, which come with the next sync.
  const rebuild = () => {
    if (!L.open || !nodes) return;
    const hadFocus = nodes.root.contains(document.activeElement);
    const wasShown = L.shown;
    if (nodes.q) L.query = nodes.q.value;
    build();
    if (wasShown) { renderRows(); paintBanner(); if (hadFocus) nodes.title.focus({ preventScroll: true }); }
  };
  if (window.I18N && Array.isArray(I18N.onChange)) I18N.onChange.push(() => { if (L.open) { rebuild(); if (L.shown) EP.startSync(); } });
  if (window.Units) Units.onChange(rebuild);

  window.ExerciseListUI = { open, close, restore, _state: L };
})();
