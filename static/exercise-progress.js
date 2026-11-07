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
    "Latest {latest}, personal best {best} on {date}, {sessions}, change since first {change}": "Último {latest}, mejor marca {best} el {date}, {sessions}, cambio desde el primero {change}",
    "Progress summary": "Resumen del progreso",
    "Waiting {s} s (rate limit)": "Esperando {s} s (límite de peticiones)",
    "Syncing in another tab": "Sincronizando en otra pestaña",
    "Sync paused: the server's rate limit was reached. Resume when the countdown ends.": "Sincronización en pausa: se alcanzó el límite de peticiones del servidor. Reanuda cuando termine la cuenta atrás.",
    "{n} session": "{n} sesión", "{n} sessions": "{n} sesiones",
    "{n} in this range": "{n} en este periodo",
    "No history is saved on this device yet.": "Todavía no hay historial guardado en este dispositivo.",
    "You are offline, and no history is saved on this device yet.": "Sin conexión, y aún no hay historial guardado en este dispositivo.",
    "Some history may be missing: the server limits how many workouts it returns.": "Puede faltar historial: el servidor limita cuántos entrenamientos devuelve.",
    "The server is busy or unreachable. Try again in a moment.": "El servidor está ocupado o no responde. Inténtalo de nuevo en un momento.",
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
  async function call(path, opts) {
    try {
      const res = await api(path, opts || {});
      if (!res || typeof res !== "object") throw new Error("Invalid response");
      if (res.code != null && ![200, "200", 0, "0"].includes(res.code)) { const e = new Error(res.msg || "Error " + res.code); e.code = Number(res.code); throw e; }
      return res;
    } catch (e) {
      if (e && e.retryAfterRaw != null && e.retryAfter == null) e.retryAfter = Core.parseRetryAfter(e.retryAfterRaw);
      throw e;
    }
  }
  const offline = () => typeof navigator !== "undefined" && navigator.onLine === false;
  // QA hook: window.__EP_RETRY_SCALE (e.g. 0.05) shrinks the backoff waits so failure paths can be tested quickly.
  const scale = () => { const n = Number(window.__EP_RETRY_SCALE); return Number.isFinite(n) && n >= 0 && n <= 1 ? n : 1; };
  const nap = (ms) => new Promise((r) => setTimeout(r, ms * scale()));
  const retryOpts = (run) => ({
    sleep: nap,
    shouldStop: () => run !== S.runId || offline(),
    onRetry: (attempt, delay, err) => { if (err && err.rateLimited) return; gate.delay(delay * scale()); setSync({ msg: t("The server asked us to slow down. Waiting {s} s…", { s: Math.ceil(delay / 1000) }) }); },
  });
  const gate = Core.makeGate();

  // Every sync request goes through the pacer (WAF budget, see exercise-progress-core.js). Any HTTP 429 is a block:
  // tab-wide cooldown, then half rate; a second block in the same sync pauses it.
  let ticker = 0;
  function startTicker() {
    if (ticker) return;
    ticker = setInterval(() => {
      if (!S.open || Core.requestLog.cooldownUntil <= Date.now()) { clearInterval(ticker); ticker = 0; }
      renderSync();
    }, 1000);
  }
  async function pacedCall(path, run, pacer) {
    return Core.withRetry(async () => {
      await gate.wait();
      const started = await pacer.acquire(() => run !== S.runId, (ms, why) => { if (why === "cooldown") startTicker(); });
      if (started == null) { const e = new Error("stopped"); e.fatal = true; e.stopped = true; throw e; }
      try {
        return await call(path, { paced: true });
      } catch (e) {
        if (e && Number(e.status) === 429) {
          const b = pacer.block(e.retryAfter, started);
          if (b.second) { pacer.halt(); e.pause = true; e.fatal = true; } else e.rateLimited = true;
          startTicker(); renderSync();
        }
        throw e;
      }
    }, Object.assign(retryOpts(run), {
      isRetryable: (e) => !(e && e.fatal) && ((e && e.rateLimited) || Core.isRetryable(e)),
      delayFor: (e) => (e && e.rateLimited ? 0 : null), // the pacer itself waits out the cooldown
    }));
  }

  async function fetchLibrary(store, run, pacer) {
    const cached = await store.getMeta("library");
    if (cached && Array.isArray(cached.items)) S.library = new Map(cached.items);
    if (cached && Date.now() - cached.at < 24 * 3600 * 1000) return;
    try {
      const items = new Map();
      const add = (arr) => { for (const a of Array.isArray(arr) ? arr : []) if (a && a.id != null) items.set(String(a.id), { sideNum: a.sideNum == null ? null : Number(a.sideNum), countType: a.countType == null ? null : Number(a.countType), name: a.name == null ? "" : String(a.name) }); };
      add((await pacedCall("/action/list", run, pacer)).data);
      try { add((await pacedCall("/action/list?custom=true", run, pacer)).data); } catch (e) { if (e && (e.pause || e.stopped)) throw e; /* custom actions are optional */ }
      S.library = items;
      await store.setMeta("library", { at: Date.now(), items: [...items] });
      scheduleRender(true);
    } catch (e) { if (e && e.pause) throw e; /* keep the cached library, or none: modes stay unknown */ }
  }

  // ---------- sync ----------
  function setSync(patch) {
    const prev = S.sync.status;
    Object.assign(S.sync, patch);
    // A state change (error, offline, paused, done) also changes what the chart card may say.
    if (patch.status && patch.status !== prev && patch.status !== "listing" && patch.status !== "fetching") scheduleRender(true);
    else renderSync();
  }

  async function listWindow(win, run, pacer) {
    const q = `/sport/record/list?startTime=${encodeURIComponent(win.start)}&endTime=${encodeURIComponent(win.end)}&size=${SIZE()}`;
    const data = (await pacedCall(q, run, pacer)).data;
    if (data != null && !Array.isArray(data)) throw new Error("Invalid response");
    return data || [];
  }

  function startSync() {
    const run = ++S.runId;
    const prev = S.syncPromise;
    S.syncPromise = (async () => {
      try { if (prev) await prev; } catch (e) { /* previous run is over */ }
      if (run !== S.runId) return;
      await syncWithLock(run);
    })();
    return S.syncPromise;
  }

  // One tab syncs at a time (Web Locks). Other tabs show "Syncing in another tab", wait for the lock to be free, then
  // re-read the cache and run their own (normally cheap: one list call, no details) sync. No Web Locks: just sync.
  const LOCK = "myinnox1-ep-sync";
  async function syncWithLock(run) {
    const L = typeof navigator !== "undefined" && navigator.locks && typeof navigator.locks.request === "function" ? navigator.locks : null;
    if (!L) return doSync(run);
    let ran = false;
    try {
      await L.request(LOCK, { ifAvailable: true }, async (lock) => { if (!lock) return; ran = true; await doSync(run); });
    } catch (e) { if (!ran) return doSync(run); return; }
    if (ran || run !== S.runId) return;
    setSync({ status: "elsewhere", msg: "" });
    const ac = typeof AbortController !== "undefined" ? new AbortController() : null;
    S.lockAbort = ac;
    // While the other tab syncs, re-read the cache every 5 s so this view fills in too (cheap, local).
    const refresh = setInterval(async () => {
      if (run !== S.runId || !S.open) return clearInterval(refresh);
      try { S.workouts = await loadCache(S.store); scheduleRender(false); } catch (e) { /* ignore */ }
    }, 5000);
    try { await L.request(LOCK, ac ? { signal: ac.signal } : {}, async () => {}); } catch (e) { clearInterval(refresh); return; } // aborted on leave
    clearInterval(refresh);
    if (run !== S.runId || !S.open) return;
    try { S.workouts = await loadCache(S.store); } catch (e) { /* keep what we have */ }
    scheduleRender(true);
    startSync();
  }

  async function doSync(run) {
    const store = S.store;
    const stopped = () => run !== S.runId;
    const hasCache = () => S.workouts.size > 0;
    if (offline()) { setSync({ status: "offline", msg: "" }); return; }
    setSync({ status: "listing", done: 0, total: 0, failed: 0, msg: "", reason: "" });
    const pacer = Core.makePacer();
    let enumerated;
    try {
      // Library first and awaited, through the same pacer, so no more than one request is in flight before the pool.
      await fetchLibrary(store, run, pacer);
      // One wide call lists the whole history (measured: size is honoured, newest first, unlimited depth).
      enumerated = await Core.enumerateRecords({ size: SIZE(), fetchWindow: (w) => listWindow(w, run, pacer) });
    } catch (e) {
      if (stopped()) return;
      if (e && e.pause) { setSync({ status: "paused", msg: "", reason: Number(e.status) === 429 ? "ratelimit" : "" }); return; }
      if (hasCache()) setSync({ status: offline() ? "offline" : "stale", msg: "" });
      else setSync({ status: "error", msg: e && e.message ? String(e.message) : "" });
      return;
    }
    if (stopped()) return;
    const cached = new Map([...S.workouts].map(([id, w]) => [id, w.startTime]));
    // Every successful full listing purges workouts that are no longer listed (deleted elsewhere); never from an
    // empty, failed (it throws before this point) or saturated (possibly cut) listing.
    const diff = Core.diffIds(enumerated.rows, cached, { coveredFrom: enumerated.saturated || !enumerated.rows.length ? null : enumerated.coveredFrom });
    // N4: a purge of more than max(5, 20 %) of the cache in one go is suspicious (cap or partial answer): skip, log it.
    // N7: a large purge is confirmed by a second complete listing at least 10 minutes later (meta "purgePending").
    if (!enumerated.saturated && enumerated.rows.length) {
      const pending = await store.getMeta("purgePending").catch(() => null);
      const d = Core.decidePurge(diff.stale, cached.size, pending, Date.now());
      if (d.pending && (!pending || d.pending.seenAt !== pending.seenAt)) {
        store.setMeta("purgeSkipped", { at: Date.now(), stale: d.pending.ids.length, cached: cached.size, listed: enumerated.rows.length }).catch(() => {});
      }
      await store.setMeta("purgePending", d.pending).catch(() => {});
      diff.stale = d.purge;
    }
    for (const id of diff.stale) { S.workouts.delete(id); store.del(id).catch(() => {}); }
    if (diff.stale.length) scheduleRender(true);
    setSync({ status: "fetching", done: 0, total: diff.toFetch.length, failed: 0, msg: "", saturated: !!enumerated.saturated });
    let lastErr = "";
    const res = await Core.runPool(diff.toFetch, async (row) => {
      await gate.wait();
      if (stopped()) return;
      let r;
      try {
        r = await pacedCall("/sport/record/detail?recordId=" + encodeURIComponent(row.recordId), run, pacer);
      } catch (e) {
        if (stopped() || (e && e.stopped)) return;
        lastErr = e && e.message ? String(e.message) : "";
        if (e && Number(e.status) === 429) S.sync.reason = "ratelimit";
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
    if (res.paused) { setSync({ status: "paused", msg: lastErr }); return; }
    await store.setMeta("sync", { complete: res.failed === 0 && !enumerated.saturated, at: Date.now() });
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
  function fmtPct(v) {
    try { return new Intl.NumberFormat(LANG(), { maximumFractionDigits: 1 }).format(v); } catch (e) { return String(v); }
  }
  function fmtDate(iso) {
    try { const d = Core.parseDate(iso); return new Intl.DateTimeFormat(LANG(), { dateStyle: "medium", timeZone: "UTC" }).format(new Date(Date.UTC(d.y, d.m - 1, d.d))); } catch (e) { return iso; }
  }
  function changeText(s) {
    if (s.summary.sessions < 2) return "—"; // one session: nothing to compare yet
    const c = s.summary.change, sign = c.abs > 0 ? "+" : c.abs < 0 ? "−" : "";
    const mag = Math.abs(c.abs);
    const abs = s.kind === "weight" ? `${fmtW(mag)} ${unitLabel()}` : fmtN(mag) + (s.kind === "seconds" ? " s" : "");
    const pct = c.pct == null ? "" : ` (${sign}${fmtPct(Math.abs(c.pct))}%)`;
    return `${sign}${abs}${pct}`;
  }
  function summaryText(s) {
    if (!s.summary) return "";
    return t("Latest {latest}, personal best {best} on {date}, {sessions}, change since first {change}", {
      latest: val(s, s.summary.latest.value), best: val(s, s.summary.best.value), date: fmtDate(s.summary.best.date), sessions: t(s.summary.sessions === 1 ? "{n} session" : "{n} sessions", { n: s.summary.sessions }), change: changeText(s),
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
    const syncLive = el("div", "sr-only");
    syncLive.setAttribute("aria-live", "polite"); syncLive.className = "sr-only exp-sync-live";
    ann.cd = ""; ann.status = "";

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
    tw.tabIndex = 0; tw.setAttribute("role", "region"); tw.setAttribute("aria-label", t("Data table"));
    det.append(sum, tw);
    root.append(bar, syncBox, live, syncLive, ranges, stats, card, det);
    nodes = { root, title: h, sub, syncBox, live, syncLive, ranges, stats, card, ch, note, msg, wrap, canvas, det, tw };
  }

  // Screen-reader announcements for the sync, throttled: cooldown start, 5 s left, resume after the cooldown, and
  // status changes (paused, other tab, done with problems). The visual banner itself is not a live region.
  const ann = { cd: "", status: "" };
  function announceSync(sy, wait, waitText) {
    if (!nodes || !nodes.syncLive) return;
    let msg = "";
    if (wait > 0) {
      if (!ann.cd) { ann.cd = "start"; msg = waitText; }
      else if (wait <= 5 && ann.cd === "start") { ann.cd = "5"; msg = waitText; }
    } else if (ann.cd) {
      ann.cd = "";
      if (sy.status === "fetching" || sy.status === "listing") msg = t("Syncing your history… {done} of {total}", { done: sy.done, total: sy.total });
    }
    if (sy.status !== ann.status) {
      ann.status = sy.status;
      if (sy.status === "paused") msg = sy.reason === "ratelimit" ? t("Sync paused: the server's rate limit was reached. Resume when the countdown ends.") : t("Sync paused: {msg}", { msg: t("The server is busy or unreachable. Try again in a moment.") });
      else if (sy.status === "elsewhere") msg = t("Syncing in another tab");
      else if (sy.status === "error") msg = t("Could not load your workout history");
    }
    if (msg) nodes.syncLive.textContent = msg;
  }

  function renderSync() {
    if (!nodes || !S.open) return;
    const sy = S.sync, box = nodes.syncBox;
    const hadFocus = box.contains(document.activeElement);
    box.textContent = "";
    box.classList.remove("is-error");
    const wait = Math.ceil((Core.requestLog.cooldownUntil - Date.now()) / 1000);
    const waitText = wait > 0 ? t("Waiting {s} s (rate limit)", { s: wait }) : "";
    announceSync(sy, wait, waitText);
    if (sy.status === "elsewhere") {
      box.hidden = false;
      box.appendChild(el("p", "exp-sync-text", t("Syncing in another tab")));
    } else if (sy.status === "listing" || sy.status === "fetching") {
      box.hidden = false;
      const text = waitText || sy.msg || (sy.status === "listing" ? t("Looking up your workouts…") : t("Syncing your history… {done} of {total}", { done: sy.done, total: sy.total }));
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
      box.appendChild(el("p", "exp-sync-text", sy.reason === "ratelimit"
        ? t("Sync paused: the server's rate limit was reached. Resume when the countdown ends.")
        : t("Sync paused: {msg}", { msg: t("The server is busy or unreachable. Try again in a moment.") })));
      box.appendChild(el("p", "exp-sync-sub", t("Syncing your history… {done} of {total}", { done: sy.done, total: sy.total })));
      if (waitText) box.appendChild(el("p", "exp-sync-sub", waitText));
      const b = el("button", "secondary", t("Resume")); b.type = "button";
      b.addEventListener("click", () => { startSync(); });
      box.appendChild(b);
    } else if (sy.status === "error") {
      box.hidden = false; box.classList.add("is-error");
      box.setAttribute("role", "alert");
      box.appendChild(el("p", "exp-sync-text", t("Could not load your workout history")));
      box.appendChild(el("p", "exp-sync-sub", t("The server is busy or unreachable. Try again in a moment.")));
      const b = el("button", "secondary", t("Retry")); b.type = "button";
      b.addEventListener("click", () => { startSync(); });
      box.appendChild(b);
    } else if (sy.status === "offline" || sy.status === "stale") {
      box.hidden = false;
      const saved = S.workouts.size > 0;
      box.appendChild(el("p", "exp-sync-text", sy.status === "offline"
        ? (saved ? t("You are offline. Showing the data saved on this device.") : t("You are offline, and no history is saved on this device yet."))
        : (saved ? t("Could not refresh. Showing the data saved on this device.") : t("Could not load your workout history"))));
    } else if (sy.status === "done" && (sy.failed > 0 || sy.saturated)) {
      box.hidden = false;
      if (sy.failed > 0) box.appendChild(el("p", "exp-sync-text", t("{n} workouts could not be loaded and will be retried next time.", { n: sy.failed })));
      if (sy.saturated) { box.classList.add("is-error"); box.appendChild(el("p", "exp-sync-text", t("Some history may be missing: the server limits how many workouts it returns."))); }
    } else {
      box.hidden = true;
    }
    if (sy.status !== "error") box.removeAttribute("role");
    if (hadFocus && !box.contains(document.activeElement)) { const b = box.querySelector("button"); (b || nodes.title).focus({ preventScroll: true }); }
  }

  function stat(label, value, sub) {
    const d = el("div", "exp-stat");
    d.append(el("div", "exp-stat-v", value), el("div", "exp-stat-l", label));
    if (sub) d.appendChild(el("div", "exp-stat-s", sub));
    return d;
  }

  function destroyChart() { if (S.chart) { try { S.chart.destroy(); } catch (e) { /* gone */ } S.chart = null; } }
  const cssVar = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  // Month + year for long spans, day + month for spans under ~4 months (so ticks never repeat).
  const dateTick = (dn, days) => {
    const f = days < 120 ? { day: "numeric", month: "short" } : { month: "short", year: "numeric" };
    try { return new Intl.DateTimeFormat(LANG(), Object.assign({ timeZone: "UTC" }, f)).format(new Date(Math.round(dn) * 86400000)); } catch (e) { return Core.fromDayNumber(Math.round(dn)); }
  };

  function drawChart(s) {
    destroyChart();
    if (!window.Chart || s.isEmpty) return false;
    const primary = cssVar("--primary"), surface = cssVar("--surface"), muted = cssVar("--muted"), grid = cssVar("--border"), warn = cssVar("--warn"), soft = cssVar("--primary-soft");
    const pts = s.points, bestIdx = pts.findIndex((p) => p.value === s.summary.best.value && p.date === s.summary.best.date);
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
        pointBackgroundColor: pts.map((p, i) => (i === bestIdx ? warn : surface)),
      }] },
      options: {
        responsive: true, maintainAspectRatio: false, parsing: false,
        animation: reduceMotion() || S.sync.status === "fetching" ? false : { duration: 300 },
        interaction: { mode: "nearest", intersect: false, axis: "x" },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: cssVar("--toast-bg") || cssVar("--text"), titleColor: cssVar("--toast-fg") || cssVar("--surface"), bodyColor: cssVar("--toast-fg") || cssVar("--surface"),
            displayColors: false, padding: 10, cornerRadius: 8,
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
          x: { type: "linear", min, max, grid: { display: false }, border: { color: grid }, ticks: { color: muted, maxRotation: 0, maxTicksLimit: 6, font: { size: 11 }, callback: (v) => dateTick(v, max - min) } },
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
    nodes.stats.hidden = !s.hasAny;
    if (s.hasAny) {
      // All-time figures: the range only narrows the chart (and the "in this range" count).
      const sm = s.summary;
      nodes.stats.append(
        stat(t("Latest"), val(s, sm.latest.value), fmtDate(sm.latest.date)),
        stat(t("Personal best"), val(s, sm.best.value), fmtDate(sm.best.date)),
        stat(t("Sessions"), String(sm.sessions), S.range === "All" ? "" : t("{n} in this range", { n: sm.rangeSessions })),
        stat(t("Change since first"), changeText(s), fmtDate(sm.first.date))
      );
    }

    // chart card
    nodes.ch.textContent = s.hasAny ? heading(s) : t("Exercise progress");
    nodes.note.textContent = s.showTotal ? t("The chart shows the load per cable. The total for both cables is in the tooltip.") : "";
    nodes.note.hidden = !s.showTotal;
    const syncing = S.sync.status === "listing" || S.sync.status === "fetching";
    let message = "";
    const st = S.sync.status;
    if (!s.hasAny) {
      if (syncing || st === "idle" || st === "elsewhere") message = t("Loading…");
      else if (st === "done") message = t("No history for this exercise yet");
      else if (st === "offline" || st === "stale") message = S.workouts.size ? t("No history for this exercise yet") : t("No history is saved on this device yet.");
      else message = ""; // error / paused: the banner above says what happened
    }
    else if (s.isEmpty) message = t("No workouts in this range. Try a longer range.");
    else if (s.isSingle) message = t("Only one workout so far. Train again to see a trend.");
    const sub2 = !s.hasAny && st === "done" ? t("Complete a workout with this exercise and it will show up here.") : "";
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
    if (S.lockAbort) { try { S.lockAbort.abort(); } catch (e) { /* done */ } S.lockAbort = null; }
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

  // Unit / language switch rebuilds the screen: keep the open data table and put focus back where it was.
  const rerender = () => {
    if (!S.open || !nodes) return;
    const a = document.activeElement, inside = nodes.root.contains(a);
    const range = inside && a.dataset ? a.dataset.range : null, wasOpen = nodes.det.open;
    const sum = inside && a.tagName === "SUMMARY";
    render(false);
    nodes.det.open = wasOpen;
    const target = (range && nodes.ranges.querySelector('[data-range="' + range + '"]')) || (sum && nodes.det.querySelector("summary")) || (inside && nodes.title);
    if (target) target.focus({ preventScroll: true });
  };
  if (window.I18N && Array.isArray(I18N.onChange)) I18N.onChange.push(rerender);
  if (window.Units) Units.onChange(rerender);
  document.addEventListener("themechange", () => { if (S.open && nodes) renderData(); });

  window.ExerciseProgressUI = { open, close, forgetWorkout, clearAll, _state: S };
})();
