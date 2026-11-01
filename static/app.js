// localStorage can throw (blocked storage, private windows): never let it break the app.
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* session-only */ } },
  remove(k) { try { localStorage.removeItem(k); } catch { /* ignore */ } },
};
// Set to your Buy Me a Coffee / Ko-fi page URL to show the tip links; empty hides them.
const TIP_URL = "https://buymeacoffee.com/dalocar";
(() => {
  if (!TIP_URL) return;
  document.querySelectorAll(".tip-link").forEach((a) => { a.href = TIP_URL; a.hidden = false; });
  document.querySelectorAll(".tip-card").forEach((c) => { c.hidden = false; });
})();
const TOKEN_KEY = "innodigym_token";
const EMAIL_KEY = "innodigym_email";
const DEFAULT_COVER = "https://power.renhesports.com/filestore/power/course/COVER_RACK_1_4.jpg";

const $ = (id) => document.getElementById(id);

let currentCourse = null; // full object from /course/custom/detail (or a blank template), mutated in place
let currentProfile = null;
let actionLibrary = null; // lazy-loaded, cached full action list
let customActionList = null; // lazy-loaded, cached own custom actions (never in the default list)
let coverOptions = null;

function toast(msg, isErr) {
  const t = $("toast");
  t.textContent = msg;
  t.hidden = false;
  t.className = isErr ? "err" : "";
  clearTimeout(toast._t);
  toast._t = setTimeout(() => (t.hidden = true), 4000);
}

async function api(path, opts = {}) {
  const token = store.get(TOKEN_KEY);
  const headers = Object.assign(
    { "Content-Type": "application/json" },
    opts.headers || {},
    token ? { Authorization: "Bearer " + token } : {}
  );
  path += (path.includes("?") ? "&" : "?") + "languageId=" + encodeURIComponent(LANG());
  const res = await fetch("/api" + path, Object.assign({}, opts, { headers }));
  let body;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  if (!res.ok || (body && body.success === false)) {
    const msg = (body && (body.msg || body.proxyError)) || `HTTP ${res.status}`;
    const err = new Error(msg);
    err.body = body;
    throw err;
  }
  return body;
}

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

let currentEmail = null;
let activeTab = "programs";
function showLoggedIn(email) {
  $("login-section").hidden = true;
  $("tabs").hidden = false;
  $("main-section").hidden = false;
  currentEmail = email;
  $("userbar").innerHTML = `<span id="user-email">${escapeHtml(email)}</span> <button id="logout-btn" class="secondary">${escapeHtml(t("Log out"))}</button>`;
  $("logout-btn").onclick = () => {
    store.remove(TOKEN_KEY);
    store.remove(EMAIL_KEY);
    location.reload();
  };
}

// ---------- tabs ----------
function switchTab(name) {
  activeTab = name;
  document.querySelectorAll(".tab-panel").forEach((el) => (el.hidden = el.id !== `tab-${name}`));
  document.querySelectorAll(".tab-btn").forEach((b) => b.classList.toggle("active", b.dataset.tab === name));
  if (name === "programs") { if (window.CoursesUI) CoursesUI.show(); else { $("editor").hidden = true; $("list-view").hidden = false; loadPrograms(); } }
  if (name === "plans" && window.PlannerUI) PlannerUI.show();
  if (name === "actions") { if (window.MovementsUI) MovementsUI.show(); else loadActions(); }
  if (name === "history") { if (window.DashboardUI) DashboardUI.show(); else loadHistory(); }
  if (name === "fitness" && window.FitnessUI) FitnessUI.show();
  if (name === "profile") loadProfile();
}
document.querySelectorAll(".tab-btn").forEach((b) => b.addEventListener("click", () => switchTab(b.dataset.tab)));

// ---------- action library (shared: used by Programs editor + Actions tab) ----------
async function getActionLibrary() {
  if (actionLibrary) return actionLibrary;
  const res = await api("/action/list");
  actionLibrary = res.data || [];
  return actionLibrary;
}

// Built-in library plus the user's custom actions (which /action/list only returns with
// ?custom=true). Custom ones come first. Used wherever a step can be added or validated.
async function getPickableActions() {
  const lib = await getActionLibrary();
  if (!customActionList) {
    const res = await api("/action/list?custom=true");
    customActionList = (res.data || []).filter((a) => a.custom);
  }
  return customActionList.concat(lib);
}

function invalidateActionCaches() {
  actionLibrary = null;
  customActionList = null;
}

async function getCoverOptions() {
  if (coverOptions) return coverOptions;
  try {
    const res = await api("/course/custom/cover/list");
    coverOptions = Object.values(res.data || {}).flat();
  } catch {
    coverOptions = [DEFAULT_COVER];
  }
  return coverOptions;
}

// ---------- PROGRAMS: list ----------
async function loadPrograms() {
  const list = $("program-list");
  list.textContent = t("Loading…");
  try {
    const res = await api("/course/custom/list");
    const programs = res.data || [];
    if (!programs.length) {
      list.innerHTML = `<p class="empty-state">${escapeHtml(t('No custom programs yet. Use "New Program" to create one.'))}</p>`;
      return;
    }
    list.innerHTML = "";
    for (const p of programs) {
      const el = document.createElement("div");
      el.className = "program-card";
      el.innerHTML = `
        <div class="card-left">
          <img class="thumb" src="${escapeHtml(p.smallImg || DEFAULT_COVER)}" alt="">
          <div>
            <div class="name">${escapeHtml(p.name)}</div>
            <div class="meta">${escapeHtml(t("{n} exercises · {min} min · updated {date}", { n: p.actionNum ?? "?", min: p.duration, date: p.updateTime }))}</div>
          </div>
        </div>
        <div class="card-actions">
          <button data-act="edit" data-id="${p.id}">${t("Edit")}</button>
          <button data-act="clone" data-id="${p.id}" class="secondary" aria-label="${escapeHtml(t("Clone {name}", { name: p.name }))}">${t("Clone")}</button>
          <button data-act="export" data-id="${p.id}" class="secondary" aria-label="${escapeHtml(t("Export {name}", { name: p.name }))}">${t("Export")}</button>
          <button data-act="del" data-id="${p.id}" class="secondary">${t("Delete")}</button>
        </div>
      `;
      el.querySelector('[data-act="edit"]').onclick = () => openEditor(p.id);
      el.querySelector('[data-act="clone"]').onclick = (e) => ProgramIO.cloneOne(p, e.currentTarget);
      el.querySelector('[data-act="export"]').onclick = (e) => ProgramIO.exportOne(p, e.currentTarget);
      // click anywhere on the row (not the buttons / thumbnail) -> read-only summary card
      const left = el.querySelector(".card-left");
      left.classList.add("clickable");
      left.tabIndex = 0;
      left.setAttribute("role", "button");
      left.setAttribute("aria-label", t("View summary of {name}", { name: p.name }));
      const openSummary = () => window.CoursesUI && CoursesUI.openCustomDetail(p, left);
      el.addEventListener("click", (e) => { if (!e.target.closest("button, img.thumb")) openSummary(); });
      left.addEventListener("keydown", (e) => { if ((e.key === "Enter" || e.key === " ") && e.target === left) { e.preventDefault(); openSummary(); } });
      el.querySelector('[data-act="del"]').onclick = () => deleteProgram(p.id, p.name);
      el.querySelector("img.thumb").addEventListener("click", (e) => {
        e.stopPropagation();
        openLightbox(p.smallImg, null, p.name);
      });
      list.appendChild(el);
    }
  } catch (e) {
    list.innerHTML = `<p class="server-error">${escapeHtml(t("Failed to load: {msg}", { msg: e.message }))}</p>`;
  }
}

async function deleteProgram(id, name) {
  if (!confirm(t('Delete "{name}"? This cannot be undone.', { name }))) return;
  try {
    await api(`/course/custom/delete/${id}`, { method: "POST" });
    toast(t("Deleted."));
    loadPrograms();
  } catch (e) {
    toast(t("Delete failed: {msg}", { msg: e.message }), true);
  }
}

// ---------- PROGRAMS: editor (shared between create + edit) ----------
function blankCourseTemplate() {
  return {
    name: t("New Program"),
    level: 1,
    courseType: 1,
    smallImg: DEFAULT_COVER,
    detailsImg: DEFAULT_COVER,
    deviceCategory: 7,
    sportType: 2,
    muscleParts: "1",
    tags: null,
    custom: null,
    duration: 0,
    capacity: 0,
    heartRateMin: 0,
    heartRateMax: 0,
    actionNum: null,
    collected: false,
    description: "",
    deviceTypeList: ["35"],
    partsList: ["1"],
    warmUpStepList: [],
    mainStepList: [],
    relaxStepList: [],
  };
}

async function openEditor(id) {
  try {
    const res = await api(`/course/custom/detail?id=${id}`);
    currentCourse = res.data;
    await renderEditor(false);
    $("list-view").hidden = true;
    $("editor").hidden = false;
  } catch (e) {
    toast(t("Failed to load program: {msg}", { msg: e.message }), true);
  }
}

async function openNewProgramEditor() {
  currentCourse = blankCourseTemplate();
  await renderEditor(true);
  $("list-view").hidden = true;
  $("editor").hidden = false;
}

$("new-program-btn").addEventListener("click", openNewProgramEditor);

function updateCoverThumb() {
  $("cover-thumb").src = (currentCourse && currentCourse.smallImg) || DEFAULT_COVER;
}

// ---------- cover picker modal ----------
let coverModalOpener = null;
async function openCoverModal() {
  coverModalOpener = document.activeElement;
  const grid = $("cover-grid");
  grid.innerHTML = "";
  const covers = await getCoverOptions();
  const current = currentCourse && currentCourse.smallImg;
  for (const url of covers) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "cover-option" + (url === current ? " selected" : "");
    btn.setAttribute("aria-label", t("Select cover"));
    btn.setAttribute("aria-pressed", url === current ? "true" : "false");
    const img = document.createElement("img");
    img.src = url;
    img.alt = "";
    btn.appendChild(img);
    btn.onclick = () => {
      currentCourse.smallImg = url;
      currentCourse.detailsImg = url;
      updateCoverThumb();
      closeCoverModal();
    };
    grid.appendChild(btn);
  }
  $("cover-modal-backdrop").hidden = false;
  (grid.querySelector(".selected") || $("cover-modal-close-btn")).focus();
}
function closeCoverModal() {
  if ($("cover-modal-backdrop").hidden) return;
  $("cover-modal-backdrop").hidden = true;
  if (coverModalOpener && coverModalOpener.focus) coverModalOpener.focus();
  coverModalOpener = null;
}
$("cover-thumb-btn").addEventListener("click", openCoverModal);
$("cover-modal-close-btn").addEventListener("click", closeCoverModal);
$("cover-modal-backdrop").addEventListener("click", (e) => {
  if (e.target.id === "cover-modal-backdrop") closeCoverModal();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !$("lightbox-backdrop").hidden) { e.stopImmediatePropagation(); closeLightbox(); }
  else if (e.key === "Escape" && !$("cover-modal-backdrop").hidden) closeCoverModal();
});

async function renderEditor(isNew) {
  $("editor-title").textContent = isNew ? t("New Program") : t("Edit Program");
  $("delete-program-btn").style.display = isNew ? "none" : "";
  $("edit-name").value = currentCourse.name || "";

  updateCoverThumb();

  renderStepsTable();
}

// Weight input + read-only weight-mode badge (from sideNum: Per side / Combined / No weight).
// A step stores exactly what the input shows; sideNum 0 has no weight, so the input is
// disabled (its stored value is left untouched).
// Same badge under the exercise name: shown instead of the one in the weight cell on narrow
// screens (the 4-column card grid is too tight for "Combined"); hidden on desktop by CSS.
function weightModeInline(step) {
  const mode = WeightModeCore.modeFor(step.sideNum);
  const badge = mode.label ? `<span class="wm-badge wm-badge-inline wm-${mode.key}" aria-hidden="true">${escapeHtml(t(mode.label))}</span>` : "";
  // Combined: same live total under the name on narrow screens (aria-hidden; the one in the
  // weight cell stays the accessible, announced copy and is only visually hidden there).
  const total = mode.key === "combined" ? `<span class="wm-total wm-total-inline" aria-hidden="true">${escapeHtml(combinedTotalText(step))}</span>` : "";
  return badge + total;
}

// Combined (sideNum 2): both cables work at once, the entered number is the resistance on
// EACH cable and the machine's workout screen shows the total. Readout is computed from the
// stored tenths (see WeightModeCore.totalTenths) in the account unit.
function combinedTotalText(step) {
  const b = WeightModeCore.breakdown(step.sideNum, step.sideWeight);
  return b.showTotal ? t("×2 cables = {total} total", { total: `${Units.fmtTenths(b.total)} ${Units.label()}` }) : "";
}

function weightCell(step, i) {
  const mode = WeightModeCore.modeFor(step.sideNum);
  const combined = mode.key === "combined";
  const badge = mode.label
    ? `<span class="wm-badge wm-${mode.key}" id="step-${i}-wm"${combined ? ` title="${escapeHtml(t("Resistance on each cable; both cables work at once"))}"` : ""}>${escapeHtml(t(mode.label))}</span>`
    : "";
  const total = combined ? `<span class="wm-total" id="step-${i}-total" aria-live="polite">${escapeHtml(combinedTotalText(step))}</span>` : "";
  const aria = Units.text(t(combined ? "Load per cable (kg)" : "Load (kg)"));
  const describedBy = [mode.label ? `step-${i}-wm` : "", combined ? `step-${i}-total` : ""].filter(Boolean).join(" ");
  return `<input type="number" min="0" step="0.1" id="step-${i}-sideWeight" name="step-${i}-sideWeight" data-field="sideWeight" aria-label="${escapeHtml(aria)}"${combined ? ` title="${escapeHtml(aria)}"` : ""}${describedBy ? ` aria-describedby="${describedBy}"` : ""}${mode.hasWeight ? "" : " disabled"} value="${Units.fmtTenths(step.sideWeight ?? 0)}">${badge}${total}`;
}

function renderStepsTable() {
  const body = $("steps-body");
  body.innerHTML = "";
  // Warm-up and stretch steps (added in the official app) are kept untouched on save but not editable here.
  const extra = [["Warm up", currentCourse.warmUpStepList], ["Stretch", currentCourse.relaxStepList]]
    .filter(([, l]) => Array.isArray(l) && l.length)
    .map(([label, l]) => `${t(label)}: ${l.map((s) => s.actionName).join(", ")}`);
  $("steps-extra").hidden = !extra.length;
  $("steps-extra").textContent = extra.length ? t("Kept on save, edit in the official app. {list}", { list: extra.join(" · ") }) : "";
  const total = (currentCourse.mainStepList || []).length;
  (currentCourse.mainStepList || []).forEach((step, i) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td class="reorder">
        <button type="button" class="reorder-btn drag-handle" data-reorder="handle" aria-label="${escapeHtml(t("Drag to reorder step {n} (or use arrow keys)", { n: i + 1 }))}" title="${escapeHtml(t("Drag to reorder"))}">⠿</button>
      </td>
      <td class="thumb">${step.picUrl ? `<img src="${escapeHtml(step.picUrl)}" alt="">` : ""}</td>
      <td class="num">${i + 1}</td>
      <td class="action-name">${escapeHtml(step.actionName || "")}${weightModeInline(step)}</td>
      <td class="field" data-label="${t("Reps")}"><input type="number" min="0" id="step-${i}-count" name="step-${i}-count" data-field="count" aria-label="${t("Reps")}" value="${step.count ?? 0}"></td>
      <td class="field" data-label="${escapeHtml(Units.text(t("Load (kg)")))}">${weightCell(step, i)}</td>
      <td class="field" data-label="${t("Rest (s)")}"><input type="number" min="0" id="step-${i}-restTime" name="step-${i}-restTime" data-field="restTime" aria-label="${t("Rest (s)")}" value="${step.restTime ?? 0}"></td>
      <td class="field" data-label="${t("Sets")}"><input type="number" min="0" id="step-${i}-groupNum" name="step-${i}-groupNum" data-field="groupNum" aria-label="${t("Sets")}" value="${step.groupNum ?? 0}"></td>
      <td class="row-actions">
        <button type="button" class="secondary row-menu-btn" aria-haspopup="menu" aria-expanded="false" aria-label="${escapeHtml(t("Actions for {name}", { name: step.actionName || t("step {n}", { n: i + 1 }) }))}" title="${escapeHtml(t("Row actions"))}">⋯</button>
      </td>
    `;
    const thumb = tr.querySelector("td.thumb img");
    if (thumb) thumb.addEventListener("click", () => openLightbox(step.picUrl, step.videoUrl, step.actionName));
    tr.querySelectorAll("input").forEach((input) => {
      input.addEventListener("input", () => {
        const val = Number(input.value);
        if (!Number.isFinite(val)) return;
        // sideWeight is stored by the server in tenths of a kg (50 == 5.0kg); the input
        // shows/accepts the account unit (kg or lb), so convert back to tenths of kg here.
        step[input.dataset.field] = input.dataset.field === "sideWeight" ? Units.toTenths(val) : val;
        if (input.dataset.field === "sideWeight") {
          tr.querySelectorAll(".wm-total").forEach((el) => { el.textContent = combinedTotalText(step); });
        }
      });
    });
    const menuBtn = tr.querySelector(".row-menu-btn");
    menuBtn.addEventListener("click", () => toggleRowMenu(i, menuBtn, total));
    setupReorder(tr, i);
    body.appendChild(tr);
  });
}

// Move step `from` to index `to`, renumber, re-render. `focusKind` ("up" | "down" |
// "handle") keeps focus on the matching control of the moved row.
function moveStep(from, to, focusKind) {
  const list = currentCourse && currentCourse.mainStepList;
  if (!list || from === to || from < 0 || to < 0 || from >= list.length || to >= list.length) return;
  const x = window.scrollX, y = window.scrollY;
  const [item] = list.splice(from, 1);
  list.splice(to, 0, item);
  list.forEach((s, j) => (s.sort = j + 1));
  renderStepsTable();
  window.scrollTo(x, y);
  if (focusKind) {
    const row = $("steps-body").children[to];
    const btn = row && row.querySelector(`[data-reorder="${focusKind}"]`);
    if (btn) {
      btn.focus({ preventScroll: true });
      if (btn.scrollIntoView) btn.scrollIntoView({ block: "nearest" });
    }
  }
}

function removeStep(i) {
  currentCourse.mainStepList.splice(i, 1);
  currentCourse.mainStepList.forEach((s, j) => (s.sort = j + 1));
  renderStepsTable();
}

// One shared popover for the per-row "⋯" menu. Lives on <body> with fixed
// positioning so the table's overflow container can't clip it.
let rowMenu = null;
function closeRowMenu(restoreFocus) {
  if (!rowMenu) return;
  const { el, btn } = rowMenu;
  rowMenu = null;
  el.remove();
  btn.setAttribute("aria-expanded", "false");
  document.removeEventListener("pointerdown", onRowMenuOutside, true);
  window.removeEventListener("scroll", onRowMenuDismiss, true);
  window.removeEventListener("resize", onRowMenuDismiss);
  if (restoreFocus && btn.isConnected) btn.focus({ preventScroll: true });
}
function onRowMenuOutside(e) {
  if (rowMenu && !rowMenu.el.contains(e.target) && !rowMenu.btn.contains(e.target)) closeRowMenu(false);
}
function onRowMenuDismiss() { closeRowMenu(false); }
function toggleRowMenu(i, btn, total) {
  if (rowMenu && rowMenu.btn === btn) { closeRowMenu(true); return; }
  closeRowMenu(false);
  const el = document.createElement("div");
  el.className = "row-menu";
  el.setAttribute("role", "menu");
  const items = [
    ["up", t("Move up"), i === 0, () => moveStep(i, i - 1, "handle")],
    ["down", t("Move down"), i === total - 1, () => moveStep(i, i + 1, "handle")],
    ["duplicate", t("Duplicate"), false, () => duplicateStep(i)],
    ["remove", t("Remove"), false, () => removeStep(i)],
  ];
  items.forEach(([key, label, disabled, fn]) => {
    const b = document.createElement("button");
    b.type = "button";
    b.setAttribute("role", "menuitem");
    b.className = "row-menu-item" + (key === "remove" ? " danger" : "");
    b.textContent = label;
    b.disabled = disabled;
    b.addEventListener("click", () => { closeRowMenu(false); fn(); });
    el.appendChild(b);
  });
  el.addEventListener("keydown", (e) => {
    const enabled = Array.from(el.querySelectorAll("button:not(:disabled)"));
    const k = enabled.indexOf(document.activeElement);
    if (e.key === "Escape") { e.preventDefault(); closeRowMenu(true); }
    else if (e.key === "ArrowDown") { e.preventDefault(); enabled[(k + 1) % enabled.length].focus(); }
    else if (e.key === "ArrowUp") { e.preventDefault(); enabled[(k - 1 + enabled.length) % enabled.length].focus(); }
    else if (e.key === "Tab") closeRowMenu(true);
  });
  document.body.appendChild(el);
  const r = btn.getBoundingClientRect();
  const h = el.offsetHeight, w = el.offsetWidth;
  const top = r.bottom + 4 + h > window.innerHeight ? Math.max(8, r.top - 4 - h) : r.bottom + 4;
  el.style.top = top + "px";
  el.style.left = Math.max(8, Math.min(r.right - w, window.innerWidth - w - 8)) + "px";
  btn.setAttribute("aria-expanded", "true");
  rowMenu = { el, btn };
  document.addEventListener("pointerdown", onRowMenuOutside, true);
  window.addEventListener("scroll", onRowMenuDismiss, true);
  window.addEventListener("resize", onRowMenuDismiss);
  const first = el.querySelector("button:not(:disabled)");
  if (first) first.focus({ preventScroll: true });
}

function setupReorder(tr, i) {
  const handle = tr.querySelector('[data-reorder="handle"]');
  handle.addEventListener("keydown", (e) => {
    if (e.key === "ArrowUp") { e.preventDefault(); moveStep(i, i - 1, "handle"); }
    else if (e.key === "ArrowDown") { e.preventDefault(); moveStep(i, i + 1, "handle"); }
  });

  // Pointer-event drag (mouse + touch + pen); only the handle starts a drag so
  // number inputs keep normal behaviour.
  let drag = null;
  const rows = () => Array.from($("steps-body").children);
  const clearMarks = () => rows().forEach((r) => r.classList.remove("drop-before", "drop-after"));
  const slotAt = (clientY) => {
    // insertion slot 0..n based on row midpoints
    const rs = rows();
    for (let k = 0; k < rs.length; k++) {
      const r = rs[k].getBoundingClientRect();
      if (clientY < r.top + r.height / 2) return k;
    }
    return rs.length;
  };
  handle.addEventListener("pointerdown", (e) => {
    if (e.button !== undefined && e.button !== 0) return;
    e.preventDefault();
    drag = { slot: i };
    handle.setPointerCapture(e.pointerId);
    tr.classList.add("dragging");
    document.body.classList.add("reordering");
  });
  handle.addEventListener("pointermove", (e) => {
    if (!drag) return;
    drag.slot = slotAt(e.clientY);
    clearMarks();
    const rs = rows();
    if (drag.slot < rs.length) rs[drag.slot].classList.add("drop-before");
    else rs[rs.length - 1].classList.add("drop-after");
    // auto-scroll near viewport edges
    if (e.clientY < 60) window.scrollBy(0, -12);
    else if (e.clientY > window.innerHeight - 60) window.scrollBy(0, 12);
  });
  const end = (e, cancel) => {
    if (!drag) return;
    const slot = drag.slot;
    drag = null;
    clearMarks();
    tr.classList.remove("dragging");
    document.body.classList.remove("reordering");
    if (cancel) return;
    const to = slot > i ? slot - 1 : slot;
    if (to !== i) moveStep(i, to, "handle");
  };
  handle.addEventListener("pointerup", (e) => end(e, false));
  handle.addEventListener("pointercancel", (e) => end(e, true));
}

function duplicateStep(i) {
  const list = currentCourse.mainStepList;
  if (!list[i]) return;
  const copy = structuredClone(list[i]);
  // Server-assigned identity: steps added from the library carry neither, so
  // strip them and let the server treat the clone as a new step.
  delete copy.id;
  delete copy.courseId;
  list.splice(i + 1, 0, copy);
  list.forEach((s, j) => (s.sort = j + 1));
  renderStepsTable();
  const row = $("steps-body").children[i + 1];
  if (!row) return;
  row.classList.add("row-new");
  setTimeout(() => row.classList.remove("row-new"), 1500);
  const reps = row.querySelector('input[data-field="count"]');
  if (reps) {
    reps.focus({ preventScroll: true });
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    row.scrollIntoView({ block: "nearest", behavior: reduce ? "auto" : "smooth" });
  }
}

function addStepFromAction(a) {
  // Action-library sideWeight is plain kg (e.g. "5"); course-step sideWeight is
  // in tenths of a kg (e.g. 50 == 5.0kg) — confirmed by comparing the two for
  // the same action. Convert on the way in or saved programs end up 10x too light.
  const libKg = typeof a.sideWeight === "string" ? parseFloat(a.sideWeight) : a.sideWeight;
  const sideWeight = Number.isFinite(libKg) ? Math.round(libKg * 10) : 50;
  currentCourse.mainStepList.push({
    sort: currentCourse.mainStepList.length + 1,
    actionLibraryId: a.id,
    actionName: a.name,
    actionNo: a.actionNo,
    actionType: a.actionType,
    picUrl: a.picUrl,
    videoUrl: a.videoUrl,
    stage: 2,
    count: 12,
    consume: a.consume ?? null,
    sideNum: a.sideNum ?? 0,
    countType: a.countType ?? 1,
    sideWeight,
    muscleGroups: a.muscleGroups,
    muscleParts: a.muscleParts,
    trainingPoint: a.trainingPoint,
    reqParts: a.reqParts,
    restTime: 30,
    groupNum: 1,
    mode: 0,
    modeParam: "{}",
    breathTip: a.breathTip,
    custom: !!a.custom,
    duration: 12,
  });
  renderStepsTable();
}

async function saveProgram() {
  if (!currentCourse) return;
  currentCourse.name = $("edit-name").value;
  // Recompute rough aggregates so the list view isn't wildly stale. Not an exact
  // formula match to the server's own calculation, purely cosmetic.
  currentCourse.duration = currentCourse.mainStepList.reduce((s, st) => s + (st.duration || 1), 0);
  currentCourse.capacity = currentCourse.mainStepList.reduce((s, st) => s + (st.consume || 0) * 10, 0);

  const status = $("save-status");
  status.textContent = t("Saving…");
  status.className = "";
  try {
    await api("/course/custom/save", { method: "POST", body: JSON.stringify(currentCourse) });
    status.textContent = t("Saved.");
    status.className = "ok";
    toast(t("Saved — {name}", { name: currentCourse.name }));
    $("editor").hidden = true;
    $("list-view").hidden = false;
    loadPrograms();
  } catch (e) {
    status.textContent = t("Failed: {msg}", { msg: e.message });
    status.className = "err";
    toast(t("Save failed: {msg}", { msg: e.message }), true);
  }
}

// ---------- image/video lightbox (shared by every thumbnail in the app) ----------
let lightboxOpener = null;
function openLightbox(picUrl, videoUrl, title) {
  if (!picUrl && !videoUrl) return;
  $("lightbox-title").textContent = title || "";
  const media = $("lightbox-media");
  if (videoUrl) {
    media.innerHTML = `<video controls autoplay ${picUrl ? `poster="${escapeHtml(picUrl)}"` : ""}>
      <source src="${escapeHtml(videoUrl)}" type="video/mp4"></video>`;
  } else {
    media.innerHTML = `<img src="${escapeHtml(picUrl)}" alt="">`;
  }
  lightboxOpener = document.activeElement;
  $("lightbox-backdrop").hidden = false;
  $("lightbox-close-btn").focus({ preventScroll: true });
}
function closeLightbox() {
  $("lightbox-backdrop").hidden = true;
  $("lightbox-media").innerHTML = ""; // stop any playing video
  if (lightboxOpener && lightboxOpener.isConnected && lightboxOpener.focus) lightboxOpener.focus({ preventScroll: true });
  lightboxOpener = null;
}
$("lightbox-close-btn").addEventListener("click", closeLightbox);
$("lightbox-backdrop").addEventListener("click", (e) => {
  if (e.target.id === "lightbox-backdrop") closeLightbox();
});

// ---------- action picker modal ----------
// Inferred from the data itself (there's no labeled lookup in the API): grouped
// all 268 library actions by their numeric muscleParts id against exercise names
// (e.g. id 1 only ever appears on chest presses/flys) and matched the result
// against the body-part strings the app itself ships in its translations.
const MUSCLE_GROUPS = [
  { id: "1", label: "Chest" },
  { id: "2", label: "Shoulder" },
  { id: "3", label: "Back" },
  { id: "4", label: "Arm" },
  { id: "5", label: "Hips" },
  { id: "6", label: "Legs" },
  { id: "7", label: "Abdomen" },
  { id: "8", label: "Full-Body" },
];

// Muscle-group names live in the language packs as "muscle.<id>"; English is the fallback label.
function muscleName(g) {
  const s = t("muscle." + g.id);
  return s === "muscle." + g.id ? g.label : s;
}

let pickerResults = [];
let pickerActiveGroups = new Set();

async function openActionPicker() {
  $("action-picker-backdrop").hidden = false;
  $("picker-search").value = "";
  pickerActiveGroups = new Set();
  $("picker-results").innerHTML = t("Loading…");
  try {
    pickerResults = await getPickableActions();
    renderPickerChips();
    applyPickerFilter();
    $("picker-search").focus();
  } catch (e) {
    $("picker-results").innerHTML = `<p class="server-error">${escapeHtml(e.message)}</p>`;
  }
}

function renderPickerChips() {
  const el = $("picker-chips");
  el.innerHTML = "";
  const allChip = document.createElement("button");
  allChip.type = "button";
  allChip.className = "chip" + (pickerActiveGroups.size === 0 ? " active" : "");
  allChip.textContent = t("All");
  allChip.onclick = () => {
    pickerActiveGroups.clear();
    renderPickerChips();
    applyPickerFilter();
  };
  el.appendChild(allChip);
  for (const g of MUSCLE_GROUPS) {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "chip" + (pickerActiveGroups.has(g.id) ? " active" : "");
    chip.textContent = muscleName(g);
    chip.onclick = () => {
      if (pickerActiveGroups.has(g.id)) pickerActiveGroups.delete(g.id);
      else pickerActiveGroups.add(g.id);
      renderPickerChips();
      applyPickerFilter();
    };
    el.appendChild(chip);
  }
}

function applyPickerFilter() {
  const norm = MovementsCore.normalize;
  const q = norm($("picker-search").value.trim());
  let items = pickerResults;
  if (pickerActiveGroups.size) {
    items = items.filter((a) => (a.muscleParts || "").split(",").some((p) => pickerActiveGroups.has(p)));
  }
  if (q) {
    items = items.filter((a) => norm(a.name || "").includes(q));
  }
  renderPickerResults(items);
}

function renderPickerResults(items) {
  const el = $("picker-results");
  if (!items.length) {
    el.innerHTML = `<p class="empty-state">${t("No matches.")}</p>`;
    return;
  }
  el.innerHTML = "";
  for (const a of items.slice(0, 80)) {
    const row = document.createElement("div");
    row.className = "picker-row";
    row.innerHTML = `
      <img src="${escapeHtml(a.picUrl || "")}" alt="">
      <div><div>${escapeHtml(a.name)}</div><div class="meta">${a.custom ? escapeHtml(t("Custom")) + " · " : ""}${escapeHtml((a.muscleParts || ""))}</div></div>
    `;
    row.onclick = () => {
      addStepFromAction(a);
      $("action-picker-backdrop").hidden = true;
    };
    row.querySelector("img").addEventListener("click", (e) => {
      e.stopPropagation();
      openLightbox(a.picUrl, a.videoUrl, a.name);
    });
    el.appendChild(row);
  }
}
$("add-action-btn").addEventListener("click", openActionPicker);
$("picker-close-btn").addEventListener("click", () => ($("action-picker-backdrop").hidden = true));
$("action-picker-backdrop").addEventListener("click", (e) => {
  if (e.target.id === "action-picker-backdrop") $("action-picker-backdrop").hidden = true;
});
let pickerSearchTimer = null;
$("picker-search").addEventListener("input", () => {
  clearTimeout(pickerSearchTimer);
  pickerSearchTimer = setTimeout(applyPickerFilter, 150);
});

$("delete-program-btn").addEventListener("click", async () => {
  if (!currentCourse || !currentCourse.id) return;
  if (!confirm(t('Delete "{name}"? This cannot be undone.', { name: currentCourse.name }))) return;
  try {
    await api(`/course/custom/delete/${currentCourse.id}`, { method: "POST" });
    toast(t("Deleted."));
    $("editor").hidden = true;
    $("list-view").hidden = false;
    loadPrograms();
  } catch (e) {
    toast(t("Delete failed: {msg}", { msg: e.message }), true);
  }
});

// ---------- ACTIONS tab (your custom actions, separate from the shared library) ----------
async function loadActions() {
  const list = $("actions-list");
  list.textContent = t("Loading…");
  try {
    // The default /action/list omits custom actions; they only come back with ?custom=true.
    const res = await api("/action/list?custom=true");
    const custom = (res.data || []).filter((a) => a.custom);
    if (!custom.length) {
      list.innerHTML = `<p class="empty-state">${escapeHtml(t("No custom actions yet. Add one below."))}</p>`;
      return;
    }
    list.innerHTML = "";
    for (const a of custom) {
      const el = document.createElement("div");
      el.className = "action-card";
      el.innerHTML = `
        <div class="card-left">
          <img class="thumb" src="${escapeHtml(a.picUrl || "")}" alt="">
          <div><div class="name">${escapeHtml(a.name)}</div><div class="meta">id ${a.id}</div><div class="ca-tags">${customActionTags(a).map((x) => `<span>${escapeHtml(x)}</span>`).join("")}</div></div>
        </div>
        <div class="card-actions">
          <button class="secondary" data-edit="${a.id}">${t("Edit")}</button>
          <button class="secondary" data-id="${a.id}">${t("Delete")}</button>
        </div>
      `;
      el.querySelector("[data-edit]").onclick = () => startEditAction(a);
      el.querySelector("[data-id]").onclick = () => deleteAction(a.id);
      el.querySelector("img.thumb").addEventListener("click", () => openLightbox(a.picUrl, a.videoUrl, a.name));
      list.appendChild(el);
    }
  } catch (e) {
    list.innerHTML = `<p class="server-error">${escapeHtml(t("Failed to load: {msg}", { msg: e.message }))}</p>`;
  }
}

async function deleteAction(id) {
  if (!confirm(t("Delete this custom action?"))) return;
  try {
    await api(`/action/delete/${id}`, { method: "POST" });
    toast(t("Deleted."));
    if (caForm.id === id) resetCaForm();
    invalidateActionCaches();
    loadActions();
  } catch (e) {
    toast(t("Delete failed: {msg}", { msg: e.message }), true);
  }
}

// Create form state. Codes are documented in custom-action-core.js.
const caForm = { id: null, parts: new Set(), level: 1, actionType: 3, bodyweight: false, timer: false, combined: false };

function customActionTags(a) {
  const d = CustomActionCore.describe(a);
  const tags = d.parts.map((p) => {
    const g = MUSCLE_GROUPS.find((m) => m.id === p);
    return g ? muscleName(g) : t("Part {n}", { n: p });
  });
  const lv = CustomActionCore.LEVELS.find((x) => x.value === d.level);
  const ty = CustomActionCore.TYPES.find((x) => x.value === d.actionType);
  if (lv) tags.push(t(lv.label));
  if (ty) tags.push(t(ty.label));
  tags.push(d.bodyweight ? t("Bodyweight-only") : t("Equipment-based"));
  tags.push(d.timer ? t("Timer-based") : t("Repetition-based"));
  if (!d.bodyweight) tags.push(d.combined ? t("Combined") : t("Per side"));
  return tags;
}

function renderCaChips() {
  const C = CustomActionCore;
  const groups = [
    ["ca-parts", MUSCLE_GROUPS.map((g) => ({ v: g.id, label: muscleName(g) })), (v) => caForm.parts.has(v),
      (v) => (caForm.parts.has(v) ? caForm.parts.delete(v) : caForm.parts.add(v))],
    ["ca-level", C.LEVELS.map((x) => ({ v: x.value, label: t(x.label) })), (v) => caForm.level === v, (v) => (caForm.level = v)],
    ["ca-type", C.TYPES.map((x) => ({ v: x.value, label: t(x.label) })), (v) => caForm.actionType === v, (v) => (caForm.actionType = v)],
    ["ca-equip", [{ v: false, label: t("Equipment-based") }, { v: true, label: t("Bodyweight-only") }],
      (v) => caForm.bodyweight === v, (v) => (caForm.bodyweight = v)],
    // Bodyweight-only has no Repetition option, as in the official app.
    ["ca-count", [{ v: true, label: t("Timer-based") }, ...(caForm.bodyweight ? [] : [{ v: false, label: t("Repetition-based") }])],
      (v) => (caForm.bodyweight ? v : caForm.timer === v), (v) => (caForm.timer = v)],
    ["ca-weight", [{ v: false, label: t("Per side") }, { v: true, label: t("Combined") }], (v) => caForm.combined === v, (v) => (caForm.combined = v)],
  ];
  for (const [id, opts, isOn, pick] of groups) {
    const box = $(id);
    box.innerHTML = "";
    for (const o of opts) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "chip";
      b.textContent = o.label;
      b.setAttribute("aria-pressed", String(isOn(o.v)));
      b.onclick = () => { pick(o.v); renderCaChips(); };
      box.appendChild(b);
    }
  }
  $("ca-weight-set").hidden = caForm.bodyweight;
}
renderCaChips();
I18N.onChange.push(renderCaChips);

function resetCaForm() {
  $("action-add-form").reset();
  Object.assign(caForm, { id: null, parts: new Set(), level: 1, actionType: 3, bodyweight: false, timer: false, combined: false });
  $("ca-heading").textContent = t("Add a custom action");
  $("ca-submit").textContent = t("Add");
  $("ca-cancel").hidden = true;
  renderCaChips();
}

// Edit loads the stored action into the create form; saving posts /action/add with its id (update in place).
function startEditAction(a) {
  const f = CustomActionCore.toForm(a);
  Object.assign(caForm, { id: f.id, parts: new Set(f.parts), level: f.level, actionType: f.actionType, bodyweight: f.bodyweight, timer: f.timer, combined: f.combined });
  $("new-action-name").value = f.name;
  $("ca-heading").textContent = t("Edit action");
  $("ca-submit").textContent = t("Save changes");
  $("ca-cancel").hidden = false;
  $("action-add-status").textContent = "";
  renderCaChips();
  $("action-add-form").scrollIntoView({ block: "start", behavior: "smooth" });
  $("new-action-name").focus();
}
$("ca-cancel").onclick = resetCaForm;

$("action-add-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const status = $("action-add-status");
  const form = { name: $("new-action-name").value, ...caForm, parts: Array.from(caForm.parts) };
  const bad = CustomActionCore.validate(form);
  if (bad) { status.textContent = t(bad); return; }
  const body = CustomActionCore.buildBody(form);
  const editing = !!caForm.id;
  status.textContent = editing ? t("Saving…") : t("Adding…");
  try {
    const res = await api("/action/add", { method: "POST", body: JSON.stringify(body) });
    status.textContent = editing ? t("Saved.") : t("Added (id {id}).", { id: res.data });
    toast(editing ? t("Action updated.") : t("Action added."));
    resetCaForm();
    invalidateActionCaches(); // so the picker shows the new/updated action
    loadActions();
  } catch (e) {
    status.textContent = t("Failed: {msg}", { msg: e.message });
    toast(t(editing ? "Update failed: {msg}" : "Add failed: {msg}", { msg: e.message }), true);
  }
});

// ---------- HISTORY ----------
async function loadHistory() {
  const list = $("history-list");
  list.textContent = t("Loading…");
  const end = new Date();
  const start = new Date(end.getTime() - 180 * 86400000);
  const fmt = (d) => d.toISOString().slice(0, 19).replace("T", " ");
  try {
    const res = await api(
      `/sport/record/list?startTime=${encodeURIComponent(fmt(start))}&endTime=${encodeURIComponent(fmt(end))}&size=50`
    );
    const records = res.data || [];
    if (!records.length) {
      list.innerHTML = `<p class="empty-state">${escapeHtml(t("No workout records in the last 180 days."))}</p>`;
      return;
    }
    list.innerHTML = "";
    for (const r of records) {
      const el = document.createElement("div");
      el.className = "record-card";
      el.innerHTML = `
        <div>
          <div class="name">${escapeHtml(r.name || t("(unnamed)"))}</div>
          <div class="meta">${r.startTime} · ${r.duration}s · ${r.consume} kcal</div>
        </div>
        <button class="secondary" data-id="${r.sportRecordId}">${t("Delete")}</button>
      `;
      el.querySelector("button").onclick = () => deleteRecord(r.sportRecordId);
      list.appendChild(el);
    }
  } catch (e) {
    list.innerHTML = `<p class="server-error">${escapeHtml(t("Failed to load: {msg}", { msg: e.message }))}</p>`;
  }
}

async function deleteRecord(id) {
  if (!confirm(t("Delete this workout record? This cannot be undone."))) return;
  try {
    await api(`/sport/record/delete/${id}`, { method: "POST" });
    toast(t("Deleted."));
    loadHistory();
  } catch (e) {
    toast(t("Delete failed: {msg}", { msg: e.message }), true);
  }
}

// ---------- FITNESS ---------- (see fitness.js / fitness-core.js)

// ---------- PROFILE ----------
async function loadProfile() {
  const status = $("profile-status");
  status.textContent = "";
  try {
    const res = await api("/app/getInfo");
    currentProfile = res.data;
    Units.set(UnitsCore.unitFromProfile(currentProfile));
    $("p-nickName").value = currentProfile.nickName || "";
    $("p-birthday").value = currentProfile.birthday || "";
    $("p-sex").value = currentProfile.sex ?? 1;
    $("p-unit").value = currentProfile.unit ?? 0;
    $("p-trainingTime").value = currentProfile.trainingTime ?? "";
    $("p-targetWeight").value = profileKgShown(currentProfile.targetWeight);
    $("p-height").value = currentProfile.height ?? "";
    $("p-weight").value = profileKgShown(currentProfile.weight);
  } catch (e) {
    status.textContent = t("Failed to load profile: {msg}", { msg: e.message });
    status.className = "err";
  }
}

// Profile weights are plain kg from the API. Metric shows them untouched; Imperial shows lb.
const profileKgShown = (kg) => (kg == null ? "" : Units.isImperial() ? UnitsCore.kgToDisplay(kg, Units.get()) : kg);

// The target weight input shows the unit the profile was LOADED with (Units.get()), not the
// Units dropdown, so a unit change saved in the same submit never reinterprets the number.
// Untouched input -> send the stored kg value as is (no conversion round-trip noise).
function targetWeightKg() {
  const typed = Number($("p-targetWeight").value);
  if (!Units.isImperial()) return typed;
  const orig = currentProfile ? currentProfile.targetWeight : null;
  if (orig != null && typed === UnitsCore.kgToDisplay(orig, Units.get())) return orig;
  return UnitsCore.displayToKg(typed, Units.get());
}

$("profile-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const status = $("profile-status");
  // Confirmed: the server 500s on several fields (height/weight/trainingConsume) no
  // matter what, and on a full combined-object update. Sending one changed field per
  // request is what's confirmed to work reliably.
  const fields = {
    nickName: $("p-nickName").value,
    birthday: $("p-birthday").value,
    sex: Number($("p-sex").value),
    unit: Number($("p-unit").value),
    trainingTime: Number($("p-trainingTime").value),
    targetWeight: targetWeightKg(),
  };
  const changed = Object.entries(fields).filter(([k, v]) => String(currentProfile?.[k] ?? "") !== String(v));
  if (!changed.length) {
    status.textContent = t("Nothing changed.");
    status.className = "";
    return;
  }
  status.textContent = t("Saving…");
  const failures = [];
  for (const [k, v] of changed) {
    try {
      await api("/app/updateInfo", { method: "POST", body: JSON.stringify({ [k]: v }) });
    } catch (e) {
      failures.push(`${k}: ${e.message}`);
    }
  }
  if (failures.length) {
    status.textContent = t("Some fields failed to save: {list}", { list: failures.join("; ") });
    status.className = "err";
    toast(t("Profile partially saved — see details."), true);
  } else {
    status.textContent = t("Saved.");
    status.className = "ok";
    toast(t("Profile saved."));
  }
  loadProfile();
});

// ---------- login / init ----------
async function login(email, password) {
  const res = await api("/app/login", {
    method: "POST",
    body: JSON.stringify({
      accountType: 2, accountVal: email, password,
      device: "Web", deviceId: "innodigym-web-editor", languageId: LANG(),
    }),
  });
  store.set(TOKEN_KEY, res.data.token);
  store.set(EMAIL_KEY, email);
}

$("login-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const email = $("login-email").value.trim();
  const password = $("login-password").value;
  const err = $("login-error");
  err.hidden = true;
  try {
    await login(email, password);
    Units.load(api);
    showLoggedIn(email);
    switchTab("programs");
  } catch (ex) {
    err.textContent = ex.message;
    err.hidden = false;
  }
});

$("save-btn").addEventListener("click", saveProgram);
$("refresh-btn").addEventListener("click", loadPrograms);
$("back-btn").addEventListener("click", () => {
  $("editor").hidden = true;
  $("list-view").hidden = false;
  currentCourse = null;
});
$("actions-refresh-btn").addEventListener("click", loadActions);
$("history-refresh-btn").addEventListener("click", loadHistory);

// Re-render whatever is on screen in the new language. Open editors keep their
// unsaved state (only the chrome/labels are redrawn); lists reload from the API
// because action/course names come back translated for the requested languageId.
I18N.onChange.push(() => {
  invalidateActionCaches();
  coverOptions = null;
  if (currentEmail) showLoggedIn(currentEmail);
  if (activeTab === "programs" && currentCourse && !$("editor").hidden) {
    // keep a hidden-but-open editor's labels in the new language even while Courses is shown
    $("editor-title").textContent = currentCourse.id ? t("Edit Program") : t("New Program");
    renderStepsTable();
  }
  const editorOpen = activeTab === "programs" && currentCourse && !$("editor").hidden;
  if (activeTab === "programs" && window.CoursesUI && CoursesUI.view() === "courses") CoursesUI.relang();
  else if (editorOpen) { /* labels already redrawn above */ }
  else if (activeTab === "plans" && window.PlannerUI) PlannerUI.relang();
  else if (activeTab === "actions" && window.MovementsUI) MovementsUI.relang();
  else if (activeTab === "fitness" && window.FitnessUI) FitnessUI.relang();
  else if (activeTab === "history" && window.DashboardUI) { /* dashboard, explorer, report and medals re-render themselves on I18N.onChange; switchTab would reset to the dashboard */ }
  else if (!$("main-section").hidden) switchTab(activeTab);
});

Units.onChange(() => {
  if (currentCourse && !$("editor").hidden) renderStepsTable();
});

(function init() {
  const token = store.get(TOKEN_KEY);
  const email = store.get(EMAIL_KEY);
  if (token && email) {
    Units.load(api);
    showLoggedIn(email);
    switchTab("programs");
  }
})();
