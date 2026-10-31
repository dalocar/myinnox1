/* Program export / import / clone (screen code). Pure logic lives in
   program-io-core.js. Uses globals from app.js: $, api, toast, t, escapeHtml,
   getActionLibrary, loadPrograms. Exports keep the server's stored values
   (tenths of kg), so files are independent of the account unit setting. */
(() => {
  const C = window.ProgramIOCore;
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

  function errorMessage(e) {
    const list = LIST_LABEL[e.list] ? t(LIST_LABEL[e.list]) : "";
    switch (e.code) {
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

  async function startImport(file, openerEl) {
    let text;
    try { text = await file.text(); } catch (e) { showImportError(t("Could not read the file: {msg}", { msg: C.safeMessage(e, t("The server rejected the request")) }), openerEl); return; }
    const parsed = C.parseImport(text);
    if (parsed.fatal) { showImportError(errorMessage(parsed.fatal), openerEl); return; }

    let existing = [], libIds = null;
    try { existing = (await fetchList()).map((x) => x.name); }
    catch (e) { showImportError(t("Import failed: {msg}", { msg: C.safeMessage(e, t("The server rejected the request")) }), openerEl); return; }
    try { libIds = new Set((await getPickableActions()).map((a) => a.id)); } catch { /* skip the library check */ }

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
      return { i, program, errors, missing, steps, valid, name, selected: valid, status: "" };
    });
    renderPreview(rows, openerEl);
  }

  function renderPreview(rows, openerEl) {
    openModal(t("Import programs"), openerEl);
    const body = $("pio-modal-body");
    body.innerHTML = `
      <p class="meta">${escapeHtml(t("Select the programs to import. Names that already exist get a copy suffix."))}</p>
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
      const msgs = r.errors.map((e) => `<li class="err">${escapeHtml(errorMessage(e))}</li>`).join("");
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

  // ---------- wiring ----------
  const fileInput = $("pio-file");
  $("import-program-btn").addEventListener("click", () => fileInput.click());
  fileInput.addEventListener("change", () => {
    const f = fileInput.files && fileInput.files[0];
    fileInput.value = ""; // allow re-selecting the same file
    if (f) startImport(f, $("import-program-btn"));
  });
  $("export-all-btn").addEventListener("click", (e) => exportAll(e.currentTarget));

  window.ProgramIO = { exportOne, cloneOne };
})();
