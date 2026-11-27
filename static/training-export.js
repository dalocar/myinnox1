/* Training export dialog ("Export" on the Summary and My Activity screens): choose a period and a question, fetch
   what is missing, then copy or download the file. Pure logic lives in training-export-core.js; history, cache and
   rate limiting come from ExerciseProgressUI.exporter. Depends on app.js globals: $, t, toast, escapeHtml, LANG,
   Units, I18N. Public API: window.TrainingExportUI = { open({ opener, viewed }), close() }. */
(function () {
  const C = window.TrainingExportCore, EP = window.ExerciseProgressCore;
  const src = () => window.ExerciseProgressUI && window.ExerciseProgressUI.exporter;
  if (!C || !EP || !src() || !$("texp-backdrop")) return;

  Object.assign(I18N.es, {
    "Export": "Exportar",
    "Export for AI analysis": "Exportar para analizar con IA",
    "Close": "Cerrar",
    "Period": "Periodo",
    "Between dates": "Entre fechas",
    "Everything": "Todo",
    "4 weeks": "4 semanas", "3 months": "3 meses", "12 months": "12 meses",
    "From": "Desde", "To": "Hasta",
    "Choose both dates.": "Elige las dos fechas.",
    "The start date is after the end date.": "La fecha inicial es posterior a la final.",
    "Looking up your workouts…": "Buscando tus entrenamientos…",
    "Workouts: {n} · about {k}k tokens": "Entrenamientos: {n} · unos {k}k tokens",
    "No workouts between these dates.": "No hay entrenamientos entre estas fechas.",
    "No workouts yet": "Aún no hay entrenamientos",
    "Export everything instead": "Exportar todo",
    "You are offline. Only workouts saved on this device are listed.": "Sin conexión. Solo aparecen los entrenamientos guardados en este dispositivo.",
    "Some history may be missing: the server limits how many workouts it returns.": "Puede faltar historial: el servidor limita cuántos entrenamientos devuelve.",
    "Could not load your workout history": "No se pudo cargar tu historial de entrenamientos",
    "Retry": "Reintentar",
    "What do you want to know?": "¿Qué quieres saber?",
    "How am I progressing?": "¿Cómo estoy progresando?",
    "Where am I stuck, and what should I lift next?": "¿Dónde estoy estancado y qué cargas pruebo ahora?",
    "Is my training balanced?": "¿Está equilibrado mi entrenamiento?",
    "How consistent am I?": "¿Soy constante?",
    "My own question": "Mi propia pregunta",
    "Your question": "Tu pregunta",
    "Write your question first.": "Escribe primero tu pregunta.",
    "Your goal or injuries (optional)": "Tu objetivo o lesiones (opcional)",
    "Prepare export": "Preparar exportación",
    "Fetching workouts: {done} of {total}": "Descargando entrenamientos: {done} de {total}",
    "The server asked us to slow down. Waiting {s} s…": "El servidor nos pide ir más despacio. Esperando {s} s…",
    "Cancel": "Cancelar",
    "{n} of {total} workouts could not be loaded.": "No se pudieron cargar {n} de {total} entrenamientos.",
    "Resume": "Reanudar",
    "Export the {n} available": "Exportar los {n} disponibles",
    "Ready. Workouts: {n} · {from} to {to} · about {k}k tokens": "Listo. Entrenamientos: {n} · del {from} al {to} · unos {k}k tokens",
    "This file is incomplete. Missing workouts: {n}.": "Este archivo está incompleto. Entrenamientos que faltan: {n}.",
    "Copy prompt + data": "Copiar instrucciones y datos",
    "Download file": "Descargar archivo",
    "Copy prompt only": "Copiar solo las instrucciones",
    "Paste into your AI chat, or attach the file and paste the prompt.": "Pégalo en tu chat de IA, o adjunta el archivo y pega las instrucciones.",
    "This is a long text: attaching the file usually works better than pasting.": "Es un texto largo: adjuntar el archivo suele funcionar mejor que pegarlo.",
    "Copied. Paste it in your AI chat.": "Copiado. Pégalo en tu chat de IA.",
    "Copying is blocked by the browser. Select the text below and copy it.": "El navegador bloquea el copiado. Selecciona el texto de abajo y cópialo.",
    "Exported {file}": "Exportado {file}",
    "Preview": "Vista previa",
    "Change options": "Cambiar opciones",
    "Nothing is sent anywhere until you share the text yourself.": "No se envía nada a ningún sitio hasta que tú compartas el texto.",
  });

  const PREF = "myinnox1_export_prefs";
  const LABELS = {
    progress: "How am I progressing?", plateaus: "Where am I stuck, and what should I lift next?", balance: "Is my training balanced?",
    consistency: "How consistent am I?", custom: "My own question",
  };
  const PRESET_LABEL = { "4w": "4 weeks", "3m": "3 months", "12m": "12 months" };
  const today = () => EP.localISO(new Date());
  const esc = (s) => escapeHtml(s);
  const tr = (k, v) => esc(t(k, v));
  const kilo = (n) => (n < 1000 ? "1" : String(Math.round(n / 1000)));

  const S = {
    open: false, step: "choose", token: 0, opener: null, viewed: null,
    mode: "range", preset: "3m", from: "", to: "", question: "progress", custom: "", goal: "",
    list: null, listError: "", progress: { done: 0, total: 0, wait: 0 }, result: null, model: null, markdown: "", copyText: "",
  };
  const body = () => $("texp-body");
  const announce = (msg) => { $("texp-live").textContent = msg; };

  // Question and goal are remembered on this device; dates are not (a stale range would be a trap).
  function loadPrefs() {
    try {
      const p = JSON.parse(localStorage.getItem(PREF) || "{}");
      if (C.QUESTIONS.includes(p.question)) S.question = p.question;
      if (typeof p.goal === "string") S.goal = p.goal;
      if (typeof p.custom === "string") S.custom = p.custom;
    } catch (e) { /* defaults */ }
  }
  function savePrefs() {
    try { localStorage.setItem(PREF, JSON.stringify({ question: S.question, goal: S.goal, custom: S.custom })); } catch (e) { /* optional */ }
  }

  const range = () => (S.mode === "all" ? null : { from: S.from, to: S.to });
  const dateError = () => (S.mode === "all" ? "" : C.rangeError(S.from, S.to));
  const selected = () => (S.list && !dateError() ? C.filterRows(S.list.rows, range()) : []);

  function usePreset(id) {
    S.mode = "range"; S.preset = id;
    const r = id === "viewed" && S.viewed ? { from: S.viewed.start, to: S.viewed.end > today() ? today() : S.viewed.end } : C.presetRange(id, today());
    if (r) { S.from = r.from; S.to = r.to; }
  }

  // ---------- open / close ----------
  function open(opts) {
    const o = opts || {};
    S.open = true; S.step = "choose"; S.opener = o.opener || document.activeElement; S.viewed = o.viewed || null;
    S.list = null; S.listError = ""; S.result = null; S.markdown = "";
    loadPrefs();
    usePreset(S.viewed ? "viewed" : "3m");
    $("texp-backdrop").hidden = false;
    render();
    $("texp-title").focus({ preventScroll: true });
    loadList();
  }
  function close() {
    if (!S.open) return;
    S.open = false; S.token++;
    src().cancel(); // whatever was fetched stays cached
    $("texp-backdrop").hidden = true;
    body().innerHTML = "";
    S.markdown = ""; S.model = null;
    if (S.opener && S.opener.isConnected) S.opener.focus();
  }

  async function loadList() {
    const token = ++S.token;
    S.list = null; S.listError = "";
    updateChoice();
    try {
      const list = await src().list(() => token !== S.token);
      if (token !== S.token) return;
      S.list = list;
    } catch (e) {
      if (token !== S.token) return;
      S.listError = (e && e.message) || "Error";
    }
    updateChoice();
  }

  // ---------- step 1: choose ----------
  const chip = (attr, value, pressed, label) => `<button type="button" class="chip" ${attr}="${value}" aria-pressed="${pressed}">${esc(label)}</button>`;

  function renderChoose() {
    body().innerHTML = `
      <fieldset><legend>${tr("Period")}</legend>
        <div class="pl-seg" role="group" aria-label="${tr("Period")}">
          <button type="button" data-mode="range">${tr("Between dates")}</button><button type="button" data-mode="all">${tr("Everything")}</button></div>
        <div id="texp-range">
          <div class="texp-chips" id="texp-chips"></div>
          <div class="texp-dates">
            <label>${tr("From")}<input type="date" id="texp-from" max="${today()}"></label>
            <label>${tr("To")}<input type="date" id="texp-to" max="${today()}"></label></div>
        </div>
        <div id="texp-count"></div>
      </fieldset>
      <fieldset><legend>${tr("What do you want to know?")}</legend>
        ${C.QUESTIONS.map((q) => `<label class="texp-radio"><input type="radio" name="texp-q" value="${q}"${q === S.question ? " checked" : ""}>${tr(LABELS[q])}</label>`).join("")}
        <textarea id="texp-custom" maxlength="2000" aria-label="${tr("Your question")}" placeholder="${tr("Your question")}"></textarea>
        <textarea id="texp-goal" maxlength="120" aria-label="${tr("Your goal or injuries (optional)")}" placeholder="${tr("Your goal or injuries (optional)")}"></textarea>
      </fieldset>
      <div class="texp-actions texp-foot"><button type="button" id="texp-go">${tr("Prepare export")}</button></div>`;
    $("texp-custom").value = S.custom;
    $("texp-goal").value = S.goal;
    body().querySelectorAll("[data-mode]").forEach((b) => (b.onclick = () => { S.mode = b.dataset.mode; updateChoice(); }));
    for (const id of ["from", "to"]) $("texp-" + id).oninput = (e) => { S[id] = e.target.value; S.preset = ""; updateChoice(); };
    body().querySelectorAll('input[name="texp-q"]').forEach((r) => (r.onchange = () => { S.question = r.value; updateChoice(); }));
    $("texp-custom").oninput = (e) => { S.custom = e.target.value; updateChoice(); };
    $("texp-goal").oninput = (e) => { S.goal = e.target.value; };
    $("texp-go").onclick = prepare;
    updateChoice();
  }

  // Repaints only what depends on the choices, so typing and focus are never disturbed.
  function updateChoice() {
    if (!S.open || S.step !== "choose" || !$("texp-count")) return;
    body().querySelectorAll("[data-mode]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.mode === S.mode)));
    $("texp-range").hidden = S.mode === "all";
    const chips = $("texp-chips");
    const ids = C.PRESETS.concat(S.viewed ? ["viewed"] : []);
    const focused = document.activeElement && document.activeElement.dataset ? document.activeElement.dataset.preset : null;
    chips.innerHTML = ids.map((id) => chip("data-preset", id, S.preset === id, id === "viewed" ? S.viewed.label : t(PRESET_LABEL[id]))).join("");
    chips.querySelectorAll("[data-preset]").forEach((b) => (b.onclick = () => { usePreset(b.dataset.preset); updateChoice(); }));
    if (focused) { const f = chips.querySelector(`[data-preset="${focused}"]`); if (f) f.focus(); }
    for (const id of ["from", "to"]) if ($("texp-" + id).value !== S[id] && document.activeElement !== $("texp-" + id)) $("texp-" + id).value = S[id];
    $("texp-custom").hidden = S.question !== "custom";

    const err = dateError(), n = selected().length;
    const count = $("texp-count");
    let html = "";
    if (err) html = `<p class="texp-err">${tr(err === "order" ? "The start date is after the end date." : "Choose both dates.")}</p>`;
    else if (S.listError) html = `<p class="texp-err">${tr("Could not load your workout history")}: ${esc(S.listError)}</p><button type="button" class="secondary" id="texp-retry">${tr("Retry")}</button>`;
    else if (!S.list) html = `<p class="meta">${tr("Looking up your workouts…")}</p>`;
    else if (!n) {
      html = `<p class="texp-count">${tr(S.list.rows.length ? "No workouts between these dates." : "No workouts yet")}</p>` +
        (S.list.rows.length ? `<button type="button" class="secondary" id="texp-all">${tr("Export everything instead")}</button>` : "");
    } else html = `<p class="texp-count">${tr("Workouts: {n} · about {k}k tokens", { n, k: kilo(C.estimateTokens(n)) })}</p>`;
    if (S.list && S.list.offline) html += `<p class="meta">${tr("You are offline. Only workouts saved on this device are listed.")}</p>`;
    if (S.list && S.list.saturated) html += `<p class="meta">${tr("Some history may be missing: the server limits how many workouts it returns.")}</p>`;
    const needQuestion = S.question === "custom" && !S.custom.trim();
    if (needQuestion) html += `<p class="meta">${tr("Write your question first.")}</p>`;
    if (count.innerHTML !== html) { count.innerHTML = html; announce(count.textContent.trim()); }
    if ($("texp-retry")) $("texp-retry").onclick = loadList;
    if ($("texp-all")) $("texp-all").onclick = () => { S.mode = "all"; updateChoice(); };
    $("texp-go").disabled = !n || needQuestion;
  }

  // ---------- step 2: prepare ----------
  async function prepare() {
    const rows = selected(), chosen = range();
    if (!rows.length) return;
    savePrefs();
    const token = ++S.token;
    S.step = "fetch"; S.progress = { done: 0, total: rows.length, wait: 0 }; S.result = null;
    render();
    let res;
    try {
      res = await src().fetch(rows, {
        shouldStop: () => token !== S.token,
        onProgress: (done, total, wait) => { if (token !== S.token) return; S.progress = { done, total, wait }; updateProgress(); },
      });
    } catch (e) {
      if (token !== S.token) return;
      S.step = "choose"; render();
      toast(t("Could not load your workout history") + ": " + ((e && e.message) || "Error"), true);
      return;
    }
    if (token !== S.token) return;
    if (res.stopped) { S.step = "choose"; render(); return; }
    S.result = { res, rows, range: chosen };
    if (res.missing) { S.step = "partial"; render(); } else build();
  }

  function renderFetch() {
    body().innerHTML = `<p id="texp-status"></p><progress id="texp-progress"></progress>
      <p class="meta" id="texp-wait"></p>
      <div class="texp-actions"><button type="button" class="secondary" id="texp-cancel">${tr("Cancel")}</button></div>`;
    $("texp-cancel").onclick = () => { S.token++; src().cancel(); S.step = "choose"; render(); };
    updateProgress();
    $("texp-cancel").focus();
  }
  function updateProgress() {
    if (S.step !== "fetch" || !$("texp-status")) return;
    const p = S.progress;
    const msg = t("Fetching workouts: {done} of {total}", p);
    if ($("texp-status").textContent !== msg) {
      $("texp-status").textContent = msg;
      if (p.done === 0 || p.done === p.total || p.done % 10 === 0) announce(msg);
    }
    $("texp-progress").max = p.total || 1;
    $("texp-progress").value = p.done;
    $("texp-wait").textContent = p.wait ? t("The server asked us to slow down. Waiting {s} s…", { s: p.wait }) : "";
  }

  function renderPartial() {
    const { res, rows } = S.result, have = rows.length - res.missing;
    body().innerHTML = `<p class="texp-err" role="alert">${tr("{n} of {total} workouts could not be loaded.", { n: res.missing, total: rows.length })}</p>
      <div class="texp-actions"><button type="button" id="texp-resume">${tr("Resume")}</button>
        ${have ? `<button type="button" class="secondary" id="texp-partial">${tr("Export the {n} available", { n: have })}</button>` : ""}
        <button type="button" class="secondary" id="texp-back">${tr("Change options")}</button></div>`;
    $("texp-resume").onclick = prepare;
    if ($("texp-partial")) $("texp-partial").onclick = build;
    $("texp-back").onclick = () => { S.step = "choose"; render(); };
    $("texp-resume").focus();
  }

  // ---------- step 3: ready ----------
  function build() {
    const { res, rows, range: chosen } = S.result;
    S.model = C.buildModel({ rows, workouts: res.workouts, library: res.library, range: chosen, today: today() });
    S.step = "ready";
    render();
  }
  // Built at paint time so a unit or language switch is picked up.
  function texts() {
    S.markdown = C.toMarkdown(S.model, { unit: Units.get(), goal: S.goal });
    const prompt = C.buildPrompt(S.question, { goal: S.goal, custom: S.custom, lang: LANG() });
    return { prompt, all: C.withPrompt(prompt, S.markdown) };
  }

  function renderReady() {
    const m = S.model, { prompt, all } = texts();
    const tokens = C.textTokens(all), large = tokens > C.LARGE_TOKENS;
    const copyBtn = `<button type="button" id="texp-copy"${large ? ' class="secondary"' : ""}>${tr("Copy prompt + data")}</button>`;
    const dlBtn = `<button type="button" id="texp-download"${large ? "" : ' class="secondary"'}>${tr("Download file")}</button>`;
    const summary = t("Ready. Workouts: {n} · {from} to {to} · about {k}k tokens", { n: m.totals.workouts, from: m.from, to: m.to, k: kilo(tokens) });
    body().innerHTML = `<p class="texp-count">${esc(summary)}</p>
      ${m.missing.length ? `<p class="texp-err">${tr("This file is incomplete. Missing workouts: {n}.", { n: m.missing.length })}</p>` : ""}
      <div class="texp-actions">${large ? dlBtn + copyBtn : copyBtn + dlBtn}
        <button type="button" class="secondary" id="texp-prompt">${tr("Copy prompt only")}</button></div>
      <p class="meta">${tr(large ? "This is a long text: attaching the file usually works better than pasting." : "Paste into your AI chat, or attach the file and paste the prompt.")}</p>
      <p class="meta">${tr("Nothing is sent anywhere until you share the text yourself.")}</p>
      <div id="texp-fallback" hidden><textarea id="texp-fallback-text" readonly rows="6"></textarea></div>
      <details><summary>${tr("Preview")}</summary><pre tabindex="0" id="texp-preview"></pre></details>
      <div class="texp-actions"><button type="button" class="secondary" id="texp-back">${tr("Change options")}</button></div>`;
    $("texp-preview").textContent = all.length > 6000 ? all.slice(0, 6000) + "\n…" : all;
    $("texp-copy").onclick = () => copy(all);
    $("texp-prompt").onclick = () => copy(prompt);
    $("texp-download").onclick = () => download(C.filename(m), S.markdown);
    $("texp-back").onclick = () => { S.step = "choose"; render(); if (!S.list) loadList(); };
    announce(summary);
    $(large ? "texp-download" : "texp-copy").focus();
  }

  async function copy(text) {
    const write = window.AIKit && window.AIKit.writeClipboard;
    const ok = write ? await write(text) : false;
    if (S.step !== "ready") return;
    $("texp-fallback").hidden = ok;
    if (ok) { toast(t("Copied. Paste it in your AI chat.")); announce(t("Copied. Paste it in your AI chat.")); return; }
    const ta = $("texp-fallback-text");
    ta.value = text; ta.focus(); ta.select();
    toast(t("Copying is blocked by the browser. Select the text below and copy it."), true);
  }
  function download(filename, text) {
    const url = URL.createObjectURL(new Blob([text], { type: "text/markdown;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast(t("Exported {file}", { file: filename }));
  }

  function render() {
    if (!S.open) return;
    $("texp-title").textContent = t("Export for AI analysis");
    $("texp-close").textContent = t("Close");
    ({ choose: renderChoose, fetch: renderFetch, partial: renderPartial, ready: renderReady })[S.step]();
  }

  $("texp-close").addEventListener("click", close);
  $("texp-backdrop").addEventListener("click", (e) => { if (e.target.id === "texp-backdrop" && S.step !== "fetch") close(); });
  document.addEventListener("keydown", (e) => {
    if (!S.open) return;
    if (e.key === "Escape") { e.stopPropagation(); close(); return; }
    if (e.key !== "Tab") return;
    const f = [...$("texp-modal").querySelectorAll("button, input, textarea, summary, pre[tabindex]")].filter((el) => !el.disabled && el.offsetParent !== null);
    if (!f.length) return;
    const first = f[0], last = f[f.length - 1], inside = f.includes(document.activeElement);
    if (e.shiftKey && (document.activeElement === first || !inside)) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && (document.activeElement === last || !inside)) { e.preventDefault(); first.focus(); }
  });
  if (window.I18N && Array.isArray(I18N.onChange)) I18N.onChange.push(render);
  if (window.Units) Units.onChange(render);

  window.TrainingExportUI = { open, close };
  // The dashboard and explorer may have painted before this script loaded: show their button now.
  const dash = $("act-export-btn");
  if (dash) { dash.textContent = t("Export"); dash.hidden = false; }
})();
