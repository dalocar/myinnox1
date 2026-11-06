/* Program export / import / clone (screen code). Pure logic lives in
   program-io-core.js. Uses globals from app.js: $, api, toast, t, escapeHtml,
   getActionLibrary, loadPrograms. Exports keep the server's stored values
   (tenths of kg), so files are independent of the account unit setting. */
(() => {
  const C = window.ProgramIOCore;
  const K = window.AIKitCore;
  const LIST_LABEL = { warmUpStepList: "Warm up", mainStepList: "Strength", relaxStepList: "Stretch" };

  // ---------- modal (one shared dialog for clone + import) ----------
  let opener = null;
  let busy = false; // blocks Escape / backdrop close while saving

  function openModal(title, openerEl) {
    opener = openerEl || document.activeElement;
    $("pio-modal-title").textContent = title;
    $("pio-modal-body").innerHTML = "";
    $("pio-modal-backdrop").hidden = false;
  }
  function closeModal() {
    if ($("pio-modal-backdrop").hidden) return;
    $("pio-modal-backdrop").hidden = true;
    $("pio-modal-body").innerHTML = "";
    busy = false;
    if (opener && opener.isConnected && opener.focus) opener.focus();
    opener = null;
  }
  $("pio-modal-close-btn").addEventListener("click", () => { if (!busy) closeModal(); });
  $("pio-modal-backdrop").addEventListener("click", (e) => { if (e.target.id === "pio-modal-backdrop" && !busy) closeModal(); });
  document.addEventListener("keydown", (e) => {
    if ($("pio-modal-backdrop").hidden) return;
    if (e.key === "Escape") { if (!busy) { e.stopPropagation(); closeModal(); } return; }
    if (e.key !== "Tab") return;
    const f = [...$("pio-modal").querySelectorAll("button, input, select, textarea, a[href]")].filter((el) => !el.disabled && !el.hidden && el.offsetParent !== null);
    if (!f.length) return;
    const first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  });

  // ---------- helpers ----------
  const fetchDetail = async (id) => (await api(`/course/custom/detail?id=${encodeURIComponent(id)}`)).data;
  const fetchList = async () => (await api("/course/custom/list")).data || [];
  const copyWord = () => t("copy");

  function download(filename, obj) {
    const blob = new Blob([JSON.stringify(obj, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  const appVersion = () => (window.APP_VERSION && window.APP_VERSION.sha) || "";

  // Messages of the AI routines format: the English template from AIKitCore is the i18n key.
  function routineMessage(e) {
    const msg = t(K.messageParts(e).template, e);
    const where = K.whereText(e, (n) => t("step {n}", { n }));
    const body = e.skipped ? `${t(K.SKIPPED)} (${msg})` : msg;
    return where ? `${where}: ${body}` : body;
  }

  function errorMessage(e, routines) {
    if (routines && K.MESSAGES[e.code]) return routineMessage(e);
    const list = LIST_LABEL[e.list] ? t(LIST_LABEL[e.list]) : "";
    switch (e.code) {
      case "no-json": case "invalid-json": case "too-many-routines": case "no-routines": case "library-unavailable": return routineMessage(e);
      case "bad-json": return t("That file is not valid JSON.");
      case "wrong-format": return t("That is not a MyInnoX1 program file.");
      case "newer-version": return t("This file was made by a newer version of MyInnoX1 (format {v}).", { v: e.version });
      case "no-programs": return t("The file contains no programs.");
      case "program-not-object": return t("This entry is not a program.");
      case "no-name": return t("The program has no name.");
      case "no-steps": return t("The program has no exercises.");
      case "all-missing": return t("None of its exercises are in your action library.");
      case "list-not-array": return t("{list} is not a list of exercises.", { list });
      case "step-not-object": return t("Exercise {n} in {list} is not valid.", { n: e.step, list });
      case "step-field": return t("Exercise {n} in {list} has an invalid {field}.", { n: e.step, list, field: e.field });
      default: return t("The file is not valid.");
    }
  }

  // ---------- export ----------
  async function exportOne(p, btn) {
    if (btn) btn.disabled = true;
    try {
      const detail = await fetchDetail(p.id);
      const file = C.exportFilename(detail);
      download(file, C.buildExport([detail], { appVersion: appVersion() }));
      toast(t("Exported {file}", { file }));
    } catch (e) {
      toast(t("Export failed: {msg}", { msg: C.safeMessage(e, t("The server rejected the request")) }), true);
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  async function exportAll(btn) {
    btn.disabled = true;
    try {
      const list = await fetchList();
      if (!list.length) { toast(t("Nothing to export.")); return; }
      const details = [];
      for (const p of list) details.push(await fetchDetail(p.id)); // sequential: be gentle with the upstream
      const file = C.exportFilename(details);
      download(file, C.buildExport(details, { appVersion: appVersion() }));
      toast(t("Exported {file}", { file }));
    } catch (e) {
      toast(t("Export failed: {msg}", { msg: C.safeMessage(e, t("The server rejected the request")) }), true);
    } finally {
      btn.disabled = false;
    }
  }

  // ---------- clone ----------
  async function cloneOne(p, btn) {
    let names;
    try { names = (await fetchList()).map((x) => x.name); }
    catch (e) { toast(t("Clone failed: {msg}", { msg: C.safeMessage(e, t("The server rejected the request")) }), true); return; }
    openModal(t("Clone program"), btn);
    const body = $("pio-modal-body");
    body.innerHTML = `
      <form id="pio-clone-form" class="pio-form" novalidate>
        <label for="pio-clone-name">${escapeHtml(t("Name for the copy"))}</label>
        <input type="text" id="pio-clone-name" name="pio-clone-name" autocomplete="off" required>
        <p class="meta" id="pio-clone-hint" role="status"></p>
        <div class="actions pio-actions">
          <button type="submit" id="pio-clone-go">${escapeHtml(t("Create copy"))}</button>
          <button type="button" class="secondary" id="pio-clone-cancel">${escapeHtml(t("Cancel"))}</button>
        </div>
      </form>`;
    const input = $("pio-clone-name"), hint = $("pio-clone-hint"), go = $("pio-clone-go");
    input.value = C.cloneName(p.name, names, copyWord());
    const used = new Set(names.map((n) => String(n).trim().toLowerCase()));
    const sync = () => {
      const v = input.value.trim();
      hint.textContent = !v ? t("A name is required.") : used.has(v.toLowerCase()) ? t("A program with this name already exists.") : "";
      hint.className = "meta" + (!v ? " err" : "");
    };
    input.addEventListener("input", sync);
    sync();
    input.focus(); input.select();
    $("pio-clone-cancel").onclick = () => closeModal();
    $("pio-clone-form").addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const name = input.value.trim();
      if (!name) { sync(); input.focus(); return; }
      busy = true; go.disabled = true; $("pio-clone-cancel").disabled = true; input.disabled = true;
      hint.className = "meta"; hint.textContent = t("Saving…");
      try {
        const detail = await fetchDetail(p.id); // re-fetch: save needs the full, current object
        await api("/course/custom/save", { method: "POST", body: JSON.stringify(C.toSaveBody(detail, { name })) });
        busy = false;
        closeModal();
        toast(t("Cloned — {name}", { name }));
        loadPrograms();
      } catch (e) {
        busy = false; go.disabled = false; $("pio-clone-cancel").disabled = false; input.disabled = false;
        hint.className = "meta err";
        hint.textContent = t("Clone failed: {msg}", { msg: C.safeMessage(e, t("The server rejected the request")) });
      }
    });
  }

  // ---------- import ----------
  function showImportError(message, openerEl) {
    openModal(t("Import programs"), openerEl);
    $("pio-modal-body").innerHTML = `
      <p class="server-error" role="alert">${escapeHtml(message)}</p>
      <div class="actions pio-actions"><button type="button" id="pio-err-ok">${escapeHtml(t("Close"))}</button></div>`;
    $("pio-err-ok").onclick = () => closeModal();
    $("pio-err-ok").focus();
  }

  // Text of a file or of the Paste JSON tab -> preview. Returns the fatal error (nothing is
  // rendered then) or null once the preview is shown. `o`: {tolerant, skipBad}.
  async function runImport(text, openerEl, o = {}) {
    const opts = { tolerant: !!o.tolerant, skipBad: !!o.skipBad };
    let parsed = C.parseImport(text, opts);
    let actions = null;
    if (parsed.fatal && parsed.fatal.code === "library-unavailable") {
      try { actions = await getPickableActions(); } catch { /* stays unavailable */ }
      parsed = C.parseImport(text, { ...opts, library: actions || [] });
    }
    if (parsed.fatal) return parsed.fatal;
    const routines = parsed.kind === "routines";

    let existing = [], libIds = null;
    try { existing = (await fetchList()).map((x) => x.name); }
    catch (e) { return { code: "import-failed", message: t("Import failed: {msg}", { msg: C.safeMessage(e, t("The server rejected the request")) }) }; }
    if (!routines) { try { libIds = new Set((await getPickableActions()).map((a) => a.id)); } catch { /* skip the library check */ } }

    const used = existing.slice();
    const rows = parsed.programs.map((entry, i) => {
      const program = entry.program;
      const errors = entry.errors.slice();
      let missing = 0;
      if (!errors.length && libIds) {
        const keep = {};
        for (const l of C.STEP_LISTS) {
          const steps = program[l] || [];
          keep[l] = steps.filter((s) => libIds.has(s.actionLibraryId));
          missing += steps.length - keep[l].length;
        }
        if (missing) {
          Object.assign(program, keep);
          if (!C.STEP_LISTS.some((l) => (program[l] || []).length)) errors.push({ code: "all-missing" });
        }
      }
      const steps = C.STEP_LISTS.reduce((n, l) => n + (Array.isArray(program && program[l]) ? program[l].length : 0), 0);
      const valid = errors.length === 0;
      const name = valid ? C.uniqueName(entry.name, used, copyWord()) : entry.name;
      if (valid) used.push(name);
      return { i, program, errors, warnings: entry.warnings || [], missing, steps, valid, name, selected: valid, status: "" };
    });
    const ctx = routines ? { kind: "routines", text, tolerant: opts.tolerant, skipBad: opts.skipBad, errors: parsed.errors, fileErrors: parsed.fileErrors, schedule: parsed.schedule } : { kind: "program" };
    renderPreview(rows, openerEl, ctx);
    return null;
  }

  async function startImport(file, openerEl) {
    let text;
    try { text = await file.text(); } catch (e) { showImportError(t("Could not read the file: {msg}", { msg: C.safeMessage(e, t("The server rejected the request")) }), openerEl); return; }
    const fatal = await runImport(text, openerEl);
    if (fatal) showImportError(fatal.message || errorMessage(fatal), openerEl);
  }

  // ---------- import dialog: File / Paste JSON ----------
  async function copyText(text, host) {
    const ok = window.AIKit && (await window.AIKit.writeClipboard(text));
    if (ok) { toast(t("Copied. Paste it in your AI chat.")); return; }
    toast(t("Copying is blocked by the browser. Select the text below and copy it."), true);
    let ta = host.querySelector(".pio-fallback");
    if (!ta) { ta = document.createElement("textarea"); ta.className = "pio-fallback"; ta.readOnly = true; ta.rows = 6; ta.setAttribute("aria-label", t("Errors")); host.appendChild(ta); }
    ta.value = text; ta.focus(); ta.select();
  }

  function openImportDialog(openerEl) {
    openModal(t("Import programs"), openerEl);
    const body = $("pio-modal-body");
    body.innerHTML = `
      <p class="meta">${escapeHtml(t("Programs exported from MyInnoX1, or routines written by an AI."))}</p>
      <div class="pl-seg pio-tabs" role="tablist" aria-label="${escapeHtml(t("Import source"))}">
        <button type="button" role="tab" id="pio-tab-file-btn" aria-selected="true" aria-controls="pio-pane-file" tabindex="0">${escapeHtml(t("File"))}</button>
        <button type="button" role="tab" id="pio-tab-paste-btn" aria-selected="false" aria-controls="pio-pane-paste" tabindex="-1">${escapeHtml(t("Paste JSON"))}</button>
      </div>
      <div id="pio-pane-file" class="pio-pane" role="tabpanel" aria-labelledby="pio-tab-file-btn">
        <p class="meta">${escapeHtml(t("Choose a .json file."))}</p>
        <div class="actions pio-actions">
          <button type="button" id="pio-choose">${escapeHtml(t("Choose file"))}</button>
          <button type="button" class="secondary" id="pio-file-cancel">${escapeHtml(t("Cancel"))}</button>
        </div>
      </div>
      <div id="pio-pane-paste" class="pio-pane" role="tabpanel" aria-labelledby="pio-tab-paste-btn" hidden>
        <label for="pio-paste">${escapeHtml(t("Paste the answer of your AI (or a program file) here."))}</label>
        <textarea id="pio-paste" rows="9" spellcheck="false" autocomplete="off" placeholder='{ "format": "myinnox1-routines", ... }'></textarea>
        <p id="pio-paste-err" class="server-error" role="alert" hidden></p>
        <div id="pio-paste-fb"></div>
        <div class="actions pio-actions">
          <button type="button" id="pio-paste-go">${escapeHtml(t("Preview import"))}</button>
          <button type="button" class="secondary" id="pio-paste-copy" hidden>${escapeHtml(t("Copy errors for AI"))}</button>
          <button type="button" class="secondary" id="pio-paste-cancel">${escapeHtml(t("Cancel"))}</button>
        </div>
      </div>`;
    const tab = (which, focusPane = true) => {
      for (const k of ["file", "paste"]) {
        const b = $(`pio-tab-${k}-btn`);
        b.setAttribute("aria-selected", String(k === which));
        b.tabIndex = k === which ? 0 : -1;
        $(`pio-pane-${k}`).hidden = k !== which;
      }
      if (focusPane) (which === "paste" ? $("pio-paste") : $("pio-choose")).focus();
    };
    $("pio-tab-file-btn").onclick = () => tab("file");
    $("pio-tab-paste-btn").onclick = () => tab("paste");
    // Arrow keys / Home / End move between the two tabs (selection follows focus).
    $("pio-tab-file-btn").parentElement.addEventListener("keydown", (e) => {
      const order = ["file", "paste"], cur = $("pio-tab-paste-btn").getAttribute("aria-selected") === "true" ? 1 : 0;
      let next = null;
      if (e.key === "ArrowRight" || e.key === "ArrowLeft") next = 1 - cur;
      else if (e.key === "Home") next = 0; else if (e.key === "End") next = 1;
      if (next === null) return;
      e.preventDefault(); tab(order[next], false); $(`pio-tab-${order[next]}-btn`).focus();
    });
    $("pio-choose").onclick = () => fileInput.click();
    $("pio-file-cancel").onclick = () => closeModal();
    $("pio-paste-cancel").onclick = () => closeModal();
    let lastFatal = null;
    $("pio-paste-go").onclick = async () => {
      const err = $("pio-paste-err"), copy = $("pio-paste-copy"), go = $("pio-paste-go");
      err.hidden = true; copy.hidden = true; lastFatal = null;
      const text = $("pio-paste").value;
      if (!text.trim()) { err.textContent = t("Paste the JSON first."); err.hidden = false; $("pio-paste").focus(); return; }
      go.disabled = true;
      const fatal = await runImport(text, openerEl, { tolerant: true });
      go.disabled = false;
      if (!fatal) return;
      lastFatal = fatal;
      err.textContent = fatal.message || (fatal.code === "wrong-format" ? t("That is not a MyInnoX1 routines file (format myinnox1-routines) or program file.") : errorMessage(fatal, true));
      err.hidden = false;
      copy.hidden = !!fatal.message;
    };
    $("pio-paste-copy").onclick = () => { if (lastFatal) copyText(K.errorsForAI([], lastFatal), $("pio-paste-fb")); };
    $("pio-choose").focus();
  }

  function renderPreview(rows, openerEl, ctx = { kind: "program" }) {
    openModal(t("Import programs"), openerEl);
    const ai = ctx.kind === "routines";
    const body = $("pio-modal-body");
    body.innerHTML = `
      <p class="meta">${escapeHtml(t("Select the programs to import. Names that already exist get a copy suffix."))}</p>
      <div id="pio-ai-tools"></div>
      <ul id="pio-rows" class="pio-rows"></ul>
      <p id="pio-summary" class="meta" role="status" aria-live="polite"></p>
      <div class="actions pio-actions">
        <button type="button" id="pio-go"></button>
        <button type="button" class="secondary" id="pio-cancel">${escapeHtml(t("Cancel"))}</button>
      </div>`;
    const ul = $("pio-rows"), go = $("pio-go"), summary = $("pio-summary");

    const nameOk = (r) => r.name.trim().length > 0;
    const importable = () => rows.filter((r) => r.valid && r.selected && nameOk(r) && !r.status);
    const refresh = () => {
      go.textContent = t("Import selected ({n})", { n: importable().length });
      go.disabled = busy || importable().length === 0;
    };

    for (const r of rows) {
      const li = document.createElement("li");
      li.className = "pio-row" + (r.valid ? "" : " invalid");
      const id = `pio-sel-${r.i}`, nid = `pio-name-${r.i}`;
      const msgs = r.errors.map((e) => `<li class="err">${escapeHtml(errorMessage(e, ai))}</li>`).join("")
        + r.warnings.map((e) => `<li class="warn">${escapeHtml(errorMessage(e, ai))}</li>`).join("");
      const warn = r.missing ? `<li class="warn">${escapeHtml(t("Not in your action library, skipped: {text}", { text: I18N.plural(r.missing, "exercise") }))}</li>` : "";
      li.innerHTML = `
        <div class="pio-row-head">
          <input type="checkbox" id="${id}" ${r.valid ? "checked" : "disabled"} aria-label="${escapeHtml(t("Import {name}", { name: r.name || t("(no name)") }))}">
          <input type="text" id="${nid}" class="pio-name" value="${escapeHtml(r.name)}" ${r.valid ? "" : "disabled"} aria-label="${escapeHtml(t("Name"))}" autocomplete="off">
        </div>
        <p class="meta">${escapeHtml(I18N.plural(r.steps, "exercise"))}</p>
        <ul class="pio-msgs">${msgs}${warn}</ul>
        <p class="pio-status" role="status"></p>`;
      ul.appendChild(li);
      r.el = li;
      li.querySelector(`#${id}`).addEventListener("change", (e) => { r.selected = e.target.checked; refresh(); });
      li.querySelector(`#${nid}`).addEventListener("input", (e) => { r.name = e.target.value; refresh(); });
    }
    refresh();
    if (ai) renderAiTools(rows, openerEl, ctx);
    const skipped = rows.filter((r) => !r.valid).length;
    if (skipped) summary.textContent = t("{n} entries in the file cannot be imported.", { n: skipped });
    $("pio-cancel").onclick = () => closeModal();
    (ul.querySelector("input:not(:disabled)") || $("pio-cancel")).focus();

    go.onclick = async () => {
      const todo = importable();
      busy = true; go.disabled = true; $("pio-cancel").disabled = true;
      ul.querySelectorAll("input").forEach((el) => { el.disabled = true; });
      let ok = 0, done = 0;
      for (const r of todo) { // sequential; one failure does not stop the others
        const status = r.el.querySelector(".pio-status");
        status.className = "pio-status"; status.textContent = t("Importing…");
        summary.textContent = t("Importing {done} of {total}…", { done, total: todo.length });
        try {
          const body = C.toSaveBody(r.program, { name: r.name });
          await api("/course/custom/save", { method: "POST", body: JSON.stringify(body) });
          r.status = "ok"; ok++;
          status.className = "pio-status ok"; status.textContent = t("Imported");
        } catch (e) {
          r.status = "fail";
          status.className = "pio-status err"; status.textContent = t("Failed: {msg}", { msg: C.safeMessage(e, t("The server rejected the request")) });
        }
        done++;
      }
      busy = false;
      summary.textContent = t("Imported {ok} of {total}", { ok, total: todo.length });
      toast(t("Imported {ok} of {total}", { ok, total: todo.length }), ok < todo.length);
      go.hidden = true;
      const cancel = $("pio-cancel");
      cancel.disabled = false; cancel.textContent = t("Done"); cancel.classList.remove("secondary");
      cancel.focus();
      if (ok) loadPrograms();
    };
  }

  // AI routines extras: suggested weekdays, schedule problems, skip-bad-steps, copy errors for the AI.
  function renderAiTools(rows, openerEl, ctx) {
    const box = $("pio-ai-tools");
    const day = (w) => new Date(2024, 0, 1 + K.WEEKDAYS.indexOf(w)).toLocaleDateString(I18N.lang, { weekday: "short" });
    const sched = ctx.schedule.length ? `<p class="meta">${escapeHtml(t("Suggested days: {text}", { text: ctx.schedule.map((s) => `${day(s.weekday)} ${s.routine}`).join(", ") }))}</p>` : "";
    const fileErrs = ctx.fileErrors.length ? `<ul class="pio-msgs">${ctx.fileErrors.map((e) => `<li class="err">${escapeHtml(errorMessage(e, true))}</li>`).join("")}</ul>` : "";
    const hasStepProblems = ctx.skipBad || rows.some((r) => r.errors.some((e) => e.step));
    const skip = hasStepProblems ? `<label class="ai-check"><input type="checkbox" id="pio-skip" ${ctx.skipBad ? "checked" : ""}> <span>${escapeHtml(t("Skip steps that have problems"))}</span></label>` : "";
    const copy = ctx.errors.length ? `<button type="button" class="secondary" id="pio-copy-errors">${escapeHtml(t("Copy errors for AI"))}</button>` : "";
    box.innerHTML = sched + fileErrs + skip + copy + `<div id="pio-copy-fb"></div>`;
    const sk = $("pio-skip");
    if (sk) sk.onchange = async () => { // re-parse with the other mode; the preview is rebuilt
      const fatal = await runImport(ctx.text, openerEl, { tolerant: ctx.tolerant, skipBad: sk.checked });
      if (fatal) showImportError(fatal.message || errorMessage(fatal, true), openerEl);
      else { const again = $("pio-skip"); if (again) again.focus(); }
    };
    const cp = $("pio-copy-errors");
    if (cp) cp.onclick = () => copyText(K.errorsForAI(ctx.errors), $("pio-copy-fb"));
  }

  // ---------- wiring ----------
  const fileInput = $("pio-file");
  $("import-program-btn").addEventListener("click", (e) => openImportDialog(e.currentTarget));
  fileInput.addEventListener("change", () => {
    const f = fileInput.files && fileInput.files[0];
    fileInput.value = ""; // allow re-selecting the same file
    if (f) startImport(f, $("import-program-btn"));
  });
  $("export-all-btn").addEventListener("click", (e) => exportAll(e.currentTarget));

  window.ProgramIO = { exportOne, cloneOne };
})();
