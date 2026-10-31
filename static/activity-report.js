/* Activity Training Report (record detail). DOM only; maths in activity-core.js.
   Depends on app.js globals: $, api, t, escapeHtml (not needed: textContent only), currentProfile.
   Public API: window.ReportUI.open(recordId, { row, onBack }). */
(function () {
  Object.assign(I18N.es, {
    "Training Report": "Informe de entrenamiento",
    "Workout {date}": "Entrenamiento {date}",
    "Workout": "Entrenamiento",
    "Volume": "Volumen",
    "Calories (kcal)": "Calorías (kcal)",
    "Duration": "Duración",
    "Movements": "Movimientos",
    "No movements recorded": "No hay movimientos registrados",
    "Set {n}": "Serie {n}",
    "{n} sets": "{n} series",
    "{n} set": "{n} serie",
    "{n} reps": "{n} reps",
    "Could not load this record": "No se pudo cargar este registro",
    "Loading…": "Cargando…",
    "Retry": "Reintentar",
    "Back": "Atrás",
    "Workout summary": "Resumen del entrenamiento",
    "Sets of {name}": "Series de {name}",
    "Set": "Serie",
    "Weight": "Peso",
    "Reps": "Reps",
    "Time": "Tiempo",
    "Check your connection and try again.": "Comprueba tu conexión e inténtalo de nuevo.",
    "Details: {msg}": "Detalles: {msg}",
  });

  const C = () => window.ActivityCore;
  const SIBLINGS = ["act-dashboard", "act-medals", "act-explorer"];
  const DUMBBELL = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6.5 6.5v11M17.5 6.5v11M3 9v6M21 9v6M6.5 12h11"/></svg>';
  const BOX = '<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 24l24-10 24 10-24 10zM8 24v18l24 10 24-10V24M32 34v18"/></svg>';

  const S = { id: null, row: null, onBack: null, token: 0, state: "idle", detail: null, error: "", open: false };

  const num = (v) => (Number.isFinite(+v) ? +v : 0);
  const safeUrl = (u) => (typeof u === "string" && /^https?:\/\//i.test(u.trim()) ? u.trim() : "");

  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined && text !== null) e.textContent = text;
    return e;
  }

  function dateText(v) {
    return typeof v === "string" && v ? v.slice(0, 19) : "";
  }

  function title() {
    const nm = S.row && typeof S.row.name === "string" && S.row.name.trim();
    if (nm) return nm;
    const dn = S.detail && typeof S.detail.name === "string" && S.detail.name.trim();
    if (dn) return dn;
    const st = dateText((S.detail && S.detail.startTime) || (S.row && S.row.startTime));
    return st ? t("Workout {date}", { date: st.slice(0, 10) }) : t("Workout");
  }

  function headline() {
    // coreData is authoritative (tenths of kg); never sum sets (QA F2).
    const src = S.detail || S.row || {};
    const rowSrc = S.row || {};
    const core = src.coreData != null ? src.coreData : rowSrc.coreData;
    const consume = src.consume != null ? src.consume : rowSrc.consume;
    const dur = src.duration != null ? src.duration : rowSrc.duration;
    return { core: num(core), consume: num(consume), duration: num(dur) };
  }

  function imgBox(url, cls) {
    const box = el("div", cls);
    const fallback = () => { box.textContent = ""; box.classList.add("is-fallback"); box.insertAdjacentHTML("beforeend", DUMBBELL); };
    const u = safeUrl(url);
    if (!u) { fallback(); return box; }
    const img = document.createElement("img");
    img.alt = "";
    img.loading = "lazy";
    img.decoding = "async";
    img.referrerPolicy = "no-referrer";
    img.addEventListener("error", fallback, { once: true });
    img.src = u;
    box.appendChild(img);
    return box;
  }

  function avatar() {
    const p = (typeof currentProfile !== "undefined" && currentProfile) || null;
    const nick = p && typeof p.nickName === "string" ? p.nickName.trim() : "";
    if (!nick) return null;
    const url = safeUrl(p.avatar || p.headImg || p.headPic || p.photo);
    const box = el("div", "rp-avatar");
    box.setAttribute("aria-hidden", "true");
    const initial = el("span", null, Array.from(nick)[0].toUpperCase());
    if (url) {
      const img = document.createElement("img");
      img.alt = "";
      img.referrerPolicy = "no-referrer";
      img.addEventListener("error", () => { img.remove(); box.appendChild(initial); }, { once: true });
      img.src = url;
      box.appendChild(img);
    } else box.appendChild(initial);
    return { box, nick };
  }

  function stat(valueText, label, cls) {
    const d = el("div", "rp-stat" + (cls ? " " + cls : ""));
    const v = el("div", "rp-stat-v", valueText);
    const l = el("div", "rp-stat-l", label);
    d.append(v, l);
    d.setAttribute("role", "group");
    return d;
  }

  function renderHero(root) {
    const hero = el("div", "rp-hero");
    const bar = el("div", "rp-bar");
    const back = el("button", "rp-back secondary");
    back.type = "button";
    back.setAttribute("aria-label", t("Back"));
    back.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>';
    back.addEventListener("click", goBack);
    bar.appendChild(back);
    const h = el("h2", "rp-title", title());
    h.id = "rp-title";
    h.tabIndex = -1;
    bar.appendChild(h);
    hero.appendChild(bar);
    const st = dateText((S.detail && S.detail.startTime) || (S.row && S.row.startTime));
    if (st) {
      const d = el("p", "rp-date", st);
      hero.appendChild(d);
    }
    root.appendChild(hero);
  }

  function renderSummary(root) {
    const h = headline();
    const card = el("section", "rp-card");
    card.setAttribute("aria-label", t("Workout summary"));
    const av = avatar();
    if (av) { card.appendChild(av.box); card.appendChild(el("div", "rp-nick", av.nick)); }
    else card.classList.add("no-avatar");
    const C_ = C();
    const vol = el("div", "rp-volume");
    vol.setAttribute("role", "group");
    const vv = el("div", "rp-volume-v");
    vv.append(el("span", "rp-volume-n", C_ ? C_.fmtWeight(h.core, Units.get()) : String(h.core / 10)), el("span", "rp-volume-u", Units.label()));
    vol.append(vv, el("div", "rp-stat-l", t("Volume")));
    card.appendChild(vol);
    const row = el("div", "rp-stats");
    row.append(stat(String(Math.round(h.consume)), t("Calories (kcal)")), stat(C_ ? C_.fmtDuration(h.duration) : String(h.duration), t("Duration")));
    card.appendChild(row);
    root.appendChild(card);
  }

  function renderGroup(g) {
    const li = el("li", "rp-group");
    const head = el("div", "rp-group-head");
    head.appendChild(imgBox(g.picUrl, "rp-pic"));
    const info = el("div", "rp-group-info");
    const name = el("h4", "rp-group-name", g.actionName || g.actionNo || "-");
    info.appendChild(name);
    const n = g.totalSets;
    info.appendChild(el("div", "rp-group-meta", (n === 1 ? t("{n} set", { n }) : t("{n} sets", { n })) + " · " + t("{n} reps", { n: g.totalReps })));
    head.appendChild(info);
    li.appendChild(head);
    const tbl = el("table", "rp-sets");
    tbl.setAttribute("aria-label", t("Sets of {name}", { name: g.actionName || "" }));
    const thead = el("thead");
    const hr = el("tr");
    for (const k of ["Set", "Weight", "Reps", "Time"]) { const th = el("th", null, t(k)); th.scope = "col"; hr.appendChild(th); }
    thead.appendChild(hr);
    tbl.appendChild(thead);
    const tb = el("tbody");
    const C_ = C();
    g.sets.forEach((s, i) => {
      const tr = el("tr");
      tr.appendChild(el("td", "rp-c-set", String(i + 1)));
      tr.appendChild(el("td", null, (C_ ? C_.fmtWeight(s.weight, Units.get()) : String(s.weight / 10)) + " " + Units.label()));
      tr.appendChild(el("td", null, String(num(s.count))));
      tr.appendChild(el("td", null, C_ ? C_.fmtDuration(s.duration) : String(s.duration)));
      tb.appendChild(tr);
    });
    tbl.appendChild(tb);
    li.appendChild(tbl);
    return li;
  }

  function renderMovements(root) {
    const sec = el("section", "rp-moves");
    const h = el("h3", "rp-h3", t("Movements"));
    sec.appendChild(h);
    let groups = [];
    try { groups = C() ? C().groupSets(S.detail && S.detail.extData) : []; } catch (e) { groups = []; }
    if (!groups.length) {
      const em = el("div", "rp-empty");
      em.insertAdjacentHTML("beforeend", BOX);
      em.appendChild(el("p", null, t("No movements recorded")));
      sec.appendChild(em);
    } else {
      const ul = el("ul", "rp-groups");
      groups.forEach((g) => ul.appendChild(renderGroup(g)));
      sec.appendChild(ul);
    }
    root.appendChild(sec);
  }

  function renderStatus(root) {
    const box = el("div", "rp-status");
    if (S.state === "loading") {
      box.setAttribute("role", "status");
      box.appendChild(el("span", "rp-spin"));
      box.appendChild(el("span", null, t("Loading…")));
    } else {
      box.setAttribute("role", "alert");
      box.classList.add("is-error");
      box.appendChild(el("p", null, t("Could not load this record")));
      box.appendChild(el("p", "rp-err-hint", t("Check your connection and try again.")));
      if (S.error) box.appendChild(el("p", "rp-err-detail", t("Details: {msg}", { msg: S.error })));
      const b = el("button", "secondary", t("Retry"));
      b.type = "button";
      b.addEventListener("click", () => load(true));
      box.appendChild(b);
    }
    root.appendChild(box);
  }

  function render(focus) {
    const root = $("act-report");
    if (!root || !S.open) return;
    const hadFocusInside = root.contains(document.activeElement);
    root.textContent = "";
    root.classList.add("rp-root");
    root.setAttribute("aria-labelledby", "rp-title");
    renderHero(root);
    const body = el("div", "rp-body");
    root.appendChild(body);
    if (S.state === "ready") { renderSummary(body); renderMovements(body); }
    else {
      // still show known headline from the list row while loading/error
      if (S.row && S.row.coreData != null) renderSummary(body);
      renderStatus(body);
    }
    if (focus || hadFocusInside) {
      const h = $("rp-title");
      if (h && (focus || !document.activeElement || document.activeElement === document.body)) h.focus({ preventScroll: !focus });
    }
  }

  async function load(refocus) {
    const token = ++S.token;
    S.state = "loading"; S.error = ""; S.detail = null;
    render(!!refocus);
    try {
      const res = await api("/sport/record/detail?recordId=" + encodeURIComponent(S.id));
      if (token !== S.token) return;
      if (!res || res.success === false || (res.code != null && +res.code !== 200) || !res.data || typeof res.data !== "object") {
        throw new Error((res && res.msg) || "No data");
      }
      S.detail = res.data;
      S.state = "ready";
    } catch (e) {
      if (token !== S.token) return;
      S.state = "error";
      S.error = e && e.message ? String(e.message) : "";
    }
    render(false);
  }

  function goBack() {
    close();
    if (typeof S.onBack === "function") S.onBack();
    settleFocus();
  }

  // After Back the caller has shown another sub-view; make sure focus is not lost on <body>.
  function settleFocus() {
    const go = () => {
      const a = document.activeElement;
      if (a && a !== document.body && a.offsetParent !== null) return;
      const panel = SIBLINGS.map($).find((n) => n && !n.hidden) || document.querySelector("#tab-history");
      if (!panel) return;
      const target = panel.querySelector("h1, h2, h3") || panel.querySelector("button, a[href], [tabindex]");
      if (!target) return;
      if (!target.hasAttribute("tabindex") && !/^(BUTTON|A)$/.test(target.tagName)) target.tabIndex = -1;
      target.focus({ preventScroll: true });
    };
    go();
    setTimeout(go, 50); // callers may render asynchronously
  }

  function close() {
    S.token++; // drop in-flight responses
    S.open = false;
    document.removeEventListener("keydown", onKey);
    const root = $("act-report");
    if (root) { root.hidden = true; root.textContent = ""; }
  }

  function onKey(e) {
    if (e.key !== "Escape" || e.defaultPrevented || !S.open) return;
    const root = $("act-report");
    if (!root || root.hidden) { S.open = false; return; }
    e.preventDefault();
    goBack();
  }

  function open(recordId, opts) {
    opts = opts || {};
    const root = $("act-report");
    if (!root) return;
    S.id = recordId;
    S.row = opts.row || null;
    S.onBack = opts.onBack || null;
    S.open = true;
    SIBLINGS.forEach((id) => { const n = $(id); if (n) n.hidden = true; });
    root.hidden = false;
    document.removeEventListener("keydown", onKey);
    document.addEventListener("keydown", onKey);
    load(true);
    try { root.scrollIntoView({ block: "start" }); } catch (e) { /* ignore */ }
  }

  I18N.onChange.push(() => { if (S.open) render(false); });

  window.ReportUI = { open, close };
})();
