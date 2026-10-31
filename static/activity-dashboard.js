/* Activity Dashboard + Medals (History tab). Pure maths lives in activity-core.js;
   this file is DOM + API only. Depends on app.js globals: $, api, t, escapeHtml,
   toast. All API-derived text goes through escapeHtml / textContent. Optional
   collaborators (guarded): window.ExplorerUI, window.ReportUI. */
(function () {
  const C = window.ActivityCore;
  if (!C) return;

  Object.assign(I18N.es, {
    "Summary": "Resumen",
    "Today": "Hoy",
    "Consume": "Consumo",
    "Duration": "Duración",
    "Volume": "Volumen",
    "Consume (kcal)": "Consumo (kcal)",
    "Duration (min)": "Duración (min)",
    "Goal {n}": "Meta {n}",
    "Today: consume {a} of {b} kcal, duration {c} of {d} min. Open the activity explorer.": "Hoy: consumo {a} de {b} kcal, duración {c} de {d} min. Abrir el explorador de actividad.",
    "Latest Record": "Último registro",
    "This Week": "Esta semana",
    "This Month": "Este mes",
    "Total": "Total",
    "kcal": "kcal",
    "min": "min",
    "No workouts yet": "Aún no hay entrenamientos",
    "No activity yet": "Aún no hay actividad",
    "Open the training report for {name}": "Abrir el informe de entrenamiento de {name}",
    "{a} kcal, {b} min": "{a} kcal, {b} min",
    "{a} kcal this week": "{a} kcal esta semana",
    "{a} kcal this month": "{a} kcal este mes",
    "{a} kcal in total": "{a} kcal en total",
    "kcal per day, week": "kcal por día, semana",
    "S M T W T F S": "D L M X J V S",
    "Medals": "Medallas",
    "Medal": "Medalla",
    "Medals earned: {n} of {m}": "Medallas obtenidas: {n} de {m}",
    "Open the medals page": "Abrir la página de medallas",
    "No medals earned yet": "Aún no has obtenido medallas",
    "No medals available": "No hay medallas disponibles",
    "earned {date}": "obtenida {date}",
    "earned": "obtenida",
    "locked": "bloqueada",
    "Recent Activity": "Actividad reciente",
    "Loading…": "Cargando…",
    "Couldn't load this section: {msg}": "No se pudo cargar esta sección: {msg}",
    "Refresh": "Actualizar",
    "Volume {a} kg": "Volumen {a} kg",
    "Workout": "Entrenamiento",
    "Delete workout {name}": "Eliminar entrenamiento {name}",
  });

  const RECENT_DAYS = 180;
  const pad = (n) => String(n).padStart(2, "0");
  const num = (v) => (Number.isFinite(+v) ? +v : 0);
  const el = (id) => document.getElementById(id);

  // One entry per data source. status: loading | ok | error. token guards out-of-order responses.
  const S = {};
  ["recs", "month", "week", "year", "totals", "badges"].forEach((k) => (S[k] = { status: "loading", data: null, err: "", token: 0 }));
  let built = false;
  let medalsOpen = false;

  const today = () => C.localISO(new Date());

  // ---------- data ----------
  function unwrap(res) {
    if (!res || typeof res !== "object") throw new Error("Invalid response");
    if (res.success === false || (res.code != null && ![0, 200, "0", "200"].includes(res.code))) throw new Error(res.msg || `Error ${res.code}`);
    return res.data;
  }
  const stamp = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;

  const FETCH = {
    recs: async () => {
      const end = new Date(), start = new Date(end.getTime() - RECENT_DAYS * 86400000);
      const data = unwrap(await api(`/sport/record/list?startTime=${encodeURIComponent(stamp(start))}&endTime=${encodeURIComponent(stamp(end))}&size=50`));
      if (data != null && !Array.isArray(data)) throw new Error("Invalid response");
      return (data || []).slice().sort((a, b) => String(b.startTime || "").localeCompare(String(a.startTime || "")));
    },
    month: () => statsDaily(C.periodRange("month", today())),
    week: () => statsDaily(C.periodRange("week", today())),
    year: async () => {
      const r = C.periodRange("year", today());
      const data = unwrap(await api(`/sport/record/statistics/list?statisticsType=2&startTime=${r.start}&endTime=${r.end}`));
      if (!data || typeof data !== "object") throw new Error("Invalid response");
      return { months: C.fillMonths(r, data.monthList), data };
    },
    totals: async () => {
      const data = unwrap(await api("/app/statistics"));
      if (!data || typeof data !== "object") throw new Error("Invalid response");
      return data;
    },
    badges: async () => {
      const data = unwrap(await api("/sport/record/badge/list"));
      if (!data || typeof data !== "object") throw new Error("Invalid response");
      return C.normalizeBadges(data);
    },
  };

  async function statsDaily(range) {
    const data = unwrap(await api(`/sport/record/statistics/list?statisticsType=1&startTime=${range.start}&endTime=${range.end}`));
    if (!data || typeof data !== "object") throw new Error("Invalid response");
    return { range, data, rows: C.fillDaily(range, data.dailyList), target: C.pickTarget(data.dailyList) };
  }

  function load(key) {
    const s = S[key], tok = ++s.token;
    if (s.status !== "ok") { s.status = "loading"; renderKey(key); }
    return FETCH[key]().then(
      (d) => { if (tok !== s.token) return; s.status = "ok"; s.data = d; s.err = ""; renderKey(key); },
      (e) => { if (tok !== s.token) return; s.status = "error"; s.data = null; s.err = (e && e.message) || "Error"; renderKey(key); }
    );
  }
  const loadAll = () => Object.keys(S).forEach(load);

  // ---------- render helpers ----------
  const slots = {
    today: () => el("act-today"), latest: () => el("act-latest"), week: () => el("act-week"),
    month: () => el("act-month"), total: () => el("act-total"), medal: () => el("act-medal-body"), recent: () => el("history-list"),
  };
  function renderKey(key) {
    if (!built) return;
    if (key === "recs") { renderLatest(); renderRecent(); }
    else if (key === "month") { renderToday(); renderMonth(); }
    else if (key === "week") { renderToday(); renderWeek(); }
    else if (key === "year" || key === "totals") renderTotal();
    else if (key === "badges") { renderMedalCard(); if (medalsOpen) renderMedalsPage(); }
  }
  function renderAll() {
    if (!built) return;
    renderHeader(); renderToday(); renderLatest(); renderWeek(); renderMonth(); renderTotal(); renderMedalCard(); renderRecent();
    if (medalsOpen) renderMedalsPage();
  }

  const loadingHtml = () => `<div class="act-skel" role="status" aria-label="${escapeHtml(t("Loading…"))}"><span></span><span></span></div>`;
  const emptyHtml = (msg) => `<p class="act-state act-empty">${escapeHtml(t(msg))}</p>`;
  function errorHtml(keys) {
    const msg = keys.map((k) => S[k].err).find(Boolean) || "";
    return `<div class="act-state act-error" role="alert"><span>${escapeHtml(t("Couldn't load this section: {msg}", { msg }))}</span>
      <button type="button" class="secondary act-retry" data-retry="${escapeHtml(keys.join(","))}">${escapeHtml(t("Retry"))}</button></div>`;
  }
  // Replacing markup would drop focus to <body>: remember the focused control and refocus its twin.
  function focusSel(n) {
    if (!n || !n.getAttribute) return "";
    if (n.id) return "#" + n.id;
    for (const a of ["data-open", "data-open-latest", "data-rec", "data-del", "data-retry"]) if (n.hasAttribute(a)) return `[${a}="${n.getAttribute(a)}"]`;
    return "";
  }
  function setBody(node, html) {
    if (!node) return;
    const a = document.activeElement, sel = node.contains(a) ? focusSel(a) : "";
    node.innerHTML = html;
    if (sel) { const n = node.querySelector(sel); if (n) n.focus({ preventScroll: true }); }
  }
  let pendingFocus = "";
  const unitKcal = () => escapeHtml(t("kcal"));
  const unitMin = () => escapeHtml(t("min"));

  // ---------- header ----------
  function renderHeader() {
    const h = el("act-title");
    if (h) h.textContent = t("Summary");
    const b = el("history-refresh-btn");
    if (b) b.textContent = t("Refresh");
  }

  // ---------- today ring ----------
  const RING = { cx: 60, cy: 60, outer: 50, inner: 36, w: 10 };
  function ringSvg(p) {
    const circ = (r) => 2 * Math.PI * r;
    const arc = (cls, r, f) => {
      const c = circ(r), d = Math.max(0, Math.min(1, f)) * c;
      return `<circle class="act-track" cx="${RING.cx}" cy="${RING.cy}" r="${r}"/>` +
        (d > 0.5 ? `<circle class="act-arc ${cls}" cx="${RING.cx}" cy="${RING.cy}" r="${r}" stroke-dasharray="${d.toFixed(2)} ${c.toFixed(2)}" style="--len:${c.toFixed(2)}"/>` : "");
    };
    return `<svg class="act-ring" viewBox="0 0 120 120" aria-hidden="true" focusable="false">${arc("act-consume", RING.outer, p.consume)}${arc("act-duration", RING.inner, p.duration)}</svg>`;
  }
  function renderToday() {
    const box = slots.today();
    if (!box) return;
    const src = S.month.status === "ok" ? S.month : S.week.status === "ok" ? S.week : null;
    if (!src) {
      if (S.month.status === "error" && S.week.status === "error") setBody(box, errorHtml(["month", "week"]));
      else setBody(box, loadingHtml());
      return;
    }
    const iso = today();
    const d = src.data;
    const row = d.rows.find((r) => r.date === iso) || C.fillDaily(C.periodRange("day", iso), [], d.target)[0];
    const p = C.ringProgress(row);
    const kc = C.fmtKcal(row.realConsume), mn = C.minutesFromSeconds(row.realDuration);
    const label = t("Today: consume {a} of {b} kcal, duration {c} of {d} min. Open the activity explorer.",
      { a: kc, b: C.fmtKcal(row.targetConsume), c: mn, d: C.minutesFromSeconds(row.targetDuration) });
    setBody(box, `<button type="button" class="act-today-btn" data-open="today" aria-label="${escapeHtml(label)}">
      ${ringSvg(p)}
      <span class="act-today-text">
        <span class="act-today-title">${escapeHtml(t("Today"))}</span>
        <span class="act-stat act-stat-consume"><span class="act-dot" aria-hidden="true"></span><span class="act-num">${escapeHtml(kc)}</span> <span class="act-unit">${unitKcal()}</span><span class="act-lbl">${escapeHtml(t("Consume"))} · ${escapeHtml(t("Goal {n}", { n: C.fmtKcal(row.targetConsume) }))}</span></span>
        <span class="act-stat act-stat-duration"><span class="act-dot" aria-hidden="true"></span><span class="act-num">${escapeHtml(mn)}</span> <span class="act-unit">${unitMin()}</span><span class="act-lbl">${escapeHtml(t("Duration"))} · ${escapeHtml(t("Goal {n}", { n: C.minutesFromSeconds(row.targetDuration) }))}</span></span>
      </span><span class="act-chev" aria-hidden="true"></span></button>`);
  }

  // ---------- mini bars ----------
  function barsSvg(values, max, label) {
    const n = values.length, W = n * 10, H = 40;
    const rects = values.map((v, i) => {
      if (v == null) return "";
      if (!(v > 0)) return `<rect class="act-bar act-bar-zero" x="${i * 10 + 2}" y="${H - 1}" width="6" height="1"/>`;
      const h = Math.max(2, (v / max) * (H - 2));
      return `<rect class="act-bar" x="${i * 10 + 2}" y="${(H - h).toFixed(2)}" width="6" height="${h.toFixed(2)}"/>`;
    }).join("");
    return `<svg class="act-bars" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="${escapeHtml(label)}" focusable="false">${rects}</svg>`;
  }
  const maxOf = (a) => Math.max(1, ...a.map((v) => num(v)));

  function cardTotals(data, rows) {
    const kc = Number.isFinite(+data.totalConsume) && data.totalConsume !== null ? +data.totalConsume : rows.reduce((s, r) => s + num(r.realConsume), 0);
    const du = Number.isFinite(+data.totalDuration) && data.totalDuration !== null ? +data.totalDuration : rows.reduce((s, r) => s + num(r.realDuration), 0);
    return { kc, du };
  }
  function statLine(kc, du) {
    return `<p class="act-big"><span class="act-num">${escapeHtml(C.fmtKcal(kc))}</span> <span class="act-unit">${unitKcal()}</span>
      <span class="act-sep" aria-hidden="true">·</span> <span class="act-num">${escapeHtml(C.minutesFromSeconds(du))}</span> <span class="act-unit">${unitMin()}</span></p>`;
  }

  function renderWeek() {
    const box = slots.week();
    if (!box) return;
    const s = S.week;
    if (s.status !== "ok") return setBody(box, s.status === "error" ? errorHtml(["week"]) : loadingHtml());
    const { rows, data } = s.data, tt = cardTotals(data, rows), iso = today();
    const vals = rows.map((r) => num(r.realConsume));
    const letters = t("S M T W T F S").split(" ");
    const lab = rows.map((r, i) => `<span${r.date === iso ? ' class="act-now" aria-current="date"' : ""}>${escapeHtml(letters[C.dayOfWeek(r.date)] || "")}</span>`).join("");
    setBody(box, statLine(tt.kc, tt.du) +
      barsSvg(vals, maxOf(vals), `${t("{a} kcal this week", { a: C.fmtKcal(tt.kc) })} (${t("kcal per day, week")})`) +
      `<div class="act-axis act-axis-7" aria-hidden="true">${lab}</div>` +
      (tt.kc <= 0 && tt.du <= 0 ? emptyHtml("No activity yet") : ""));
  }
  function renderMonth() {
    const box = slots.month();
    if (!box) return;
    const s = S.month;
    if (s.status !== "ok") return setBody(box, s.status === "error" ? errorHtml(["month"]) : loadingHtml());
    const { rows, data } = s.data, tt = cardTotals(data, rows);
    const vals = rows.map((r) => num(r.realConsume));
    setBody(box, statLine(tt.kc, tt.du) +
      barsSvg(vals, maxOf(vals), t("{a} kcal this month", { a: C.fmtKcal(tt.kc) })) +
      `<div class="act-axis act-axis-ends" aria-hidden="true"><span>1</span><span>${rows.length}</span></div>` +
      (tt.kc <= 0 && tt.du <= 0 ? emptyHtml("No activity yet") : ""));
  }
  function renderTotal() {
    const box = slots.total();
    if (!box) return;
    const tot = S.totals;
    if (tot.status !== "ok") return setBody(box, tot.status === "error" ? errorHtml(["totals"]) : loadingHtml());
    const d = tot.data;
    let bars = "";
    if (S.year.status === "ok") {
      const vals = S.year.data.months.map((m) => (m.hasData ? num(m.totalConsume) : null));
      bars = barsSvg(vals, maxOf(vals), t("{a} kcal in total", { a: C.fmtKcal(d.totalConsume) })) +
        `<div class="act-axis act-axis-ends" aria-hidden="true"><span>1</span><span>12</span></div>`;
    } else if (S.year.status === "error") {
      bars = `<div class="act-state act-error" role="alert"><span>${escapeHtml(t("Couldn't load this section: {msg}", { msg: S.year.err }))}</span><button type="button" class="secondary act-retry" data-retry="year">${escapeHtml(t("Retry"))}</button></div>`;
    } else bars = loadingHtml();
    const empty = num(d.totalConsume) <= 0 && num(d.totalDuration) <= 0;
    setBody(box, statLine(d.totalConsume, d.totalDuration) + bars + (empty ? emptyHtml("No activity yet") : ""));
  }

  // ---------- latest record + recent list ----------
  const dayOf = (st) => (/^\d{4}-\d{2}-\d{2}/.test(String(st || "")) ? String(st).slice(0, 10) : String(st || ""));
  const nameOf = (r) => (r && r.name ? String(r.name) : t("(unnamed)"));

  function renderLatest() {
    const box = slots.latest();
    if (!box) return;
    const s = S.recs;
    if (s.status !== "ok") return setBody(box, s.status === "error" ? errorHtml(["recs"]) : loadingHtml());
    const r = s.data[0];
    if (!r) return setBody(box, emptyHtml("No workouts yet"));
    const hasReport = !!window.ReportUI;
    const inner = `<span class="act-big"><span class="act-num">${escapeHtml(C.fmtKcal(r.consume))}</span> <span class="act-unit">${unitKcal()}</span>
        <span class="act-sep" aria-hidden="true">·</span> <span class="act-num">${escapeHtml(C.minutesFromSeconds(r.duration))}</span> <span class="act-unit">${unitMin()}</span></span>
      <span class="act-sub">${escapeHtml(nameOf(r))}</span><span class="act-sub">${escapeHtml(dayOf(r.startTime))}</span>`;
    setBody(box, `<button type="button" class="act-linkcard" data-open-latest="1" aria-label="${escapeHtml(t("Open the training report for {name}", { name: nameOf(r) }) + ". " + t("{a} kcal, {b} min", { a: C.fmtKcal(r.consume), b: C.minutesFromSeconds(r.duration) }) + ", " + dayOf(r.startTime))}"${hasReport ? "" : ""}>${inner}<span class="act-chev" aria-hidden="true"></span></button>`);
  }

  function renderRecent() {
    const box = slots.recent();
    if (!box) return;
    const s = S.recs;
    if (s.status !== "ok") return setBody(box, s.status === "error" ? errorHtml(["recs"]) : loadingHtml());
    if (!s.data.length) return setBody(box, `<p class="empty-state">${escapeHtml(t("No workout records in the last 180 days."))}</p>`);
    setBody(box, s.data.map((r, i) => {
      const meta = `${Units.text(t("Volume {a} kg", { a: C.fmtWeight(r.coreData, Units.get()) }))} · ${C.fmtKcal(r.consume)} ${t("kcal")} · ${C.fmtDuration(r.duration)}`;
      return `<div class="record-card act-rec">
        <button type="button" class="act-rec-main" data-rec="${i}">
          <span class="name">${escapeHtml(nameOf(r))}</span>
          <span class="meta">${escapeHtml(String(r.startTime || ""))}</span>
          <span class="meta act-rec-stats">${escapeHtml(meta)}</span>
        </button>
        <button type="button" class="secondary act-del" data-del="${i}" aria-label="${escapeHtml(t("Delete workout {name}", { name: nameOf(r) }))}">${escapeHtml(t("Delete"))}</button>
      </div>`;
    }).join(""));
  }

  // ---------- medals ----------
  const TYPE_LABEL = { consume: "Consume", duration: "Duration", capacity: "Volume" };
  const badgeLabel = (b) => { const c = C.badgeCaption(b, Units.get()); return `${t(TYPE_LABEL[b.key] || "Medal")} ${c.target} ${c.unit}`.trim(); };
  function medalHtml(b, cls) {
    const label = badgeLabel(b);
    const alt = `${label}, ${b.received ? (b.receiveDate ? t("earned {date}", { date: b.receiveDate }) : t("earned")) : t("locked")}`;
    const src = b.pic || (b.received ? b.activePic : b.inactivePic);
    const img = src ? `<img src="${escapeHtml(src)}" alt="${escapeHtml(alt)}" loading="lazy" decoding="async">` : medalFallback(b, alt);
    return `<figure class="act-medal ${cls || ""}${b.received ? " is-earned" : " is-locked"}">${img}<figcaption>${escapeHtml(label)}</figcaption></figure>`;
  }
  function medalFallback(b, alt) {
    const c = C.badgeCaption(b, Units.get());
    return `<span class="act-medal-fb" role="img" aria-label="${escapeHtml(alt)}"><b>${escapeHtml(String(c.target))}</b><small>${escapeHtml(c.unit)}</small></span>`;
  }
  // img error does not bubble: capture on the container, swap in the text badge.
  function wireImgFallback(root) {
    root.addEventListener("error", (e) => {
      const img = e.target;
      if (!img || img.tagName !== "IMG" || !img.closest(".act-medal")) return;
      const fb = document.createElement("span");
      fb.className = "act-medal-fb";
      fb.setAttribute("role", "img");
      fb.setAttribute("aria-label", img.alt);
      const fig = img.closest(".act-medal");
      const cap = fig.querySelector("figcaption");
      const m = /(\S+)\s+(\S*)$/.exec(cap ? cap.textContent : "");
      const b = document.createElement("b"), u = document.createElement("small");
      b.textContent = m ? m[1] : ""; u.textContent = m ? m[2] : "";
      fb.append(b, u);
      img.replaceWith(fb);
    }, true);
  }

  function renderMedalCard() {
    const box = slots.medal();
    if (!box) return;
    const s = S.badges;
    if (s.status !== "ok") return setBody(box, s.status === "error" ? errorHtml(["badges"]) : loadingHtml());
    const nb = s.data;
    if (!nb.total) return setBody(box, emptyHtml("No medals available"));
    const latest = nb.latest.slice(0, 3);
    setBody(box, latest.length
      ? `<div class="act-medal-row">${latest.map((b) => medalHtml(b, "act-medal-sm")).join("")}</div>`
      : emptyHtml("No medals earned yet"));
  }

  function renderMedalsPage() {
    const box = el("act-medals");
    if (!box) return;
    const s = S.badges;
    let body;
    if (s.status === "error") body = errorHtml(["badges"]);
    else if (s.status !== "ok") body = loadingHtml();
    else if (!s.data.total) body = emptyHtml("No medals available");
    else body = `<p class="act-sub" role="status">${escapeHtml(t("Medals earned: {n} of {m}", { n: s.data.receivedCount, m: s.data.total }))}</p>` +
      s.data.groups.map((g) => `<section class="act-medal-group" aria-labelledby="act-mg-${escapeHtml(g.key)}">
        <h3 id="act-mg-${escapeHtml(g.key)}">${escapeHtml(t(TYPE_LABEL[g.key] || "Medal"))}</h3>
        <div class="act-medal-grid">${g.badges.map((b) => medalHtml(b, "")).join("")}</div></section>`).join("");
    setBody(box, `<div class="row-between act-head">
        <button type="button" class="secondary act-back" id="act-medals-back">← ${escapeHtml(t("Back"))}</button>
        <h2 id="act-medals-title" tabindex="-1">${escapeHtml(t("Medals"))}</h2></div>${body}`);
  }

  function showMedals() {
    medalsOpen = true;
    pendingFocus = "#act-medal-btn";
    el("act-dashboard").hidden = true;
    el("act-medals").hidden = false;
    ["act-explorer", "act-report"].forEach((id) => { const n = el(id); if (n) n.hidden = true; });
    if (S.badges.status === "error") load("badges");
    el("act-medals").innerHTML = "";
    renderMedalsPage();
    const h = el("act-medals-title");
    if (h) h.focus({ preventScroll: true });
    window.scrollTo(0, 0);
  }

  // ---------- actions ----------
  function openExplorer() {
    if (window.ExplorerUI && ExplorerUI.open) {
      pendingFocus = "[data-open='today']";
      ExplorerUI.open({ view: "day", date: today(), onBack: () => DashboardUI.show() });
    }
  }
  function openReport(r, fromLatest) {
    if (window.ReportUI && ReportUI.open && r) {
      const i = S.recs.data ? S.recs.data.indexOf(r) : -1;
      pendingFocus = i === 0 && fromLatest ? "[data-open-latest=\"1\"]" : i >= 0 ? `[data-rec="${i}"]` : "";
      ReportUI.open(r.sportRecordId, { row: r, onBack: () => DashboardUI.show() });
    }
  }
  async function removeRecord(r) {
    if (!r) return;
    if (!confirm(t("Delete this workout record? This cannot be undone."))) return;
    try {
      await api(`/sport/record/delete/${r.sportRecordId}`, { method: "POST" });
      toast(t("Deleted."));
      loadAll();
    } catch (e) {
      toast(t("Delete failed: {msg}", { msg: e.message }), true);
    }
  }

  function onClick(e) {
    const tgt = e.target instanceof Element ? e.target : null;
    if (!tgt) return;
    const retry = tgt.closest("[data-retry]");
    if (retry) { retry.dataset.retry.split(",").forEach(load); return; }
    if (tgt.closest("[data-open='today']")) return openExplorer();
    if (tgt.closest("[data-open-latest]")) return openReport(S.recs.data && S.recs.data[0], true);
    if (tgt.closest("#act-medal-btn")) return showMedals();
    if (tgt.closest("#history-refresh-btn")) return loadAll();
    if (tgt.closest("#act-medals-back")) { medalsOpen = false; return DashboardUI.show(); }
    const del = tgt.closest("[data-del]");
    if (del) return removeRecord(S.recs.data && S.recs.data[+del.dataset.del]);
    const rec = tgt.closest("[data-rec]");
    if (rec) return openReport(S.recs.data && S.recs.data[+rec.dataset.rec]);
  }

  // ---------- skeleton ----------
  function build() {
    const root = el("act-dashboard");
    if (!root || built) return;
    // Replacing the markup also drops the legacy refresh button (and its loadHistory listener).
    root.innerHTML = `
      <div class="row-between act-head"><h2 id="act-title"></h2>
        <button type="button" id="history-refresh-btn" class="secondary"></button></div>
      <section class="act-today" aria-labelledby="act-title"><div id="act-today"></div></section>
      <div class="act-cards">
        <section class="act-card" aria-labelledby="act-h-latest"><h3 id="act-h-latest"></h3><div id="act-latest" class="act-body"></div></section>
        <section class="act-card" aria-labelledby="act-h-week"><h3 id="act-h-week"></h3><div id="act-week" class="act-body"></div></section>
        <section class="act-card" aria-labelledby="act-h-month"><h3 id="act-h-month"></h3><div id="act-month" class="act-body"></div></section>
        <section class="act-card" aria-labelledby="act-h-total"><h3 id="act-h-total"></h3><div id="act-total" class="act-body"></div></section>
      </div>
      <section class="act-card act-medalcard" aria-labelledby="act-h-medal">
        <div class="act-card-top"><h3 id="act-h-medal"></h3>
          <button type="button" id="act-medal-btn" class="act-medal-btn"><span class="act-chev" aria-hidden="true"></span></button></div>
        <div id="act-medal-body" class="act-body"></div></section>
      <section class="act-recent" aria-labelledby="act-h-recent"><h3 id="act-h-recent"></h3><div id="history-list"></div></section>`;
    root.addEventListener("click", onClick);
    wireImgFallback(root);
    wireImgFallback(el("act-medals"));
    el("act-medals").addEventListener("click", onClick);
    built = true;
    titles();
  }
  function titles() {
    const set = (id, k) => { const n = el(id); if (n) n.textContent = t(k); };
    set("act-h-latest", "Latest Record"); set("act-h-week", "This Week"); set("act-h-month", "This Month");
    set("act-h-total", "Total"); set("act-h-medal", "Medals"); set("act-h-recent", "Recent Activity");
    const b = el("act-medal-btn");
    if (b) b.setAttribute("aria-label", t("Open the medals page"));
  }

  const DashboardUI = {
    show() {
      build();
      if (!built) return;
      const wasMedals = medalsOpen;
      medalsOpen = false;
      el("act-dashboard").hidden = false;
      ["act-medals", "act-explorer", "act-report"].forEach((id) => { const n = el(id); if (n) n.hidden = true; });
      renderAll();
      const f = pendingFocus; pendingFocus = "";
      if (f || wasMedals) {
        const n = (f && el("act-dashboard").querySelector(f)) || el("act-title");
        if (n) { if (!n.matches("button,[tabindex]")) n.tabIndex = -1; n.focus({ preventScroll: false }); }
      }
      loadAll();
    },
  };
  window.DashboardUI = DashboardUI;

  I18N.onChange.push(() => { if (built) { titles(); renderAll(); } });
})();
