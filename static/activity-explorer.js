/* Activity Explorer ("My Activity": Day / Week / Month / Year). DOM + API + Chart.js wiring
   only; the maths lives in activity-core.js. Depends on app.js globals: $, api, t, escapeHtml,
   switchTab. All API-derived text goes through escapeHtml / textContent.
   Public API: window.ExplorerUI = { open({ view, date, onBack }), openFromProfile() }. */
(function () {
  const AC = window.ActivityCore;
  if (!AC) return;

  Object.assign(I18N.es, {
    "My Activity": "Mi actividad",
    "Period": "Periodo",
    "Day": "Día", "Week": "Semana", "Month": "Mes", "Year": "Año",
    "Previous day": "Día anterior", "Next day": "Día siguiente",
    "Previous week": "Semana anterior", "Next week": "Semana siguiente",
    "Previous month": "Mes anterior", "Next month": "Mes siguiente",
    "Previous year": "Año anterior", "Next year": "Año siguiente",
    "Consume": "Consumo",
    "Consume (kcal)": "Consumo (kcal)",
    "Duration (min)": "Duración (min)",
    "Recent Activity": "Actividad reciente",
    "No activity recorded on this day.": "No hay actividad registrada este día.",
    "No activity recorded in this period.": "No hay actividad registrada en este periodo.",
    "Grade {g}": "Nota {g}",
    "{date}: consume {c} of {tc} kcal, duration {d} of {td} min": "{date}: consumo {c} de {tc} kcal, duración {d} de {td} min",
    "Consume {c} kcal, duration {d} min": "Consumo {c} kcal, duración {d} min",
    "{label}: {value}": "{label}: {value}",
    "No data in this period": "Sin datos en este periodo",
    "Date": "Fecha",
    "Activity data": "Datos de actividad",
    "Equivalent to": "Equivale a",
    "{n} servings of French fries": "{n} raciones de patatas fritas",
    "{n} hamburgers": "{n} hamburguesas",
    "{n} cars lifted": "{n} coches levantados",
    "{n} Eiffel Towers lifted": "{n} torres Eiffel levantadas",
    "Unexpected response from the server.": "Respuesta inesperada del servidor.",
    "Workout": "Entrenamiento",
    "{n} kcal": "{n} kcal",
    "Open activity explorer": "Abrir explorador de actividad",
    "Showing the latest {n} workouts": "Mostrando los últimos {n} entrenamientos",
    "{n} workouts without a valid date are not shown": "{n} entrenamientos sin fecha válida no se muestran",
  });

  const VIEWS = AC.VIEWS || ["day", "week", "month", "year"];
  const VIEW_LABEL = { day: "Day", week: "Week", month: "Month", year: "Year" };
  const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const SIBLINGS = ["act-dashboard", "act-medals", "act-report"];

  const S = {
    view: "day", anchor: null, onBack: null,
    status: "idle", error: null, cache: null, token: 0,
    charts: [], refocus: null,
  };

  const today = () => AC.localISO(new Date());
  const pad = (n) => String(n).padStart(2, "0");
  const num = (x) => (Number.isFinite(+x) ? +x : 0);
  const root = () => document.getElementById("act-explorer");
  const visible = () => { const r = root(); const tab = document.getElementById("tab-history"); return !!r && !r.hidden && (!tab || !tab.hidden); };
  const reduceMotion = () => !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  const fmtMin = (sec) => t("{n} min", { n: AC.minutesFromSeconds(sec) });

  /* ---------- period helpers ---------- */
  // Day view needs the whole week (strip); the other views use their own range.
  function dataRange() { return AC.periodRange(S.view === "day" ? "week" : S.view, S.anchor); }
  function keyOf(r) { return `${r.view}|${r.start}|${r.end}`; }
  function shortLabel(range) {
    if (range.view === "day") return range.start.slice(5).replace("-", ".");
    return range.label;
  }

  /* ---------- API ---------- */
  function check(res) {
    if (!res || typeof res !== "object") throw new Error(t("Unexpected response from the server."));
    if (res.success === false || (typeof res.code === "number" && res.code >= 400)) {
      throw new Error(res.msg || res.proxyError || `HTTP ${res.code || ""}`.trim());
    }
    return res;
  }
  async function fetchStats(range) {
    const type = range.view === "year" ? 2 : 1;
    const res = check(await api(`/sport/record/statistics/list?statisticsType=${type}&startTime=${encodeURIComponent(range.start)}&endTime=${encodeURIComponent(range.end)}`));
    if (!res.data || typeof res.data !== "object") throw new Error(t("Unexpected response from the server."));
    return res.data;
  }
  async function fetchRecords(range) {
    const res = check(await api(`/sport/record/list?startTime=${encodeURIComponent(range.start + " 00:00:00")}&endTime=${encodeURIComponent(range.end + " 23:59:59")}&size=50`));
    const list = Array.isArray(res.data) ? res.data : [];
    const inRange = [];
    let undated = 0;
    for (const r of list) {
      if (!r) continue;
      const p = r.startTime == null ? null : AC.parseDate(String(r.startTime).slice(0, 10));
      if (!p) { undated++; continue; }
      const iso = `${p.y}-${pad(p.m)}-${pad(p.d)}`;
      if (iso >= range.start && iso <= range.end) inRange.push({ rec: r, date: iso });
    }
    inRange.sort((a, b) => String(b.rec.startTime).localeCompare(String(a.rec.startTime)));
    return { items: inRange, capped: list.length >= 50, undated };
  }

  async function load() {
    const range = dataRange();
    const key = keyOf(range);
    const token = ++S.token;
    const silent = !!(S.cache && S.cache.key === key);
    S.error = null;
    if (silent) { S.status = "ready"; renderBody(); } else { S.status = "loading"; renderBody(); }
    updateHeader();
    try {
      const wantRecords = S.view !== "year";
      const [stats, records] = await Promise.all([fetchStats(range), wantRecords ? fetchRecords(range) : Promise.resolve({ items: [], capped: false, undated: 0 })]);
      if (token !== S.token) return;
      S.cache = { key, range, stats, records: records.items, capped: records.capped, undated: records.undated };
      S.status = "ready";
    } catch (e) {
      if (token !== S.token) return;
      if (silent) return; // keep the last good render
      S.status = "error";
      S.error = e && e.message ? e.message : String(e);
    }
    renderBody();
  }

  /* ---------- navigation ---------- */
  function go(delta) {
    if (!AC.canShift(S.view, S.anchor, delta, { today: today() })) return;
    S.anchor = AC.shiftPeriod(S.view, S.anchor, delta);
    refreshForPeriod();
  }
  function setView(view) {
    if (view === S.view) return;
    S.view = view;
    S.refocus = `[data-view="${view}"]`;
    refreshForPeriod();
  }
  function selectDay(iso) {
    if (iso > today()) return;
    S.anchor = iso;
    S.refocus = `[data-date="${iso}"]`;
    refreshForPeriod();
  }
  function refreshForPeriod() {
    const key = keyOf(dataRange());
    if (S.cache && S.cache.key === key && S.status === "ready") { S.token++; updateHeader(); renderBody(); }
    else load();
  }

  /* ---------- shell (header + controls), rebuilt on language change ---------- */
  function buildShell() {
    const r = root();
    if (!r) return;
    destroyCharts();
    r.innerHTML = `<div class="aex">
      <div class="aex-top"><button type="button" id="aex-back" class="secondary">‹ ${escapeHtml(t("Back"))}</button><h2 id="aex-title" tabindex="-1">${escapeHtml(t("My Activity"))}</h2></div>
      <div class="pl-seg aex-seg" id="aex-seg" role="group" aria-label="${escapeHtml(t("Period"))}">${VIEWS.map((v) => `<button type="button" data-view="${v}" aria-pressed="false">${escapeHtml(t(VIEW_LABEL[v]))}</button>`).join("")}</div>
      <div class="aex-nav">
        <button type="button" class="secondary aex-arrow" id="aex-prev">‹</button>
        <div class="aex-date" id="aex-date" aria-live="polite"></div>
        <button type="button" class="secondary aex-arrow" id="aex-next">›</button>
      </div>
      <div id="aex-body" class="aex-body"></div>
    </div>`;
    r.querySelector("#aex-back").onclick = back;
    r.querySelectorAll("#aex-seg button").forEach((b) => (b.onclick = () => setView(b.dataset.view)));
    r.querySelector("#aex-prev").onclick = () => go(-1);
    r.querySelector("#aex-next").onclick = () => go(1);
    updateHeader();
  }

  function updateHeader() {
    const r = root();
    if (!r || !r.querySelector("#aex-date")) return;
    const range = AC.periodRange(S.view, S.anchor);
    const full = S.view === "week" ? range.start + " – " + range.end : S.view === "day" ? range.start : S.view === "month" ? range.label : range.label;
    const d = r.querySelector("#aex-date");
    d.innerHTML = `<span aria-hidden="true">${escapeHtml(shortLabel(range))}</span><span class="sr-only">${escapeHtml(t(VIEW_LABEL[S.view]) + ", " + full)}</span>`;
    r.querySelectorAll("#aex-seg button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.view === S.view)));
    const opts = { today: today() };
    const prev = r.querySelector("#aex-prev"), next = r.querySelector("#aex-next");
    prev.setAttribute("aria-label", t("Previous " + S.view));
    next.setAttribute("aria-label", t("Next " + S.view));
    prev.setAttribute("aria-disabled", String(!AC.canShift(S.view, S.anchor, -1, opts)));
    next.setAttribute("aria-disabled", String(!AC.canShift(S.view, S.anchor, 1, opts)));
  }

  function back() {
    destroyCharts();
    S.token++;
    const r = root();
    if (r) r.hidden = true;
    const fn = S.onBack;
    if (typeof fn === "function") fn();
  }

  /* ---------- SVG pieces (decorative, aria-hidden) ---------- */
  function ringSvg(cls, consume, duration, stroke) {
    const r1 = 50 - stroke / 2 - 1, r2 = r1 - stroke - 3;
    const arc = (r, p, c) => `<circle class="aex-track" cx="50" cy="50" r="${r}" stroke-width="${stroke}"/>` +
      (p > 0 ? `<circle class="aex-arc ${c}" cx="50" cy="50" r="${r}" stroke-width="${stroke}" pathLength="100" stroke-dasharray="${(p * 100).toFixed(2)} 100" transform="rotate(-90 50 50)"/>` : "");
    return `<svg class="${cls}" viewBox="0 0 100 100" aria-hidden="true" focusable="false">${arc(r1, consume, "is-consume")}${arc(r2, duration, "is-duration")}</svg>`;
  }
  const ILLUS = {
    fries: '<svg class="aex-illus" viewBox="0 0 64 64" aria-hidden="true" focusable="false"><g class="il-b"><rect x="14" y="8" width="6" height="30" rx="2"/><rect x="22" y="4" width="6" height="34" rx="2"/><rect x="30" y="9" width="6" height="29" rx="2"/><rect x="38" y="5" width="6" height="33" rx="2"/><rect x="46" y="10" width="6" height="28" rx="2"/></g><path class="il-a" d="M10 34h44l-5 24a3 3 0 0 1-3 2H18a3 3 0 0 1-3-2z"/></svg>',
    hamburgers: '<svg class="aex-illus" viewBox="0 0 64 64" aria-hidden="true" focusable="false"><path class="il-b" d="M8 28c0-12 10-20 24-20s24 8 24 20z"/><rect class="il-c" x="6" y="31" width="52" height="7" rx="3.5"/><path class="il-d" d="M6 41h52v2a3 3 0 0 1-3 3H9a3 3 0 0 1-3-3z"/><path class="il-b" d="M8 48h48v2c0 5-5 8-10 8H18c-5 0-10-3-10-8z"/></svg>',
    cars: '<svg class="aex-illus" viewBox="0 0 64 64" aria-hidden="true" focusable="false"><path class="il-a" d="M6 40l4-10c1-3 3-5 6-5h20c3 0 5 1 7 4l5 6c4 1 6 3 6 6v4H6z"/><path class="il-w" d="M17 29h8v8h-13zM28 29h8c2 0 3 1 4 3l2 5H28z"/><circle class="il-c" cx="18" cy="46" r="6"/><circle class="il-c" cx="48" cy="46" r="6"/></svg>',
    eiffel: '<svg class="aex-illus" viewBox="0 0 64 64" aria-hidden="true" focusable="false"><g class="il-s"><path d="M32 4v8M29 12h6M27 12l-4 24M37 12l4 24M23 36l-9 24M41 36l9 24M25 28h14M21 42h22M18 52h28M14 60h6M44 60h6"/><path d="M32 12l-9 48M32 12l9 48" /></g></svg>',
    empty: '<svg class="aex-empty-illus" viewBox="0 0 96 72" aria-hidden="true" focusable="false"><g class="il-s"><rect x="28" y="8" width="40" height="56" rx="6"/><path d="M38 8v-2h20v2M38 26h20M38 36h20M38 46h12"/></g><g class="il-b"><circle cx="76" cy="52" r="9"/></g><path class="il-s" d="M72 52l3 3 5-6"/></svg>',
  };

  /* ---------- charts ---------- */
  function destroyCharts() {
    for (const c of S.charts) { try { c.destroy(); } catch (e) { /* already gone */ } }
    S.charts = [];
  }

  function cssVar(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }

  function buildChart(canvas, cfg) {
    const top = cssVar(cfg.top) || cssVar("--primary"), bottom = cssVar(cfg.bottom) || cssVar("--primary"), muted = cssVar("--muted"), grid = cssVar("--border"), text = cssVar("--text");
    Chart.defaults.font.family = getComputedStyle(document.body).fontFamily;
    const maxV = Math.max.apply(null, cfg.values.concat([0]));
    const chart = new Chart(canvas, {
      type: "bar",
      data: {
        labels: cfg.labels,
        datasets: [{
          data: cfg.values,
          backgroundColor(ctx) {
            const a = ctx.chart.chartArea;
            if (!a) return top;
            const g = ctx.chart.ctx.createLinearGradient(0, a.bottom, 0, a.top);
            g.addColorStop(0, bottom); g.addColorStop(1, top);
            return g;
          },
          borderRadius: 3, maxBarThickness: 22, categoryPercentage: 0.85, barPercentage: 0.8, minBarLength: 0,
        }],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        animation: reduceMotion() ? false : { duration: 350 },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              title: (items) => cfg.titles[items[0].dataIndex],
              label: (item) => `${item.parsed.y} ${cfg.unit}`,
            },
          },
        },
        scales: {
          x: { grid: { display: false }, ticks: { color: muted, maxRotation: 0, autoSkip: true, font: { size: 11 } }, border: { color: grid } },
          y: { beginAtZero: true, suggestedMax: maxV > 0 ? undefined : cfg.emptyMax, grace: "8%", grid: { color: grid }, border: { display: false }, ticks: { color: muted, precision: 0, font: { size: 11 } },
            title: { display: false, color: text } },
        },
      },
    });
    S.charts.push(chart);
    return chart;
  }

  function summary(values, titles, unit) {
    const parts = [];
    values.forEach((v, i) => { if (v > 0) parts.push(t("{label}: {value}", { label: titles[i], value: `${v} ${unit}` })); });
    return parts.length ? parts.join("; ") : t("No data in this period");
  }

  function chartBlock(id, heading, unit, values, titles) {
    const label = `${heading}. ${summary(values, titles, unit)}`;
    const body = window.Chart
      ? `<div class="aex-chart"><canvas id="${id}" role="img" aria-label="${escapeHtml(label)}"></canvas></div>`
      : "";
    return `<section class="aex-card aex-chartcard"><h3 class="aex-h">${escapeHtml(heading)}</h3>${body}</section>`;
  }

  function dataTable(cols, rows, visibleTable) {
    const head = `<tr><th scope="col">${escapeHtml(t("Date"))}</th>${cols.map((c) => `<th scope="col">${escapeHtml(c)}</th>`).join("")}</tr>`;
    const trs = rows.map((r) => `<tr><th scope="row">${escapeHtml(r.title)}</th>${r.vals.map((v) => `<td>${escapeHtml(v)}</td>`).join("")}</tr>`).join("");
    return `<div class="aex-tablewrap${visibleTable ? "" : " sr-only"}"><table class="aex-table"><caption class="sr-only">${escapeHtml(t("Activity data"))}</caption><thead>${head}</thead><tbody>${trs}</tbody></table></div>`;
  }

  /* ---------- sections ---------- */
  function statLine(label, value, cls) {
    return `<div class="aex-stat ${cls}"><span class="aex-stat-label">${escapeHtml(label)}</span><span class="aex-stat-val">${value}</span></div>`;
  }

  function dayView(c) {
    const rows = AC.fillDaily(c.range, c.stats.dailyList);
    const now = today();
    const strip = rows.map((d) => {
      const rp = AC.ringProgress(d), g = AC.gradeFor(d);
      const dt = AC.parseDate(d.date);
      const wd = t(WEEKDAYS[AC.dayOfWeek(d.date)]);
      const sel = d.date === S.anchor, fut = d.date > now;
      const aria = t("{date}: consume {c} of {tc} kcal, duration {d} of {td} min", {
        date: `${wd} ${pad(dt.m)}.${pad(dt.d)}`, c: AC.fmtKcal(d.realConsume), tc: AC.fmtKcal(d.targetConsume),
        d: AC.minutesFromSeconds(d.realDuration), td: AC.minutesFromSeconds(d.targetDuration),
      }) + (g ? ", " + t("Grade {g}", { g }) : "");
      return `<li><button type="button" class="aex-day${sel ? " is-sel" : ""}${fut ? " is-future" : ""}" data-date="${d.date}" aria-pressed="${sel}" aria-label="${escapeHtml(aria)}"${fut ? ' aria-disabled="true"' : ""}>
        <span class="aex-wd" aria-hidden="true">${escapeHtml(wd)}</span>
        ${ringSvg("aex-ring-sm", rp.consume, rp.duration, 9)}
        <span class="aex-dn" aria-hidden="true">${dt.d}</span>
        <span class="aex-grade${g ? "" : " is-none"}" aria-hidden="true">${g ? escapeHtml(g) : "&nbsp;"}</span></button></li>`;
    }).join("");
    const sel = rows.find((d) => d.date === S.anchor) || rows[0];
    const rp = AC.ringProgress(sel);
    const big = `<div class="aex-card aex-daysum">
      <div class="aex-bigring" role="img" aria-label="${escapeHtml(t("Consume {c} kcal, duration {d} min", { c: AC.fmtKcal(sel.realConsume), d: AC.minutesFromSeconds(sel.realDuration) }))}">${ringSvg("aex-ring-lg", rp.consume, rp.duration, 8)}</div>
      <div class="aex-stats">
        ${statLine(t("Consume"), `<strong>${escapeHtml(AC.fmtKcal(sel.realConsume))}</strong> <small>kcal</small>`, "is-consume")}
        ${statLine(t("Duration"), `<strong>${escapeHtml(String(AC.minutesFromSeconds(sel.realDuration)))}</strong> <small>${escapeHtml(t("min"))}</small>`, "is-duration")}
      </div></div>`;
    const recs = c.records.filter((x) => x.date === S.anchor);
    return `<ul class="aex-strip">${strip}</ul>${big}${recentHtml(recs, "No activity recorded on this day.", c)}`;
  }

  function periodRows(c) {
    if (S.view === "year") {
      return AC.fillMonths(c.range, c.stats.monthList).map((m) => ({
        label: String(m.month), title: `${c.range.start.slice(0, 4)}-${pad(m.month)}`,
        kcal: Math.round(num(m.totalConsume)), min: AC.minutesFromSeconds(m.totalDuration), has: m.hasData,
      }));
    }
    return AC.fillDaily(c.range, c.stats.dailyList).map((d) => ({
      label: String(+d.date.slice(8)), title: d.date,
      kcal: Math.round(num(d.realConsume)), min: AC.minutesFromSeconds(d.realDuration), has: d.hasData,
    }));
  }

  function equivHtml(c, rows) {
    const kcal = c.stats.totalConsume != null ? num(c.stats.totalConsume) : rows.reduce((s, r) => s + r.kcal, 0);
    const vol = c.stats.totalCapacity != null ? num(c.stats.totalCapacity) : 0;
    const eq = AC.equivalents(S.view, kcal, vol);
    if (!eq) return "";
    const foodTxt = eq.food === "fries" ? t("{n} servings of French fries", { n: AC.fmtServings(eq.foodCount) }) : t("{n} hamburgers", { n: AC.fmtServings(eq.foodCount) });
    const heavyTxt = eq.heavy === "cars" ? t("{n} cars lifted", { n: AC.fmtCount(eq.heavyCount) }) : t("{n} Eiffel Towers lifted", { n: AC.fmtServings(eq.heavyCount) });
    const item = (key, txt) => `<li class="aex-eq">${ILLUS[key]}<span>${escapeHtml(txt)}</span></li>`;
    return `<section class="aex-card"><h3 class="aex-h">${escapeHtml(t("Equivalent to"))}</h3><ul class="aex-eqs">${item(eq.food, foodTxt)}${item(eq.heavy, heavyTxt)}</ul></section>`;
  }

  function periodView(c) {
    const rows = periodRows(c);
    if (!rows.some((r) => r.has || r.kcal || r.min)) {
      return emptyBox("No activity recorded in this period.");
    }
    const labels = rows.map((r) => r.label), titles = rows.map((r) => r.title);
    const hK = t("Consume (kcal)"), hM = t("Duration (min)");
    const kc = rows.map((r) => r.kcal), mn = rows.map((r) => r.min);
    const hasChart = !!window.Chart;
    const table = dataTable([hK, hM], rows.map((r) => ({ title: r.title, vals: [String(r.kcal), String(r.min)] })), !hasChart);
    S.pending = hasChart ? { labels, titles, kc, mn } : null;
    const recs = S.view === "year" ? "" : recentHtml(c.records, "No activity recorded in this period.", c);
    return `<div class="aex-charts">${chartBlock("aex-c-kcal", hK, "kcal", kc, titles)}${chartBlock("aex-c-min", hM, "min", mn, titles)}</div>${table}${equivHtml(c, rows)}${recs}`;
  }

  function emptyBox(msg) {
    return `<div class="empty-state aex-empty">${ILLUS.empty}<p>${escapeHtml(t(msg))}</p></div>`;
  }

  function recentHtml(recs, emptyMsg, c) {
    const head = `<h3 class="aex-h aex-recent-h">${escapeHtml(t("Recent Activity"))}</h3>`;
    const notes = [];
    if (c && c.capped) notes.push(t("Showing the latest {n} workouts", { n: 50 }));
    if (c && c.undated) notes.push(t("{n} workouts without a valid date are not shown", { n: c.undated }));
    const note = notes.length ? `<p class="meta aex-note">${escapeHtml(notes.join(" · "))}</p>` : "";
    if (!recs.length) return `<section class="aex-recent">${head}${emptyBox(emptyMsg)}${note}</section>`;
    const items = recs.map((x, i) => {
      const r = x.rec;
      const when = String(r.startTime).slice(0, 16).replace("T", " ").replace(/\//g, "-");
      return `<li><button type="button" class="aex-rec" data-i="${i}">
        <span class="aex-rec-main"><strong>${escapeHtml(r.name || t("Workout"))}</strong><span class="meta">${escapeHtml(when)}</span></span>
        <span class="aex-rec-stats"><span>${escapeHtml(AC.fmtWeight(r.coreData, Units.get()))} ${Units.label()}</span><span>${escapeHtml(t("{n} kcal", { n: AC.fmtKcal(r.consume) }))}</span><span>${escapeHtml(AC.fmtDuration(r.duration))}</span></span>
      </button></li>`;
    }).join("");
    return `<section class="aex-recent">${head}<ul class="aex-recs">${items}</ul>${note}</section>`;
  }

  /* ---------- render ---------- */
  function currentRecords() {
    const c = S.cache;
    if (!c) return [];
    return S.view === "day" ? c.records.filter((x) => x.date === S.anchor) : c.records;
  }

  function openReport(i) {
    const x = currentRecords()[i];
    if (!x) return;
    const keep = { view: S.view, date: S.anchor, onBack: S.onBack, focus: `.aex-rec[data-i="${i}"]` };
    const r = x.rec;
    if (window.ReportUI && typeof ReportUI.open === "function") {
      const r0 = root();
      ReportUI.open(r.sportRecordId, { row: r, onBack: () => open(keep) });
      if (r0) r0.hidden = true;
    }
  }

  function renderBody() {
    const body = document.getElementById("aex-body");
    if (!body) return;
    destroyCharts();
    S.pending = null;
    body.setAttribute("aria-busy", String(S.status === "loading"));
    if (S.status === "loading") {
      body.innerHTML = `<p class="meta aex-status" role="status">${escapeHtml(t("Loading…"))}</p>`;
      return;
    }
    if (S.status === "error") {
      body.innerHTML = `<div class="server-error aex-error" role="alert">${escapeHtml(t("Failed to load: {msg}", { msg: S.error }))} <button type="button" id="aex-retry" class="secondary">${escapeHtml(t("Retry"))}</button></div>`;
      body.querySelector("#aex-retry").onclick = () => { S.refocus = "#aex-retry"; load(); };
      afterRender(body);
      return;
    }
    const c = S.cache;
    if (!c) { body.textContent = ""; return; }
    body.innerHTML = S.view === "day" ? dayView(c) : periodView(c);
    body.querySelectorAll(".aex-day").forEach((b) => (b.onclick = () => selectDay(b.dataset.date)));
    body.querySelectorAll(".aex-rec").forEach((b) => (b.onclick = () => openReport(+b.dataset.i)));
    const p = S.pending;
    if (p && window.Chart) {
      try {
        buildChart(document.getElementById("aex-c-kcal"), { labels: p.labels, titles: p.titles, values: p.kc, unit: "kcal", top: "--danger", bottom: "--warn", emptyMax: 100 });
        buildChart(document.getElementById("aex-c-min"), { labels: p.labels, titles: p.titles, values: p.mn, unit: t("min"), top: "--act-duration-2", bottom: "--act-duration", emptyMax: 10 });
      } catch (e) {
        if (window.console) console.warn("Activity explorer: chart failed, showing table", e);
        destroyCharts();
        body.querySelectorAll(".aex-chart").forEach((n) => n.remove());
        const tb = body.querySelector(".aex-tablewrap");
        if (tb) tb.classList.remove("sr-only");
      }
    }
    afterRender(body);
  }

  function afterRender(body) {
    if (S.refocus) {
      const el = root().querySelector(S.refocus);
      S.refocus = null;
      if (el && el.focus) el.focus({ preventScroll: true });
    }
  }

  /* ---------- public ---------- */
  function open(o) {
    o = o || {};
    S.view = VIEWS.includes(o.view) ? o.view : "day";
    const pd = o.date ? AC.parseDate(o.date) : null;
    const d = pd ? `${pd.y}-${pad(pd.m)}-${pad(pd.d)}` : today();
    S.anchor = d > today() ? today() : d;
    S.onBack = typeof o.onBack === "function" ? o.onBack : null;
    const r = root();
    if (!r) return;
    SIBLINGS.forEach((id) => { const el = document.getElementById(id); if (el) el.hidden = true; });
    r.hidden = false;
    buildShell();
    const want = o.focus || "#aex-title";
    S.refocus = want;
    load();
    // The caller (e.g. the report) may move focus right after onBack; settle it afterwards.
    setTimeout(() => {
      const a = document.activeElement;
      if (!r.hidden && (!a || a === document.body || !r.contains(a))) {
        const el = r.querySelector(want) || r.querySelector("#aex-title");
        if (el) el.focus({ preventScroll: true });
      }
    }, 80);
  }

  function openFromProfile() {
    switchTab("history");
    open({ view: "day", date: today(), onBack: () => switchTab("profile") });
  }

  function rerender() {
    if (!visible() || !S.anchor) return;
    buildShell();
    renderBody();
  }

  const pb = document.getElementById("profile-activity-btn");
  if (pb) pb.addEventListener("click", openFromProfile);
  if (window.I18N && Array.isArray(I18N.onChange)) I18N.onChange.push(rerender);
  document.addEventListener("themechange", () => { if (visible() && S.status === "ready") renderBody(); });

  window.ExplorerUI = { open, openFromProfile, _state: S };
})();
