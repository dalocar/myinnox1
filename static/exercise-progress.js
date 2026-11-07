/* Exercise Progress screen: DOM, API calls, IndexedDB cache, Chart.js wiring. All maths lives in
   exercise-progress-core.js. Depends on app.js globals: $, api, t, LANG, Units, currentEmail.
   Public API: window.ExerciseProgressUI = { open(actionId, {name, onBack}), close(), forgetWorkout(recordId),
   clearAll() }. Spanish strings are added to I18N.es below; the other packs hold their own entries. */
(function () {
  const Core = window.ExerciseProgressCore;
  if (!Core) return;
  const AC = window.ActivityCore, WM = window.WeightModeCore;
  if (window.I18N && I18N.es) Object.assign(I18N.es, {
    "Exercise progress": "Progreso del ejercicio",
    "Progress of {name}": "Progreso de {name}",
    "View progress of {name}": "Ver el progreso de {name}",
    "Range": "Periodo",
    "3M": "3M", "6M": "6M", "1Y": "1A",
    "Last 3 months": "Últimos 3 meses", "Last 6 months": "Últimos 6 meses", "Last year": "Último año", "All time": "Todo el historial",
    "Latest": "Último", "Personal best": "Mejor marca", "Sessions": "Sesiones", "Change since first": "Cambio desde el primero",
    "Load per cable": "Carga por cable", "Seconds": "Segundos", "Total": "Total",
    "Heaviest set per workout": "Serie más pesada por entrenamiento",
    "Best reps per workout": "Mejores repeticiones por entrenamiento",
    "Best time per workout": "Mejor tiempo por entrenamiento",
    "The chart shows the load per cable. The total for both cables is in the tooltip.": "El gráfico muestra la carga por cable. El total de ambos cables aparece en la información emergente.",
    "No history for this exercise yet": "Aún no hay historial de este ejercicio",
    "Complete a workout with this exercise and it will show up here.": "Completa un entrenamiento con este ejercicio y aparecerá aquí.",
    "No workouts in this range. Try a longer range.": "No hay entrenamientos en este periodo. Prueba un periodo más largo.",
    "Only one workout so far. Train again to see a trend.": "Solo hay un entrenamiento por ahora. Entrena de nuevo para ver una tendencia.",
    "Looking up your workouts…": "Buscando tus entrenamientos…",
    "Syncing your history… {done} of {total}": "Sincronizando tu historial… {done} de {total}",
    "Sync paused: {msg}": "Sincronización en pausa: {msg}",
    "Resume": "Reanudar",
    "The server asked us to slow down. Waiting {s} s…": "El servidor nos pide ir más despacio. Esperando {s} s…",
    "Could not load your workout history": "No se pudo cargar tu historial de entrenamientos",
    "You are offline. Showing the data saved on this device.": "Sin conexión. Mostrando los datos guardados en este dispositivo.",
    "Could not refresh. Showing the data saved on this device.": "No se pudo actualizar. Mostrando los datos guardados en este dispositivo.",
    "{n} workouts could not be loaded and will be retried next time.": "{n} entrenamientos no se pudieron cargar y se reintentarán la próxima vez.",
    "Data table": "Tabla de datos",
    "Progress data for {name}": "Datos de progreso de {name}",
    "{name}: {metric}. Line chart. {summary}": "{name}: {metric}. Gráfico de líneas. {summary}",
    "Latest {latest}, personal best {best} on {date}, {n} sessions, change since first {change}": "Último {latest}, mejor marca {best} el {date}, {n} sesiones, cambio desde el primero {change}",
    "Progress summary": "Resumen del progreso",
    "Syncing history": "Sincronizando historial",
  });

  const DB_REGISTRY = "myinnox1_progress_dbs";
  const SIZE = () => { const n = Number(window.__EP_LIST_SIZE); return Number.isFinite(n) && n >= 2 ? Math.floor(n) : Core.LIST_SIZE; };
  const reduceMotion = () => !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);

  const S = {
    open: false, actionId: null, name: "", onBack: null, range: Core.DEFAULT_RANGE,
    store: null, storeName: "", workouts: new Map(), library: null,
    sync: { status: "idle", done: 0, total: 0, failed: 0, msg: "" },
    runId: 0, syncPromise: null, chart: null, renderTimer: 0, announce: "",
  };
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const today = () => Core.localISO(new Date());
  const unit = () => (window.Units ? Units.get() : 0);
  const unitLabel = () => (window.Units ? Units.label() : "kg");
  const fmtW = (tenths) => (AC && AC.fmtWeight ? AC.fmtWeight(tenths, unit()) : UnitsCore.fmtTenths(tenths, unit()));
  const fmtN = (n) => String(Math.round(Number(n) || 0));

  // ---------- storage (IndexedDB with an in-memory fallback) ----------
  const MEM = new Map(); // dbName -> {workouts: Map, meta: Map}
  function registry() { try { return JSON.parse(localStorage.getItem(DB_REGISTRY) || "[]").filter((x) => typeof x === "string"); } catch (e) { return []; } }
  function register(name) { try { const r = registry(); if (!r.includes(name)) localStorage.setItem(DB_REGISTRY, JSON.stringify(r.concat(name))); } catch (e) { /* storage unavailable */ } }

  function memStore(name) {
    if (!MEM.has(name)) MEM.set(name, { workouts: new Map(), meta: new Map() });
    const m = MEM.get(name);
    return {
      kind: "memory", name,
      async getAll() { return [...m.workouts.values()]; },
      async put(w) { m.workouts.set(w.recordId, w); },
      async del(id) { m.workouts.delete(id); },
      async getMeta(k) { return m.meta.get(k); },
      async setMeta(k, v) { m.meta.set(k, v); },
      close() {},
    };
  }
  function idbStore(name) {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(name, 1);
      req.onupgradeneeded = () => { const db = req.result; db.createObjectStore("workouts", { keyPath: "recordId" }); db.createObjectStore("meta", { keyPath: "key" }); };
      req.onerror = () => reject(req.error || new Error("IndexedDB error"));
      req.onblocked = () => reject(new Error("IndexedDB blocked"));
      req.onsuccess = () => {
        const db = req.result;
        db.onversionchange = () => db.close();
        const run = (store, mode, fn) => new Promise((res, rej) => {
          const tx = db.transaction(store, mode);
          const r = fn(tx.objectStore(store));
          tx.oncomplete = () => res(r && "result" in r ? r.result : undefined);
          tx.onerror = () => rej(tx.error);
          tx.onabort = () => rej(tx.error || new Error("aborted"));
        });
        resolve({
          kind: "idb", name,
          getAll: () => run("workouts", "readonly", (s) => s.getAll()),
          put: (w) => run("workouts", "readwrite", (s) => s.put(w)),
          del: (id) => run("workouts", "readwrite", (s) => s.delete(id)),
          getMeta: (k) => run("meta", "readonly", (s) => s.get(k)).then((r) => (r ? r.value : undefined)),
          setMeta: (k, v) => run("meta", "readwrite", (s) => s.put({ key: k, value: v })),
          close: () => { try { db.close(); } catch (e) { /* closed */ } },
        });
      };
    });
  }

  function accountEmail() {
    try { if (typeof currentEmail !== "undefined" && currentEmail) return currentEmail; } catch (e) { /* not defined */ }
    try { return localStorage.getItem("innodigym_email") || ""; } catch (e) { return ""; }
  }
  // The store of the signed-in account (re-opened when the account changes).
  async function getStore() {
    const name = Core.dbName(accountEmail());
    if (S.store && S.storeName === name) return S.store;
    if (S.store) { S.store.close(); S.store = null; S.workouts = new Map(); S.library = null; }
    let store = null;
    if (typeof indexedDB !== "undefined" && indexedDB) { try { store = await idbStore(name); } catch (e) { store = null; } }
    if (!store) store = memStore(name);
    else register(name);
    S.store = store; S.storeName = name;
    return store;
  }

  async function loadCache(store) {
    const rows = await store.getAll();
    const map = new Map();
    for (const w of rows || []) {
      if (w && w.v === Core.SCHEMA && w.recordId > 0) map.set(w.recordId, w);
      else if (w && w.recordId != null) store.del(w.recordId).catch(() => {}); // old schema: fetch again
    }
    return map;
  }

  // ---------- API ----------
  async function call(path) {
    try {
      const res = await api(path);
      if (!res || typeof res !== "object") throw new Error("Invalid response");
      if (res.code != null && ![200, "200", 0, "0"].includes(res.code)) { const e = new Error(res.msg || "Error " + res.code); e.code = Number(res.code); throw e; }
      return res;
    } catch (e) {
      if (e && e.retryAfterRaw != null && e.retryAfter == null) e.retryAfter = Core.parseRetryAfter(e.retryAfterRaw);
      throw e;
    }
  }
  const offline = () => typeof navigator !== "undefined" && navigator.onLine === false;
  const retryOpts = (run) => ({
    shouldStop: () => run !== S.runId || offline(),
    onRetry: (attempt, delay) => { gate.delay(delay); setSync({ msg: t("The server asked us to slow down. Waiting {s} s…", { s: Math.ceil(delay / 1000) }) }); },
  });
  const gate = Core.makeGate();

  async function fetchLibrary(store) {
    const cached = await store.getMeta("library");
    if (cached && Array.isArray(cached.items)) S.library = new Map(cached.items);
    if (cached && Date.now() - cached.at < 24 * 3600 * 1000) return;
    try {
      const items = new Map();
      const add = (arr) => { for (const a of Array.isArray(arr) ? arr : []) if (a && a.id != null) items.set(String(a.id), { sideNum: a.sideNum == null ? null : Number(a.sideNum), countType: a.countType == null ? null : Number(a.countType), name: a.name == null ? "" : String(a.name) }); };
      add((await call("/action/list")).data);
      try { add((await call("/action/list?custom=true")).data); } catch (e) { /* custom actions are optional */ }
      S.library = items;
      await store.setMeta("library", { at: Date.now(), items: [...items] });
      scheduleRender(true);
    } catch (e) { /* keep the cached library, or none: modes stay unknown */ }
  }

  // ---------- sync ----------
  function setSync(patch) { Object.assign(S.sync, patch); renderSync(); }

  async function listWindow(win, run) {
    const q = `/sport/record/list?startTime=${encodeURIComponent(win.start)}&endTime=${encodeURIComponent(win.end)}&size=${SIZE()}`;
    return Core.withRetry(async () => {
      await gate.wait();
      const data = (await call(q)).data;
      if (data != null && !Array.isArray(data)) throw new Error("Invalid response");
      return data || [];
    }, retryOpts(run));
  }

  function startSync() {
    const run = ++S.runId;
    const prev = S.syncPromise;
    S.syncPromise = (async () => {
      try { if (prev) await prev; } catch (e) { /* previous run is over */ }
      if (run !== S.runId) return;
      await doSync(run);
    })();
    return S.syncPromise;
  }

  async function doSync(run) {
    const store = S.store;
    const stopped = () => run !== S.runId;
    const hasCache = () => S.workouts.size > 0;
    if (offline()) { setSync({ status: "offline", msg: "" }); return; }
    setSync({ status: "listing", done: 0, total: 0, failed: 0, msg: "" });
    fetchLibrary(store);
    let enumerated;
    try {
      const meta = (await store.getMeta("sync")) || {};
      const have = S.workouts;
      enumerated = await Core.enumerateRecords({
        today: today(), size: SIZE(),
        fetchWindow: (w) => listWindow(w, run),
        stopWhenKnown: meta.complete ? (rows) => rows.every((r) => have.has(Number(r.sportRecordId))) : null,
      });
    } catch (e) {
      if (stopped()) return;
      if (hasCache()) setSync({ status: offline() ? "offline" : "stale", msg: "" });
      else setSync({ status: "error", msg: e && e.message ? String(e.message) : "" });
      return;
    }
    if (stopped()) return;
    const cached = new Map([...S.workouts].map(([id, w]) => [id, w.startTime]));
    const diff = Core.diffIds(enumerated.rows, cached, { coveredFrom: enumerated.coveredFrom });
    for (const id of diff.stale) { S.workouts.delete(id); store.del(id).catch(() => {}); }
    if (diff.stale.length) scheduleRender(true);
    setSync({ status: "fetching", done: 0, total: diff.toFetch.length, failed: 0, msg: "" });
    let lastErr = "";
    const res = await Core.runPool(diff.toFetch, async (row) => {
      await gate.wait();
      if (stopped()) return;
      let r;
      try {
        r = await Core.withRetry(() => call("/sport/record/detail?recordId=" + encodeURIComponent(row.recordId)), retryOpts(run));
      } catch (e) {
        if (stopped()) return;
        lastErr = e && e.message ? String(e.message) : "";
        if (Core.isTransport(e)) e.pause = true; // 429 / 5xx / network: stop and let the user resume
        throw e;
      }
      if (stopped()) return;
      const sum = Core.summarizeWorkout(r.data);
      if (!sum) { const e = new Error("Unreadable workout"); e.fatal = true; throw e; }
      await store.put(sum);
      S.workouts.set(sum.recordId, sum);
      S.sync.done++; S.sync.msg = "";
      scheduleRender(false);
      renderSyncSoon();
    }, {
      concurrency: Core.CONCURRENCY,
      shouldStop: stopped,
      onResult: (r) => { if (!r.ok) S.sync.failed++; },
    });
    if (stopped()) return;
    S.sync.failed = res.failed;
    if (res.paused) { setSync({ status: "paused", msg: lastErr }); scheduleRender(true); return; }
    if (res.failed === 0) await store.setMeta("sync", { complete: true, at: Date.now() });
    S.announce = "sync";
    setSync({ status: "done", msg: "" });
    scheduleRender(true);
  }

  // ---------- view model ----------
  function modeFor(actionId) {
    const e = S.library && S.library.get(String(actionId));
    return e ? { sideNum: e.sideNum, countType: e.countType } : null;
  }
  function series() {
    return Core.buildSeries([...S.workouts.values()], S.actionId, { range: S.range, today: today(), mode: modeFor(S.actionId) });
  }
  function metricLabel(s) {
    if (s.kind === "seconds") return t("Seconds");
    if (s.kind === "reps") return t("Reps");
    return s.modeKey === "combined" ? t("Load per cable") : t("Weight");
  }
  const withUnit = (label, s) => (s.kind === "weight" ? `${label} (${unitLabel()})` : label);
  function heading(s) {
    return s.kind === "weight" ? t("Heaviest set per workout") : s.kind === "seconds" ? t("Best time per workout") : t("Best reps per workout");
  }
  const val = (s, v) => (s.kind === "weight" ? `${fmtW(v)} ${unitLabel()}` : fmtN(v) + (s.kind === "seconds" ? " s" : ""));
  const yOf = (s, p) => (s.kind === "weight" ? UnitsCore.fromTenths(p.value, unit()) : p.value);
  function changeText(s) {
    const c = s.summary.change, sign = c.abs > 0 ? "+" : c.abs < 0 ? "−" : "";
    const mag = Math.abs(c.abs);
    const abs = s.kind === "weight" ? `${fmtW(mag)} ${unitLabel()}` : fmtN(mag) + (s.kind === "seconds" ? " s" : "");
    const pct = c.pct == null ? "" : ` (${sign}${Math.abs(c.pct).toFixed(1).replace(/\.0$/, "")}%)`;
    return `${sign}${abs}${pct}`;
  }
  function summaryText(s) {
    if (!s.summary) return "";
    return t("Latest {latest}, personal best {best} on {date}, {n} sessions, change since first {change}", {
      latest: val(s, s.summary.latest.value), best: val(s, s.summary.best.value), date: s.summary.best.date, n: s.summary.sessions, change: changeText(s),
    });
  }

  // ---------- rendering ----------
  let nodes = null;
  function scheduleRender(now) {
    if (!S.open) return;
    if (now) { clearTimeout(S.renderTimer); S.renderTimer = 0; renderData(); return; }
    if (S.renderTimer) return;
    S.renderTimer = setTimeout(() => { S.renderTimer = 0; renderData(); }, 700);
  }
  let syncTimer = 0;
  function renderSyncSoon() { if (syncTimer) return; syncTimer = setTimeout(() => { syncTimer = 0; renderSync(); }, 150); }

  function build() {
    const root = $("ex-progress");
    root.textContent = "";
    root.className = "exp-root";
    root.setAttribute("aria-labelledby", "exp-title");
    const bar = el("div", "exp-bar");
    const back = el("button", "exp-back secondary");
    back.type = "button";
    back.setAttribute("aria-label", t("Back"));
    back.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>';
    back.addEventListener("click", goBack);
    const titles = el("div", "exp-titles");
    const h = el("h2", "exp-title");
    h.id = "exp-title"; h.tabIndex = -1;
    const sub = el("p", "exp-sub");
    titles.append(h, sub);
    bar.append(back, titles);

    const syncBox = el("div", "exp-sync");
    syncBox.hidden = true;
    const live = el("div", "sr-only");
    live.setAttribute("role", "status"); live.setAttribute("aria-live", "polite");

    const ranges = el("div", "exp-ranges");
    ranges.setAttribute("role", "group"); ranges.setAttribute("aria-label", t("Range"));
    const aria = { "3M": "Last 3 months", "6M": "Last 6 months", "1Y": "Last year", All: "All time" };
    for (const r of Core.RANGES) {
      const b = el("button", "exp-range secondary", t(r));
      b.type = "button"; b.dataset.range = r;
      b.setAttribute("aria-label", t(aria[r]));
      b.addEventListener("click", () => { S.range = r; S.announce = "range"; scheduleRender(true); });
      ranges.appendChild(b);
    }
    const stats = el("div", "exp-stats");
    stats.setAttribute("role", "group"); stats.setAttribute("aria-label", t("Progress summary"));

    const card = el("section", "exp-card");
    const ch = el("h3", "exp-h");
    const note = el("p", "exp-note");
    const msg = el("p", "exp-msg"); msg.hidden = true;
    const wrap = el("div", "exp-chart");
    const canvas = document.createElement("canvas");
    wrap.appendChild(canvas);
    card.append(ch, note, wrap, msg);

    const det = el("details", "exp-data");
    const sum = el("summary", null, t("Data table"));
    const tw = el("div", "exp-tablewrap");
    det.append(sum, tw);
    root.append(bar, syncBox, live, ranges, stats, card, det);
    nodes = { root, title: h, sub, syncBox, live, ranges, stats, card, ch, note, msg, wrap, canvas, det, tw };
  }

  function renderSync() {
    if (!nodes || !S.open) return;
    const sy = S.sync, box = nodes.syncBox;
    box.textContent = "";
    box.classList.remove("is-error");
    if (sy.status === "listing" || sy.status === "fetching") {
      box.hidden = false;
      const text = sy.msg || (sy.status === "listing" ? t("Looking up your workouts…") : t("Syncing your history… {done} of {total}", { done: sy.done, total: sy.total }));
      box.appendChild(el("p", "exp-sync-text", text));
      if (sy.status === "fetching" && sy.total > 0) {
        const bar = el("div", "exp-progress");
        bar.setAttribute("role", "progressbar");
        bar.setAttribute("aria-label", t("Syncing history"));
        bar.setAttribute("aria-valuemin", "0"); bar.setAttribute("aria-valuemax", String(sy.total)); bar.setAttribute("aria-valuenow", String(sy.done));
        const fill = el("div", "exp-progress-fill");
        fill.style.width = Math.min(100, Math.round((sy.done / sy.total) * 100)) + "%";
        bar.appendChild(fill);
        box.appendChild(bar);
      }
    } else if (sy.status === "paused") {
      box.hidden = false; box.classList.add("is-error");
      box.appendChild(el("p", "exp-sync-text", t("Sync paused: {msg}", { msg: sy.msg || t("Could not load your workout history") })));
      box.appendChild(el("p", "exp-sync-sub", t("Syncing your history… {done} of {total}", { done: sy.done, total: sy.total })));
      const b = el("button", "secondary", t("Resume")); b.type = "button";
      b.addEventListener("click", () => { startSync(); });
      box.appendChild(b);
    } else if (sy.status === "error") {
      box.hidden = false; box.classList.add("is-error");
      box.setAttribute("role", "alert");
      box.appendChild(el("p", "exp-sync-text", t("Could not load your workout history")));
      if (sy.msg) box.appendChild(el("p", "exp-sync-sub", sy.msg));
      const b = el("button", "secondary", t("Retry")); b.type = "button";
      b.addEventListener("click", () => { startSync(); });
      box.appendChild(b);
    } else if (sy.status === "offline" || sy.status === "stale") {
      box.hidden = false;
      box.appendChild(el("p", "exp-sync-text", sy.status === "offline" ? t("You are offline. Showing the data saved on this device.") : t("Could not refresh. Showing the data saved on this device.")));
    } else if (sy.status === "done" && sy.failed > 0) {
      box.hidden = false;
      box.appendChild(el("p", "exp-sync-text", t("{n} workouts could not be loaded and will be retried next time.", { n: sy.failed })));
    } else {
      box.hidden = true;
    }
    if (sy.status !== "error") box.removeAttribute("role");
  }

  function stat(label, value, sub) {
    const d = el("div", "exp-stat");
    d.append(el("div", "exp-stat-v", value), el("div", "exp-stat-l", label));
    if (sub) d.appendChild(el("div", "exp-stat-s", sub));
    return d;
  }

  function destroyChart() { if (S.chart) { try { S.chart.destroy(); } catch (e) { /* gone */ } S.chart = null; } }
  const cssVar = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  const dateTick = (dn) => {
    try { return new Intl.DateTimeFormat(LANG(), { month: "short", year: "2-digit", timeZone: "UTC" }).format(new Date(Math.round(dn) * 86400000)); } catch (e) { return Core.fromDayNumber(Math.round(dn)); }
  };

  function drawChart(s) {
    destroyChart();
    if (!window.Chart || s.isEmpty) return false;
    const primary = cssVar("--primary"), surface = cssVar("--surface"), muted = cssVar("--muted"), grid = cssVar("--border"), warn = cssVar("--warn"), soft = cssVar("--primary-soft");
    const pts = s.points, bestV = s.summary.best.value;
    Chart.defaults.font.family = getComputedStyle(document.body).fontFamily;
    const xs = pts.map((p) => p.x);
    let min = Math.min.apply(null, xs), max = Math.max.apply(null, xs);
    const pad = pts.length === 1 ? 7 : Math.max(1, (max - min) * 0.03);
    min -= pad; max += pad;
    const many = pts.length > 80;
    S.chart = new Chart(nodes.canvas, {
      type: "line",
      data: { datasets: [{
        data: pts.map((p) => ({ x: p.x, y: yOf(s, p) })),
        borderColor: primary, backgroundColor: soft, borderWidth: 2, fill: false, tension: 0.15,
        pointRadius: many ? 2 : 4, pointHoverRadius: 7, pointBorderWidth: 2, pointBorderColor: primary,
        pointBackgroundColor: pts.map((p) => (p.value === bestV ? warn : surface)),
      }] },
      options: {
        responsive: true, maintainAspectRatio: false, parsing: false,
        animation: reduceMotion() || S.sync.status === "fetching" ? false : { duration: 300 },
        interaction: { mode: "nearest", intersect: false, axis: "x" },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              title: (items) => pts[items[0].dataIndex].startTime.slice(0, 16),
              label: (item) => {
                const p = pts[item.dataIndex], out = [];
                out.push(`${metricLabel(s)}: ${val(s, p.value)}`);
                if (s.showTotal) out.push(`${t("Total")}: ${fmtW(p.total)} ${unitLabel()}`);
                if (s.kind === "weight") out.push(`${t("Reps")}: ${fmtN(p.reps)}`);
                out.push(`${t("Sets")}: ${fmtN(p.sets)}`);
                return out;
              },
            },
          },
        },
        scales: {
          x: { type: "linear", min, max, grid: { display: false }, border: { color: grid }, ticks: { color: muted, maxRotation: 0, maxTicksLimit: 6, font: { size: 11 }, callback: (v) => dateTick(v) } },
          y: { beginAtZero: false, grace: "10%", grid: { color: grid }, border: { display: false }, ticks: { color: muted, font: { size: 11 }, maxTicksLimit: 6 },
            title: { display: true, color: muted, text: withUnit(metricLabel(s), s), font: { size: 11 } } },
        },
      },
    });
    return true;
  }

  function renderTable(s) {
    const tw = nodes.tw;
    tw.textContent = "";
    if (s.isEmpty) return;
    const tbl = el("table", "exp-table");
    const cap = el("caption", "sr-only", t("Progress data for {name}", { name: S.name || s.name }));
    const cols = [t("Date"), withUnit(metricLabel(s), s)];
    if (s.showTotal) cols.push(withUnit(t("Total"), s));
    if (s.kind === "weight") cols.push(t("Reps"));
    cols.push(t("Sets"));
    const thead = el("thead"), hr = el("tr");
    cols.forEach((c) => { const th = el("th", null, c); th.scope = "col"; hr.appendChild(th); });
    thead.appendChild(hr);
    const tb = el("tbody");
    for (const p of s.points.slice().reverse()) {
      const tr = el("tr");
      const d = el("th", null, p.startTime.slice(0, 16)); d.scope = "row"; tr.appendChild(d);
      tr.appendChild(el("td", null, s.kind === "weight" ? fmtW(p.value) : fmtN(p.value)));
      if (s.showTotal) tr.appendChild(el("td", null, fmtW(p.total)));
      if (s.kind === "weight") tr.appendChild(el("td", null, fmtN(p.reps)));
      tr.appendChild(el("td", null, fmtN(p.sets)));
      tb.appendChild(tr);
    }
    tbl.append(cap, thead, tb);
    tw.appendChild(tbl);
  }

  function renderData() {
    if (!nodes || !S.open) return;
    const s = series();
    const title = S.name || s.name || t("Exercise progress");
    nodes.title.textContent = title;
    nodes.root.setAttribute("aria-label", t("Progress of {name}", { name: title }));
    // mode line
    const modeLabel = s.modeKey === "combined" ? t("Combined") : s.modeKey === "per-side" ? t("Per side") : "";
    nodes.sub.textContent = modeLabel;
    nodes.sub.hidden = !modeLabel;
    for (const b of nodes.ranges.children) b.setAttribute("aria-pressed", String(b.dataset.range === S.range));
    nodes.ranges.hidden = !s.hasAny;

    // summary stats
    nodes.stats.textContent = "";
    nodes.stats.hidden = s.isEmpty;
    if (!s.isEmpty) {
      const sm = s.summary;
      nodes.stats.append(
        stat(t("Latest"), val(s, sm.latest.value), sm.latest.date),
        stat(t("Personal best"), val(s, sm.best.value), sm.best.date),
        stat(t("Sessions"), String(sm.sessions)),
        stat(t("Change since first"), changeText(s), sm.first.date)
      );
    }

    // chart card
    nodes.ch.textContent = heading(s);
    nodes.note.textContent = s.showTotal ? t("The chart shows the load per cable. The total for both cables is in the tooltip.") : "";
    nodes.note.hidden = !s.showTotal;
    const syncing = S.sync.status === "listing" || S.sync.status === "fetching";
    let message = "";
    if (!s.hasAny) message = syncing ? t("Loading…") : (S.sync.status === "idle" ? t("Loading…") : t("No history for this exercise yet"));
    else if (s.isEmpty) message = t("No workouts in this range. Try a longer range.");
    else if (s.isSingle) message = t("Only one workout so far. Train again to see a trend.");
    const sub2 = !s.hasAny && !syncing && S.sync.status !== "idle" ? t("Complete a workout with this exercise and it will show up here.") : "";
    nodes.msg.textContent = "";
    if (message) { nodes.msg.appendChild(el("span", "exp-msg-main", message)); if (sub2) nodes.msg.appendChild(el("span", "exp-msg-sub", sub2)); }
    nodes.msg.hidden = !message;
    nodes.card.classList.toggle("is-empty", s.isEmpty);
    const drew = drawChart(s);
    nodes.wrap.hidden = !drew;
    const summary = summaryText(s);
    nodes.canvas.setAttribute("role", "img");
    nodes.canvas.setAttribute("aria-label", t("{name}: {metric}. Line chart. {summary}", { name: title, metric: withUnit(metricLabel(s), s), summary }));
    renderTable(s);
    nodes.det.hidden = s.isEmpty;
    nodes.det.open = nodes.det.open || (!window.Chart && !s.isEmpty);
    if (S.announce && summary) { nodes.live.textContent = summary; }
    S.announce = "";
    renderSync();
  }

  function render(focus) {
    if (!S.open) return;
    build();
    renderData();
    if (focus) nodes.title.focus({ preventScroll: true });
  }

  // ---------- open / close ----------
  const SIBLINGS = ["act-dashboard", "act-medals", "act-explorer", "act-report"];
  let observer = null;

  function onKey(e) {
    if (e.key !== "Escape" || e.defaultPrevented || !S.open) return;
    const open = document.querySelector("dialog[open], .modal:not([hidden])");
    if (open) return;
    e.preventDefault();
    goBack();
  }

  function shutdown() {
    S.runId++;                 // stops the sync: finished requests are still saved, the rest resumes next time
    S.open = false;
    clearTimeout(S.renderTimer); S.renderTimer = 0;
    destroyChart();
    document.removeEventListener("keydown", onKey);
    if (observer) { observer.disconnect(); observer = null; }
  }
  function close() {
    shutdown();
    const root = $("ex-progress");
    if (root) { root.hidden = true; root.textContent = ""; }
    nodes = null;
  }
  function goBack() {
    const cb = S.onBack;
    close();
    if (typeof cb === "function") cb();
  }

  async function open(actionId, opts) {
    opts = opts || {};
    const root = $("ex-progress");
    if (!root) return;
    S.actionId = actionId; S.name = opts.name ? String(opts.name) : ""; S.onBack = opts.onBack || null;
    S.range = Core.DEFAULT_RANGE; S.open = true; S.announce = "";
    S.sync = { status: "idle", done: 0, total: 0, failed: 0, msg: "" };
    SIBLINGS.forEach((id) => { const n = $(id); if (n) n.hidden = true; });
    root.hidden = false;
    document.removeEventListener("keydown", onKey);
    document.addEventListener("keydown", onKey);
    if (observer) observer.disconnect();
    if (window.MutationObserver) {
      // Another view took over the tab (e.g. History re-shown from the tab bar): stop syncing.
      observer = new MutationObserver(() => { if (root.hidden && S.open) shutdown(); });
      observer.observe(root, { attributes: true, attributeFilter: ["hidden"] });
    }
    render(true);
    try { root.scrollIntoView({ block: "start" }); } catch (e) { /* ignore */ }
    let store;
    try { store = await getStore(); } catch (e) { return; }
    if (!S.open) return;
    try { S.workouts = await loadCache(store); } catch (e) { S.workouts = new Map(); }
    const lib = await store.getMeta("library").catch(() => null);
    if (lib && Array.isArray(lib.items)) S.library = new Map(lib.items);
    if (!S.open) return;
    scheduleRender(true);
    startSync();
  }

  // ---------- lifecycle hooks used by app.js ----------
  async function forgetWorkout(recordId) {
    const id = Number(recordId);
    if (!(id > 0)) return;
    try {
      const store = await getStore();
      S.workouts.delete(id);
      await store.del(id);
      if (S.open) scheduleRender(true);
    } catch (e) { /* cache is optional */ }
  }

  // Logout: stop everything and delete every progress database of this browser (all accounts).
  async function clearAll() {
    S.runId++;
    if (S.store) { S.store.close(); S.store = null; }
    S.workouts = new Map(); S.library = null; S.storeName = "";
    const names = new Set(registry());
    try { if (indexedDB && indexedDB.databases) (await indexedDB.databases()).forEach((d) => { if (d && d.name) names.add(d.name); }); } catch (e) { /* not supported */ }
    for (const k of [...MEM.keys()]) names.add(k);
    MEM.clear();
    await Promise.all([...names].filter((n) => n.startsWith(Core.DB_PREFIX)).map((n) => new Promise((res) => {
      if (typeof indexedDB === "undefined" || !indexedDB) return res();
      try {
        const r = indexedDB.deleteDatabase(n);
        r.onsuccess = r.onerror = r.onblocked = () => res();
        setTimeout(res, 1500);
      } catch (e) { res(); }
    })));
    try { localStorage.removeItem(DB_REGISTRY); } catch (e) { /* ignore */ }
  }

  const rerender = () => { if (S.open && nodes) render(false); };
  if (window.I18N && Array.isArray(I18N.onChange)) I18N.onChange.push(rerender);
  if (window.Units) Units.onChange(rerender);
  document.addEventListener("themechange", () => { if (S.open && nodes) renderData(); });

  window.ExerciseProgressUI = { open, close, forgetWorkout, clearAll, _state: S };
})();
