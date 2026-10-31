/* Plan Builder UI. Pure logic lives in planner-core.js (PlannerCore); this file is
   DOM + API wiring. Uses api(), toast(), escapeHtml(), $ from app.js (loaded first;
   nothing here runs at load time except defining things, so order is safe). */
(function () {
  const PC = PlannerCore;
  const DOW_EN = ["", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const DOW = { get: (i) => (i ? t(DOW_EN[i]) : "") };
  const MON = { get: (i) => I18N.months()[i] };
  const PICKER_CAP = 80;

  const P = {
    inited: false,
    view: "list",        // "list" | "wizard"
    draft: null,
    readOnly: false,     // stopped / ended plan
    step: 1,
    steps: [1, 2, 3],
    sel: new Set(),      // multi-selected dates (step 3)
    snapshot: "",
    saving: false,
    lib: { custom: null, official: null },
    covers: null,
  };

  // ---------- helpers ----------
  const dayLabel = (d) => {
    const md = I18N.dayMonth(PC.parseDate(d).getDate(), PC.parseDate(d).getMonth()), wd = DOW.get(PC.weekdayOf(d));
    return I18N.weekdayAfter() ? `${md}(${wd})` : `${wd} ${md}`;
  };
  const shortDate = (d) => I18N.dayMonth(PC.parseDate(d).getDate(), PC.parseDate(d).getMonth());
  function rangeLabel(a, b) {
    if (!a) return "";
    const y = (d) => PC.parseDate(d).getFullYear();
    if (I18N.yearFirst()) { // 2026年10月26日 – 12月20日
      const ys = (d) => y(d) + (LANG() === "ko" ? "년 " : "年");
      if (!b || a === b) return ys(a) + shortDate(a);
      return `${ys(a)}${shortDate(a)} – ${y(a) !== y(b) ? ys(b) : ""}${shortDate(b)}`;
    }
    if (!b || a === b) return `${shortDate(a)} ${y(a)}`;
    return `${shortDate(a)}${y(a) !== y(b) ? " " + y(a) : ""} – ${shortDate(b)} ${y(b)}`;
  }
  const plural = (n, w) => I18N.plural(n, w);

  const FRIENDLY = {
    plan_already_exist_ongoing: "You already have an ongoing plan. Stop it first (only one ongoing plan is allowed).",
    plan_status_error: "This plan is stopped or ended, so it can't be changed.",
    plan_name_can_not_be_null: "The plan needs a name.",
    plan_weeks_can_not_be_null: "The plan needs a number of weeks.",
    plan_prefer_days_can_not_be_null: "Pick at least one training weekday.",
    plan_train_days_can_not_be_null: "The plan has no training days.",
    plan_item_map_can_not_be_null: "The plan has no routines scheduled.",
    plan_train_days_not_match: "Training days and scheduled days don't match.",
  };
  const friendly = (e) => {
    const m = (e && e.message) || String(e);
    return FRIENDLY[m] ? t(FRIENDLY[m]) : m;
  };

  /** Plan endpoints need the client clock. GET: query; POST: body. Existing api() is reused. */
  function planApi(path, { method = "GET", query = {}, body = {}, noTime = false } = {}) {
    const cur = noTime ? null : PC.formatDateTime();
    if (method === "GET") {
      const q = Object.assign({}, query);
      if (cur) q.curTime = cur;
      const qs = Object.entries(q).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join("&");
      return api(`/plan/${path}?${qs}`);
    }
    const b = cur ? Object.assign({ curTime: cur }, body) : body;
    return api(`/plan/${path}`, { method: "POST", body: JSON.stringify(b) });
  }

  /** PlannerCore validation messages are English; map them (incl. the two with numbers). */
  function errText(m) {
    let r;
    if ((r = /^(\d+) training days? (?:has|have) no routine\.$/.exec(m))) return t("{text} without a routine.", { text: plural(+r[1], "training day") });
    if ((r = /^Weeks must be between 1 and (\d+)\.$/.exec(m))) return t("Weeks must be between 1 and {n}.", { n: r[1] });
    return t(m);
  }

  // ---------- modal infrastructure (focus management, Esc, inert background) ----------
  const stack = [];
  let modalSeq = 0;
  function createModal(title, { cls = "", noClose = false, fallback = null, onClose = null } = {}) {
    const id = "pl-modal-" + ++modalSeq;
    const prev = stack[stack.length - 1];
    const back = document.createElement("div");
    back.className = "pl-backdrop";
    back.innerHTML = `
      <div class="pl-modal ${cls}" role="dialog" aria-modal="true" aria-labelledby="${id}-t">
        <div class="pl-modal-head">
          <h3 class="no-margin" id="${id}-t" tabindex="-1">${escapeHtml(title)}</h3>
          ${noClose ? "" : `<button type="button" class="secondary pl-close">${escapeHtml(t("Close"))}</button>`}
        </div>
        <div class="pl-modal-body"></div>
      </div>`;
    const m = {
      el: back, body: back.querySelector(".pl-modal-body"), title: back.querySelector("h3"),
      opener: document.activeElement, closed: false,
      close() {
        if (m.closed) return;
        m.closed = true;
        back.remove();
        const i = stack.indexOf(m);
        if (i >= 0) stack.splice(i, 1);
        const top = stack[stack.length - 1];
        if (top) top.el.inert = false; else $("app").inert = false;
        let t = m.opener;
        if (!t || !t.isConnected) t = fallback ? fallback() : null;
        if (t && t.focus) t.focus();
        if (onClose) onClose();
      },
    };
    const closeBtn = back.querySelector(".pl-close");
    if (closeBtn) closeBtn.addEventListener("click", () => m.close());
    if (!noClose) back.addEventListener("mousedown", (e) => { if (e.target === back) m.close(); });
    if (prev) prev.el.inert = true; else $("app").inert = true;
    stack.push(m);
    document.body.appendChild(back);
    return m;
  }
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && stack.length) {
      e.preventDefault();
      stack[stack.length - 1].close();
    }
  });

  /** Promise-based dialog. buttons: [{label, value, kind}]; resolves with value, or null if dismissed. */
  function dialog({ title, html, buttons, focus = 0 }) {
    return new Promise((resolve) => {
      let result = null;
      const m = createModal(title, { cls: "pl-dialog", onClose: () => resolve(result) });
      m.body.innerHTML = `<div class="pl-dialog-text">${html}</div>
        <div class="pl-dialog-btns">${buttons.map((b, i) =>
          `<button type="button" data-i="${i}" class="${b.kind === "primary" ? "" : b.kind === "danger" ? "danger-btn" : "secondary"}">${escapeHtml(b.label)}</button>`).join("")}</div>`;
      m.body.querySelectorAll("button").forEach((btn) => btn.addEventListener("click", () => {
        result = buttons[+btn.dataset.i].value;
        m.close();
      }));
      m.body.querySelectorAll("button")[focus].focus();
    });
  }

  // ---------- reorderable lists (buttons + keyboard + pointer drag) ----------
  function enableReorder(list, onMove) {
    const idx = (el) => Array.from(list.children).indexOf(el.closest("li"));
    list.addEventListener("click", (e) => {
      const b = e.target.closest("[data-reorder]");
      if (!b || b.dataset.reorder === "handle" || b.disabled) return;
      const i = idx(b);
      onMove(i, b.dataset.reorder === "up" ? i - 1 : i + 1, b.dataset.reorder);
    });
    list.addEventListener("keydown", (e) => {
      const h = e.target.closest('[data-reorder="handle"]');
      if (!h || (e.key !== "ArrowUp" && e.key !== "ArrowDown")) return;
      e.preventDefault();
      const i = idx(h);
      onMove(i, e.key === "ArrowUp" ? i - 1 : i + 1, "handle");
    });
    let drag = null;
    const rows = () => Array.from(list.children);
    const clear = () => rows().forEach((r) => r.classList.remove("drop-before", "drop-after"));
    list.addEventListener("pointerdown", (e) => {
      const h = e.target.closest('[data-reorder="handle"]');
      if (!h || (e.button !== undefined && e.button > 0)) return;
      e.preventDefault();
      drag = { i: idx(h), slot: idx(h), h };
      h.setPointerCapture(e.pointerId);
      h.closest("li").classList.add("dragging");
      document.body.classList.add("reordering");
    });
    list.addEventListener("pointermove", (e) => {
      if (!drag) return;
      const rs = rows();
      let slot = rs.length;
      for (let k = 0; k < rs.length; k++) {
        const r = rs[k].getBoundingClientRect();
        if (e.clientY < r.top + r.height / 2) { slot = k; break; }
      }
      drag.slot = slot;
      clear();
      if (slot < rs.length) rs[slot].classList.add("drop-before"); else rs[rs.length - 1].classList.add("drop-after");
      if (e.clientY < 60) window.scrollBy(0, -12);
      else if (e.clientY > window.innerHeight - 60) window.scrollBy(0, 12);
    });
    const end = (cancel) => {
      if (!drag) return;
      const { i, slot, h } = drag;
      drag = null;
      clear();
      h.closest("li").classList.remove("dragging");
      document.body.classList.remove("reordering");
      if (cancel) return;
      const to = slot > i ? slot - 1 : slot;
      if (to !== i) onMove(i, to, "handle");
    };
    list.addEventListener("pointerup", () => end(false));
    list.addEventListener("pointercancel", () => end(true));
  }
  function focusReorder(root, to, kind) {
    const li = root.querySelectorAll("li")[to];
    if (!li) return;
    let b = li.querySelector(`[data-reorder="${kind}"]`);
    if (b && b.disabled) b = li.querySelector(`[data-reorder="${kind === "up" ? "down" : "up"}"]`);
    if (b) b.focus({ preventScroll: true });
  }
  const reorderBtns = (i, total, label) => `
    <button type="button" class="reorder-btn drag-handle" data-reorder="handle" aria-label="${escapeHtml(t("Drag to reorder {name} (or use arrow keys)", { name: label }))}" title="${escapeHtml(t("Drag to reorder"))}">⠿</button>
    <button type="button" class="reorder-btn" data-reorder="up" aria-label="${escapeHtml(t("Move {name} up", { name: label }))}" title="${escapeHtml(t("Move up"))}"${i === 0 ? " disabled" : ""}>▲</button>
    <button type="button" class="reorder-btn" data-reorder="down" aria-label="${escapeHtml(t("Move {name} down", { name: label }))}" title="${escapeHtml(t("Move down"))}"${i === total - 1 ? " disabled" : ""}>▼</button>`;

  // ---------- library (routines) ----------
  async function getLib(kind) {
    if (P.lib[kind]) return P.lib[kind];
    const path = kind === "custom" ? "/course/custom/list" : "/course/list";
    const res = await api(path);
    P.lib[kind] = (res.data || []).map((c) => Object.assign(PC.toItem(c), {
      courseNo: c.courseNo || "", actionNum: c.actionNum, level: c.level,
      custom: kind === "custom" ? 1 : 0,
    }));
    return P.lib[kind];
  }
  async function getCovers() {
    if (P.covers) return P.covers;
    try {
      const res = await planApi("cover/list", { noTime: true });
      P.covers = Array.isArray(res.data) ? res.data : [];
    } catch { P.covers = []; }
    return P.covers;
  }

  const itemMeta = (it) => [it.custom ? t("My template") : t("Course"), it.courseNo, it.actionNum != null ? plural(it.actionNum, "exercise") : ""].filter(Boolean).join(" · ");
  const thumb = (it) => `<img class="pl-thumb" src="${escapeHtml(it.smallImg || DEFAULT_COVER)}" alt="" loading="lazy">`;

  /**
   * Routine picker. opts: {title, multi, selected, onChange(list), onDone(list), onPick(item), doneLabel, fallback}
   * multi: rows toggle (aria-pressed); single: tapping a row calls onPick and closes.
   */
  function openPicker(opts) {
    let tab = (opts.selected || []).some((i) => !i.custom) && !(opts.selected || []).some((i) => i.custom) ? "official" : "custom";
    let sel = (opts.selected || []).slice();
    let query = "";
    const m = createModal(opts.title, { cls: "pl-picker", fallback: opts.fallback });
    m.body.innerHTML = `
      <div class="pl-seg" role="group" aria-label="${escapeHtml(t("Routine source"))}">
        <button type="button" data-tab="custom">${escapeHtml(t("My templates"))}</button>
        <button type="button" data-tab="official">${escapeHtml(t("Courses"))}</button>
      </div>
      <input type="search" class="pl-search" placeholder="${escapeHtml(t("Search routines…"))}" aria-label="${escapeHtml(t("Search routines"))}" autocomplete="off">
      <div class="pl-results" role="list"></div>
      ${opts.multi ? `<div class="pl-picker-foot"><span class="meta pl-count" aria-live="polite"></span><button type="button" class="pl-done">${escapeHtml(opts.doneLabel || t("Done"))}</button></div>` : ""}`;
    const results = m.body.querySelector(".pl-results");
    const search = m.body.querySelector(".pl-search");
    const count = m.body.querySelector(".pl-count");
    let items = [];

    function syncTabs() {
      m.body.querySelectorAll("[data-tab]").forEach((b) => b.setAttribute("aria-pressed", b.dataset.tab === tab ? "true" : "false"));
    }
    function syncCount() { if (count) count.textContent = t("{n} selected", { n: plural(sel.length, "routine") }); }
    function renderRows() {
      const q = query.trim().toLowerCase();
      const matches = q ? items.filter((i) => (i.name + " " + i.courseNo).toLowerCase().includes(q)) : items;
      if (!matches.length) {
        results.innerHTML = `<p class="empty-state">${escapeHtml(items.length ? t("No matches.") : tab === "custom" ? t("No custom templates yet. Create one in the Programs tab.") : t("No courses available."))}</p>`;
        return;
      }
      const shown = matches.slice(0, PICKER_CAP);
      results.innerHTML = shown.map((it) => {
        const on = sel.some((s) => s.courseId === it.courseId);
        return `<button type="button" class="pl-row${on ? " on" : ""}" data-id="${it.courseId}"${opts.multi ? ` aria-pressed="${on}"` : ""}>
          ${thumb(it)}
          <span class="pl-row-text"><span class="pl-row-name">${escapeHtml(it.name)}</span><span class="meta">${escapeHtml(itemMeta(it))}</span></span>
          ${opts.multi ? `<span class="pl-check" aria-hidden="true">${on ? "✓" : ""}</span>` : ""}
        </button>`;
      }).join("") + (matches.length > shown.length ? `<p class="meta pl-more">${escapeHtml(t("Showing {shown} of {total} — type to narrow the list.", { shown: shown.length, total: matches.length }))}</p>` : "");
    }
    async function loadTab() {
      syncTabs();
      results.innerHTML = `<p class="meta">${t("Loading…")}</p>`;
      try {
        items = await getLib(tab);
        renderRows();
      } catch (e) {
        results.innerHTML = `<p class="server-error">${escapeHtml(friendly(e))} <button type="button" class="secondary pl-retry">${escapeHtml(t("Retry"))}</button></p>`;
        results.querySelector(".pl-retry").onclick = loadTab;
      }
    }
    m.body.querySelectorAll("[data-tab]").forEach((b) => b.addEventListener("click", () => { tab = b.dataset.tab; loadTab(); }));
    let timer = null;
    search.addEventListener("input", () => { clearTimeout(timer); timer = setTimeout(() => { query = search.value; renderRows(); }, 120); });
    results.addEventListener("click", (e) => {
      const row = e.target.closest(".pl-row");
      if (!row) return;
      const it = items.find((i) => String(i.courseId) === row.dataset.id);
      if (!it) return;
      if (!opts.multi) { m.close(); opts.onPick(it); return; }
      const at = sel.findIndex((s) => s.courseId === it.courseId);
      if (at >= 0) sel.splice(at, 1); else sel.push(PC.toItem(it));
      row.classList.toggle("on", at < 0);
      row.setAttribute("aria-pressed", String(at < 0));
      row.querySelector(".pl-check").textContent = at < 0 ? "✓" : "";
      syncCount();
      if (opts.onChange) opts.onChange(sel.slice());
    });
    const done = m.body.querySelector(".pl-done");
    if (done) done.addEventListener("click", () => { m.close(); if (opts.onDone) opts.onDone(sel.slice()); });
    syncCount();
    loadTab();
    search.focus();
    return m;
  }

  // ---------- draft snapshot / dirty ----------
  function snap(d) {
    return JSON.stringify([d.name, d.startDate, d.weeks, d.weekdays, d.pic, d.mode, d.restartEachWeek,
      d.routines.map((r) => r.courseId),
      Object.keys(d.days).sort().map((k) => [k, d.days[k].map((i) => i.courseId)]),
      Array.from(d.edited).sort()]);
  }
  const isDirty = () => !P.readOnly && P.draft && snap(P.draft) !== P.snapshot;

  // ---------- list view ----------
  function showView(v) {
    P.view = v;
    $("plans-list-view").hidden = v !== "list";
    $("plans-wizard").hidden = v !== "wizard";
  }

  async function loadPlans() {
    const root = $("plans-list");
    root.innerHTML = `<p class="meta">${t("Loading…")}</p>`;
    try {
      const [on, off] = await Promise.all([planApi("list/ongoing"), planApi("list/stopped")]);
      const ongoing = on.data || [], stopped = off.data || [];
      root.innerHTML = "";
      root.appendChild(planSection(t("Ongoing"), ongoing, true, t("No ongoing plan. Use “New Plan” to build one.")));
      root.appendChild(planSection(t("Stopped & ended"), stopped, false, t("Nothing here yet.")));
    } catch (e) {
      root.innerHTML = `<p class="server-error">${escapeHtml(t("Failed to load plans: {msg}", { msg: friendly(e) }))}</p>`;
    }
  }

  function planSection(title, plans, ongoing, emptyText) {
    const sec = document.createElement("section");
    sec.className = "pl-section";
    sec.innerHTML = `<h3>${title} <span class="pl-badge">${plans.length}</span></h3>`;
    if (!plans.length) {
      sec.insertAdjacentHTML("beforeend", `<p class="empty-state">${emptyText}</p>`);
      return sec;
    }
    const list = document.createElement("div");
    list.className = "pl-cards";
    for (const p of plans) {
      const card = document.createElement("div");
      card.className = "program-card pl-card";
      const bits = [rangeLabel(p.startDate, p.endDate)];
      if (p.weeks) bits.push(plural(p.weeks, "week"));
      if (p.percent != null) bits.push(t("{n}% done", { n: p.percent }));
      card.innerHTML = `
        <div class="card-left">
          <img class="thumb" src="${escapeHtml(p.pic || DEFAULT_COVER)}" alt="">
          <div><div class="name">${escapeHtml(p.name)}</div><div class="meta">${escapeHtml(bits.join(" · "))}</div></div>
        </div>
        <div class="card-actions">
          <button type="button" data-act="open">${escapeHtml(ongoing ? t("View / Edit") : t("View"))}</button>
          ${ongoing ? `<button type="button" class="secondary" data-act="stop">${escapeHtml(t("Stop"))}</button>` : ""}
          <button type="button" class="danger-btn" data-act="del">${escapeHtml(t("Delete"))}</button>
        </div>`;
      card.querySelector('[data-act="open"]').onclick = () => openPlan(p.id);
      const stop = card.querySelector('[data-act="stop"]');
      if (stop) stop.onclick = () => stopPlan(p);
      card.querySelector('[data-act="del"]').onclick = () => deletePlan(p);
      list.appendChild(card);
    }
    sec.appendChild(list);
    return sec;
  }

  async function stopPlan(p) {
    const ok = await dialog({
      title: t("Stop this plan?"),
      html: `<p>${t("<b>{name}</b> will move to “Stopped & ended” and can't be edited afterwards.", { name: escapeHtml(p.name) })}</p>`,
      buttons: [{ label: t("Cancel"), value: false, kind: "secondary" }, { label: t("Stop plan"), value: true, kind: "danger" }],
    });
    if (!ok) return;
    try {
      await planApi("stop", { method: "POST", body: { planId: p.id } });
      toast(t("Plan stopped."));
    } catch (e) { toast(t("Stop failed: {msg}", { msg: friendly(e) }), true); }
    loadPlans();
  }
  async function deletePlan(p) {
    const ok = await dialog({
      title: t("Delete this plan?"),
      html: `<p>${t("<b>{name}</b> will be permanently deleted. This cannot be undone.", { name: escapeHtml(p.name) })}</p>`,
      buttons: [{ label: t("Cancel"), value: false, kind: "secondary" }, { label: t("Delete"), value: true, kind: "danger" }],
    });
    if (!ok) return;
    try {
      await planApi("delete", { method: "POST", body: { planId: p.id } });
      toast(t("Plan deleted."));
    } catch (e) { toast(t("Delete failed: {msg}", { msg: friendly(e) }), true); }
    loadPlans();
  }

  // ---------- wizard entry points ----------
  function enterWizard(draft, { readOnly = false, step = 1 } = {}) {
    P.draft = draft;
    P.readOnly = readOnly;
    P.sel = new Set();
    P.steps = draft.lockedBasics ? [1, 3] : [1, 2, 3];
    P.step = step;
    P.snapshot = snap(draft);
    P.saving = false;
    showView("wizard");
    renderWizard();
    $("pl-title").focus();
    window.scrollTo(0, 0);
  }

  async function newPlan() {
    P.lib.custom = null; // may have changed in the Programs tab
    const draft = PC.createDraft();
    const covers = await getCovers();
    if (covers.length) draft.pic = covers[0];
    PC.regenerate(draft);
    enterWizard(draft);
  }

  async function openPlan(id) {
    try {
      const res = await planApi("get", { query: { planId: id } });
      if (!res.data) { toast(t("That plan no longer exists."), true); loadPlans(); return; }
      P.lib.custom = null;
      const draft = PC.fromPlanGet(res.data);
      await getCovers();
      enterWizard(draft, { readOnly: res.data.status !== 1, step: 3 });
    } catch (e) { toast(t("Failed to load plan: {msg}", { msg: friendly(e) }), true); }
  }

  async function leaveWizard() {
    if (isDirty()) {
      const v = await dialog({
        title: t("Discard changes?"),
        html: `<p>${t("You have unsaved changes to this plan.")}</p>`,
        buttons: [{ label: t("Keep editing"), value: false, kind: "secondary" }, { label: t("Discard"), value: true, kind: "danger" }],
      });
      if (!v) return;
    }
    P.draft = null;
    showView("list");
    loadPlans();
  }

  // ---------- wizard rendering ----------
  function renderWizard() {
    const d = P.draft;
    $("pl-title").textContent = P.readOnly ? t("View plan") : d.id ? t("Edit plan") : t("New plan");
    renderStepper();
    renderBanner();
    renderStep();
    renderFooter();
  }

  const stepName = (s) => ({ 1: t("Basics"), 2: t("Routines"), 3: t("Review") })[s];
  function renderStepper() {
    const el = $("pl-stepper");
    el.innerHTML = P.steps.map((s, i) =>
      `<li><button type="button" data-step="${s}" class="pl-step-btn${s === P.step ? " active" : ""}"${s === P.step ? ' aria-current="step"' : ""}>
        <span class="pl-step-num">${i + 1}</span><span class="pl-step-name">${P.draft.lockedBasics && s === 1 ? t("Details") : stepName(s)}</span></button></li>`).join("");
    el.querySelectorAll("button").forEach((b) => b.addEventListener("click", () => goStep(+b.dataset.step)));
  }

  function renderBanner() {
    const d = P.draft;
    const el = $("pl-banner");
    if (P.readOnly) {
      el.innerHTML = `<div class="pl-note">${t("This plan is <b>{status}</b>, so it's view-only. The server doesn't allow changing stopped or ended plans.", { status: d.status === 3 ? t("stopped") : t("ended") })}</div>`;
    } else if (d.lockedBasics) {
      el.innerHTML = `<div class="pl-note">${escapeHtml(t("Editing a saved plan. Start date, length and weekdays are fixed (the server ignores changes to them), but you can rename it, change the cover and fine-tune every day."))}</div>`;
    } else el.innerHTML = "";
  }

  function goStep(n) {
    P.step = n;
    renderStepper();
    renderStep();
    renderFooter();
    $("pl-step").scrollIntoView({ block: "start", behavior: "auto" });
    const h = $("pl-step").querySelector("h3");
    if (h) { h.tabIndex = -1; h.focus({ preventScroll: true }); }
  }

  function renderStep() {
    if (P.step === 1) renderStep1();
    else if (P.step === 2) renderStep2();
    else renderStep3();
  }

  function renderFooter() {
    const d = P.draft;
    const idx = P.steps.indexOf(P.step);
    $("pl-back").hidden = idx <= 0;
    $("pl-next").hidden = idx >= P.steps.length - 1;
    const save = $("pl-save");
    save.hidden = idx < P.steps.length - 1 || P.readOnly;
    save.textContent = d.id ? t("Save changes") : t("Save plan");
    const msg = $("pl-footer-msg");
    const v = PC.validate(d);
    save.disabled = P.saving || v.errors.length > 0;
    if (P.step === 3 && !P.readOnly && v.errors.length) {
      msg.innerHTML = `<div class="pl-note warn" id="pl-errs"><b>${escapeHtml(t("Can't save yet:"))}</b><ul>${v.errors.map((e) => `<li>${escapeHtml(errText(e))}</li>`).join("")}</ul></div>`;
      save.setAttribute("aria-describedby", "pl-errs");
    } else {
      msg.innerHTML = "";
      save.removeAttribute("aria-describedby");
    }
  }

  // ---------- step 1: basics ----------
  function renderStep1() {
    const d = P.draft;
    const lock = d.lockedBasics || P.readOnly;
    const dis = P.readOnly ? " disabled" : "";
    const cov = P.covers || [];
    $("pl-step").innerHTML = `
      <h3 class="pl-h">${escapeHtml(d.lockedBasics ? t("Details") : t("Basics"))}</h3>
      <div class="pl-form">
        <label>${escapeHtml(t("Plan name"))} <input id="pl-name" type="text" maxlength="60" autocomplete="off" value="${escapeHtml(d.name)}" placeholder="${escapeHtml(t("e.g. Autumn strength"))}"${dis}></label>
        <label>${escapeHtml(t("Start date"))} <input id="pl-start" type="date" value="${escapeHtml(d.startDate)}"${lock ? " disabled" : ""}></label>
        <fieldset><legend>${escapeHtml(t("Length (weeks)"))}</legend>
          <div class="pl-chips" id="pl-weeks">${[1, 2, 3, 4].map((w) =>
            `<button type="button" class="chip" data-weeks="${w}" aria-pressed="${d.weeks === w}"${lock ? " disabled" : ""}>${w}</button>`).join("")}
            ${d.lockedBasics && d.weeks > 4 ? `<span class="meta">${escapeHtml(t("{n} weeks", { n: d.weeks }))}</span>` : ""}</div>
        </fieldset>
        <fieldset><legend>${escapeHtml(t("Training weekdays"))}</legend>
          <div class="pl-chips" id="pl-wd">${[1, 2, 3, 4, 5, 6, 7].map((w) =>
            `<button type="button" class="chip" data-wd="${w}" aria-pressed="${d.weekdays.includes(w)}"${lock ? " disabled" : ""}>${DOW.get(w)}</button>`).join("")}</div>
        </fieldset>
        <p class="meta" id="pl-summary" aria-live="polite"></p>
        <fieldset><legend>${escapeHtml(t("Cover"))}</legend>
          <div class="pl-covers" id="pl-covers">
            <button type="button" class="pl-cover none" data-pic="" aria-pressed="${!d.pic}"${dis}>${escapeHtml(t("None"))}</button>
            ${cov.map((u, i) => `<button type="button" class="pl-cover" data-pic="${escapeHtml(u)}" aria-label="${escapeHtml(t("Cover {n}", { n: i + 1 }))}" aria-pressed="${d.pic === u}"${dis}><img src="${escapeHtml(u)}" alt=""></button>`).join("")}
          </div>
        </fieldset>
      </div>`;
    const syncSummary = () => {
      const n = Object.keys(d.days).length;
      const dates = PC.draftDates(d);
      $("pl-summary").textContent = n
        ? t("{days}, {range}.", { days: plural(n, "training day"), range: rangeLabel(dates[0], dates[n - 1]) })
        : t("No training days yet — pick at least one weekday.");
    };
    const sync = () => {
      document.querySelectorAll("#pl-weeks [data-weeks]").forEach((b) => b.setAttribute("aria-pressed", String(+b.dataset.weeks === d.weeks)));
      document.querySelectorAll("#pl-wd [data-wd]").forEach((b) => b.setAttribute("aria-pressed", String(d.weekdays.includes(+b.dataset.wd))));
      document.querySelectorAll("#pl-covers [data-pic]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.pic === d.pic)));
      syncSummary();
      renderFooter();
    };
    const regen = () => { PC.regenerate(d); P.sel = new Set(); sync(); };
    syncSummary();
    $("pl-name").addEventListener("input", (e) => { d.name = e.target.value; renderFooter(); });
    $("pl-start").addEventListener("change", (e) => { if (PC.parseDate(e.target.value)) { d.startDate = e.target.value; regen(); } else e.target.value = d.startDate; });
    $("pl-weeks").addEventListener("click", (e) => {
      const b = e.target.closest("[data-weeks]");
      if (b && !b.disabled) { d.weeks = +b.dataset.weeks; regen(); }
    });
    $("pl-wd").addEventListener("click", (e) => {
      const b = e.target.closest("[data-wd]");
      if (!b || b.disabled) return;
      const w = +b.dataset.wd;
      d.weekdays = d.weekdays.includes(w) ? d.weekdays.filter((x) => x !== w) : d.weekdays.concat(w).sort((a, b2) => a - b2);
      regen();
    });
    $("pl-covers").addEventListener("click", (e) => {
      const b = e.target.closest("[data-pic]");
      if (b && !b.disabled) { d.pic = b.dataset.pic; sync(); }
    });
  }

  // ---------- step 2: routines + distribution ----------
  const modeHelp = (m) => m === "all"
    ? t("Every training day gets all the selected routines, in the order shown below.")
    : t("Each training day gets the next routine in the list, then it loops back to the first. With Mon/Wed/Fri and A, B: Mon A · Wed B · Fri A · next Mon B…");

  function afterDistributionChange() {
    PC.regenerate(P.draft);
    P.sel = new Set(Array.from(P.sel).filter((x) => x in P.draft.days));
  }

  function renderStep2(focus) {
    const d = P.draft;
    const n = d.routines.length;
    $("pl-step").innerHTML = `
      <h3 class="pl-h">${escapeHtml(t("Routines & distribution"))}</h3>
      <div class="pl-block">
        <div class="row-between"><strong>${escapeHtml(t("Routines"))}</strong><button type="button" id="pl-add-routines" class="secondary">${escapeHtml(n ? t("Add / change routines") : t("+ Choose routines"))}</button></div>
        ${n ? `<ol class="pl-routines" id="pl-routines">${d.routines.map((r, i) => `
          <li>
            <span class="pl-item-main">${thumb(r)}<span class="pl-row-text"><span class="pl-row-name">${escapeHtml(r.name)}</span><span class="meta">${escapeHtml(r.custom ? t("My template") : t("Course"))}</span></span></span>
            <span class="pl-item-actions">${reorderBtns(i, n, r.name)}
              <button type="button" class="secondary pl-rm" data-rm="${i}" aria-label="${escapeHtml(t("Remove {name}", { name: r.name }))}" title="${escapeHtml(t("Remove"))}">✕</button></span>
          </li>`).join("")}</ol>`
          : `<p class="empty-state">${escapeHtml(t("Choose one or more routines — your own templates or official courses."))}</p>`}
      </div>
      <div class="pl-block">
        <strong id="pl-mode-label">${escapeHtml(t("Distribution"))}</strong>
        <div class="pl-seg" role="group" aria-labelledby="pl-mode-label" id="pl-mode">
          <button type="button" data-mode="all" aria-pressed="${d.mode === "all"}">${escapeHtml(t("Apply to all days"))}</button>
          <button type="button" data-mode="rotate" aria-pressed="${d.mode === "rotate"}">${escapeHtml(t("Rotate through routines"))}</button>
        </div>
        <p class="hint pl-help" id="pl-mode-help">${escapeHtml(modeHelp(d.mode))}</p>
        ${d.mode === "rotate" ? `<label class="pl-check-label"><input type="checkbox" id="pl-restart"${d.restartEachWeek ? " checked" : ""}> ${escapeHtml(t("Restart the order every week"))}</label>` : ""}
      </div>
      <div class="pl-block">
        <strong>${escapeHtml(t("Preview"))}</strong>
        <div id="pl-preview"></div>
      </div>`;
    renderPreview();
    $("pl-add-routines").addEventListener("click", () => openPicker({
      title: t("Choose routines"), multi: true, selected: d.routines, doneLabel: t("Done"),
      onChange: (list) => { d.routines = list; afterDistributionChange(); renderStep2(); },
      fallback: () => $("pl-add-routines"),
    }));
    const list = $("pl-routines");
    if (list) {
      enableReorder(list, (from, to, kind) => {
        if (to < 0 || to >= d.routines.length) return;
        d.routines = PC.moveInArray(d.routines, from, to);
        afterDistributionChange();
        renderStep2();
        focusReorder($("pl-routines"), to, kind);
      });
      list.addEventListener("click", (e) => {
        const b = e.target.closest("[data-rm]");
        if (!b) return;
        d.routines.splice(+b.dataset.rm, 1);
        afterDistributionChange();
        renderStep2();
        ($("pl-routines") ? $("pl-routines").querySelector(".pl-rm") : $("pl-add-routines")).focus();
      });
    }
    $("pl-mode").addEventListener("click", (e) => {
      const b = e.target.closest("[data-mode]");
      if (!b || b.dataset.mode === d.mode) return;
      d.mode = b.dataset.mode;
      afterDistributionChange();
      renderStep2();
      document.querySelector(`#pl-mode [data-mode="${d.mode}"]`).focus();
    });
    const rs = $("pl-restart");
    if (rs) rs.addEventListener("change", () => { d.restartEachWeek = rs.checked; afterDistributionChange(); renderPreview(); });
    renderFooter();
  }

  function renderPreview() {
    const d = P.draft;
    const el = $("pl-preview");
    if (!d.routines.length) { el.innerHTML = `<p class="meta">${escapeHtml(t("Pick at least one routine to see how the days will be filled."))}</p>`; return; }
    const dates = PC.trainingDates(d.startDate, d.weeks, d.weekdays);
    if (!dates.length) { el.innerHTML = `<p class="meta">${escapeHtml(t("No training days — check the weekdays in step 1."))}</p>`; return; }
    const dist = PC.distribute(dates, d.routines, d.mode, { restartEachWeek: d.restartEachWeek, startDate: d.startDate });
    const weeks = PC.groupByWeek(dates).slice(0, 2);
    el.innerHTML = weeks.map((g, i) => `
      <div class="pl-prev-week"><div class="meta">${escapeHtml(i === 0 ? t("First week") : t("Second week"))}</div>
      <ul class="pl-prev">${g.dates.map((x) => `<li><span class="pl-prev-day">${DOW.get(PC.weekdayOf(x))}</span><span>${dist[x].map((it) => `<span class="pl-item-chip ${it.custom ? "custom" : "official"}">${escapeHtml(it.name)}</span>`).join(" ")}</span></li>`).join("")}</ul></div>`).join("")
      + (PC.groupByWeek(dates).length > 2 ? `<p class="meta">${escapeHtml(t("…and {text} following the same pattern.", { text: plural(dates.length - weeks.reduce((a, g) => a + g.dates.length, 0), "more day") }))}</p>` : "");
  }

  // ---------- step 3: review & fine-tune ----------
  function chipsFor(items) {
    return items.map((it) => `<span class="pl-item-chip ${it.custom ? "custom" : "official"}">${escapeHtml(it.name)}</span>`).join("");
  }

  function renderStep3() {
    const d = P.draft;
    const y = window.scrollY;
    const dates = PC.draftDates(d);
    const v = PC.validate(d);
    const editable = !P.readOnly;
    const nSel = P.sel.size;
    const groups = PC.groupByWeek(dates);
    $("pl-step").innerHTML = `
      <h3 class="pl-h">${escapeHtml(t("Review & fine-tune"))}</h3>
      ${v.emptyDates.length ? `<div class="pl-note warn" role="status"><b>${escapeHtml(t("{text} without a routine.", { text: plural(v.emptyDates.length, "training day") }))}</b> ${editable ? escapeHtml(t("Tap a day to add one.")) : ""}
        ${editable ? `<button type="button" class="secondary" id="pl-sel-empty">${escapeHtml(t("Select empty days"))}</button>` : ""}</div>` : ""}
      ${editable ? `<div class="pl-toolbar">
        <button type="button" id="pl-apply"${nSel ? "" : " disabled"}>${escapeHtml(t("Apply routine to selected"))}${nSel ? ` (${nSel})` : ""}</button>
        <button type="button" class="secondary" id="pl-clear-sel"${nSel ? "" : " disabled"}>${escapeHtml(t("Clear selection"))}</button>
        ${d.routines.length && !d.lockedBasics ? `<button type="button" class="secondary" id="pl-reapply">${escapeHtml(t("Re-apply distribution"))}</button>` : ""}
      </div>
      <p class="meta">${escapeHtml(t("Tick the box on a day to select several, or tap a day to edit it. ✎ marks days changed by hand."))}</p>` : ""}
      ${groups.length ? groups.map((g) => `
        <section class="pl-week" aria-label="${escapeHtml(t("Week of {date}", { date: dayLabel(g.monday) }))}">
          <h4>${escapeHtml(t("Week of {date}", { date: dayLabel(g.monday) }))}</h4>
          <div class="pl-days">${g.dates.map((x) => dayCard(x)).join("")}</div>
        </section>`).join("") : `<p class="empty-state">${escapeHtml(t("No training days. Go back to Basics and pick weekdays."))}</p>`}`;
    window.scrollTo(0, y);

    const root = $("pl-step");
    root.querySelectorAll("[data-open]").forEach((b) => b.addEventListener("click", () => openDaySheet(b.dataset.open)));
    root.querySelectorAll("[data-sel]").forEach((c) => c.addEventListener("change", () => {
      if (c.checked) P.sel.add(c.dataset.sel); else P.sel.delete(c.dataset.sel);
      c.closest(".pl-day").classList.toggle("selected", c.checked);
      $("pl-apply").disabled = !P.sel.size;
      $("pl-apply").textContent = t("Apply routine to selected") + (P.sel.size ? ` (${P.sel.size})` : "");
      $("pl-clear-sel").disabled = !P.sel.size;
    }));
    const se = $("pl-sel-empty");
    if (se) se.onclick = () => { P.sel = new Set(v.emptyDates); renderStep3(); $("pl-apply").focus(); };
    if (!editable) return;
    $("pl-clear-sel").onclick = () => { P.sel = new Set(); renderStep3(); };
    $("pl-apply").onclick = () => {
      const target = Array.from(P.sel).sort();
      openPicker({
        title: t("Apply to {text}", { text: plural(target.length, "day") }), multi: true, selected: [], doneLabel: t("Apply to {text}", { text: plural(target.length, "day") }),
        fallback: () => $("pl-apply"),
        onDone: (list) => {
          if (!list.length) return;
          PC.applyToDates(d, target, list);
          P.sel = new Set();
          renderStep3();
          renderFooter();
          toast(t("Applied to {text}.", { text: plural(target.length, "day") }));
        },
      });
    };
    const re = $("pl-reapply");
    if (re) re.onclick = reapplyDistribution;
  }

  function dayCard(date) {
    const d = P.draft;
    const items = d.days[date] || [];
    const empty = !items.length;
    const edited = d.edited.has(date);
    const sel = P.sel.has(date);
    return `<div class="pl-day${empty ? " empty" : ""}${sel ? " selected" : ""}${edited ? " edited" : ""}">
      <button type="button" class="pl-day-open" data-open="${date}" aria-label="${dayLabel(date)}: ${empty ? escapeHtml(t("no routine")) : items.map((i) => escapeHtml(i.name)).join(", ")}${edited ? escapeHtml(t(", edited by hand")) : ""}. ${escapeHtml(P.readOnly ? t("View day") : t("Edit day"))}">
        <span class="pl-day-date">${dayLabel(date)}${edited ? ` <span class="pl-edited" title="${escapeHtml(t("Edited by hand"))}" aria-hidden="true">✎</span>` : ""}</span>
        <span class="pl-day-items">${empty ? `<span class="pl-none">${escapeHtml(t("No routine"))}</span>` : chipsFor(items)}</span>
      </button>
      ${P.readOnly ? "" : `<label class="pl-day-sel"><input type="checkbox" data-sel="${date}"${sel ? " checked" : ""} aria-label="${escapeHtml(t("Select {date}", { date: dayLabel(date) }))}"></label>`}
    </div>`;
  }

  async function reapplyDistribution() {
    const d = P.draft;
    const editedCount = Array.from(d.edited).filter((x) => x in d.days).length;
    let overwrite = false;
    if (editedCount) {
      const choice = await dialog({
        title: t("Re-apply distribution"),
        html: `<p>${escapeHtml(editedCount === 1
          ? t("{text} was changed by hand. What should happen to it?", { text: plural(editedCount, "day") })
          : t("{text} were changed by hand. What should happen to them?", { text: plural(editedCount, "day") }))}</p>`,
        buttons: [
          { label: t("Cancel"), value: null, kind: "secondary" },
          { label: t("Keep my edits"), value: "keep", kind: "primary" },
          { label: t("Overwrite everything"), value: "all", kind: "danger" },
        ],
        focus: 1,
      });
      if (!choice) return;
      overwrite = choice === "all";
    }
    PC.regenerate(d, { overwriteEdited: overwrite });
    P.sel = new Set();
    renderStep3();
    renderFooter();
    toast(overwrite || !editedCount ? t("Distribution re-applied.") : t("Re-applied to days you hadn't edited."));
  }

  // ---------- day sheet ----------
  function openDaySheet(date) {
    const d = P.draft;
    const m = createModal(dayLabel(date), {
      cls: "pl-daysheet",
      fallback: () => document.querySelector(`[data-open="${date}"]`),
      onClose: () => { const b = document.querySelector(`[data-open="${date}"]`); if (b) b.focus(); },
    });
    const ro = P.readOnly;
    function render(focusSel) {
      const items = d.days[date] || [];
      m.body.innerHTML = `
        ${d.edited.has(date) ? `<p class="meta">✎ ${escapeHtml(t("Edited by hand"))}</p>` : ""}
        ${items.length ? `<ol class="pl-routines" id="pl-day-list">${items.map((it, i) => `
          <li>
            <span class="pl-item-main">${thumb(it)}<span class="pl-row-text"><span class="pl-row-name">${escapeHtml(it.name)}</span><span class="meta">${escapeHtml(it.custom ? t("My template") : t("Course"))}</span></span></span>
            ${ro ? "" : `<span class="pl-item-actions">${reorderBtns(i, items.length, it.name)}
              <button type="button" class="secondary" data-replace="${i}" aria-label="${escapeHtml(t("Replace {name}", { name: it.name }))}">${escapeHtml(t("Replace"))}</button>
              <button type="button" class="secondary pl-rm" data-remove="${i}" aria-label="${escapeHtml(t("Remove {name}", { name: it.name }))}" title="${escapeHtml(t("Remove"))}">✕</button></span>`}
          </li>`).join("")}</ol>`
          : `<p class="empty-state pl-warn-box">${escapeHtml(t("No routine on this day yet."))}</p>`}
        ${ro ? "" : `<div class="pl-dialog-btns"><button type="button" class="secondary" id="pl-day-add">${escapeHtml(t("+ Add routine"))}</button><button type="button" id="pl-day-done">${escapeHtml(t("Done"))}</button></div>`}`;
      const list = m.body.querySelector("#pl-day-list");
      if (list && !ro) {
        enableReorder(list, (from, to, kind) => {
          if (to < 0 || to >= (d.days[date] || []).length) return;
          PC.moveItem(d, date, from, to);
          changed();
          render();
          focusReorder(m.body.querySelector("#pl-day-list"), to, kind);
        });
        list.addEventListener("click", (e) => {
          const rm = e.target.closest("[data-remove]");
          const rp = e.target.closest("[data-replace]");
          if (rm) {
            PC.removeItem(d, date, +rm.dataset.remove);
            changed();
            render();
            (m.body.querySelector(".pl-rm") || m.body.querySelector("#pl-day-add")).focus();
          } else if (rp) {
            const i = +rp.dataset.replace;
            openPicker({
              title: t("Replace with…"), multi: false, fallback: () => m.body.querySelector("[data-replace]"),
              onPick: (it) => { PC.replaceItem(d, date, i, it); changed(); render(`[data-replace="${i}"]`); },
            });
          }
        });
      }
      const add = m.body.querySelector("#pl-day-add");
      if (add) {
        add.onclick = () => openPicker({
          title: t("Add a routine"), multi: false, fallback: () => m.body.querySelector("#pl-day-add"),
          onPick: (it) => { PC.addItem(d, date, it); changed(); render("#pl-day-add"); },
        });
        m.body.querySelector("#pl-day-done").onclick = () => m.close();
      }
      if (focusSel) { const f = m.body.querySelector(focusSel); if (f) f.focus(); }
    }
    const changed = () => { renderStep3(); renderFooter(); };
    render();
    (m.body.querySelector("#pl-day-add") || m.body.querySelector(".pl-close") || m.title).focus();
  }

  // ---------- save ----------
  async function savePlan() {
    const d = P.draft;
    if (P.saving || P.readOnly) return;
    if (PC.validate(d).errors.length) return;
    P.saving = true;
    renderFooter();
    const saveBtn = $("pl-save");
    const label = saveBtn.textContent;
    saveBtn.textContent = t("Saving…");
    try {
      let before = [];
      if (!d.id) {
        const ongoing = (await planApi("list/ongoing")).data || [];
        if (ongoing.length) {
          const o = ongoing[0];
          const go = await dialog({
            title: t("You already have an ongoing plan"),
            html: `<p>${t("Only one plan can be ongoing at a time, and <b>{name}</b> ({range}) is still running.", { name: escapeHtml(o.name), range: escapeHtml(rangeLabel(o.startDate, o.endDate)) })}</p>
                   <p>${escapeHtml(t("Stop it to save this new plan? Stopped plans can't be edited again."))}</p>`,
            buttons: [{ label: t("Cancel"), value: false, kind: "secondary" }, { label: t("Stop it and continue"), value: true, kind: "danger" }],
          });
          if (!go) return;
          for (const p of ongoing) await planApi("stop", { method: "POST", body: { planId: p.id } });
        }
        before = ((await planApi("list/ongoing")).data || []).map((p) => p.id);
      }
      await planApi("save", { method: "POST", body: PC.toSavePayload(d, PC.formatDateTime()) });
      let msg = d.id ? t("Plan updated.") : t("Plan saved.");
      if (!d.id) {
        const after = ((await planApi("list/ongoing")).data || []).map((p) => p.id);
        const fresh = PC.newIds(before, after);
        if (!fresh.length) msg += t(" (It has no upcoming days, so it isn't listed as ongoing.)");
      }
      toast(msg);
      P.snapshot = snap(d); // not dirty any more
      P.draft = null;
      showView("list");
      loadPlans();
    } catch (e) {
      toast(t("Save failed: {msg}", { msg: friendly(e) }), true);
    } finally {
      P.saving = false;
      saveBtn.textContent = label;
      if (P.draft) renderFooter();
    }
  }

  // ---------- init / show ----------
  function init() {
    if (P.inited) return;
    P.inited = true;
    $("plans-new-btn").addEventListener("click", newPlan);
    $("plans-refresh-btn").addEventListener("click", loadPlans);
    $("pl-cancel").addEventListener("click", leaveWizard);
    $("pl-back").addEventListener("click", () => goStep(P.steps[P.steps.indexOf(P.step) - 1]));
    $("pl-next").addEventListener("click", () => goStep(P.steps[P.steps.indexOf(P.step) + 1]));
    $("pl-save").addEventListener("click", savePlan);
  }

  function show() {
    init();
    if (P.view === "list") { P.lib.custom = null; loadPlans(); }
  }

  // Language switched: library names are server-translated, so drop caches and redraw.
  function relang() {
    P.lib = { custom: null, official: null };
    P.covers = null;
    if (!P.inited) return;
    if (P.view === "list") loadPlans();
    else if (P.draft) { renderWizard(); }
  }

  window.PlannerUI = { show, planApi, relang, _state: P };
})();
