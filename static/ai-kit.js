/* "Use with AI" menu (Actions -> Library): copy the AI prompt, download the library
   and the format guide. Pure logic lives in ai-kit-core.js. Uses globals from app.js:
   $, t, toast, getPickableActions, I18N. No network beyond the existing /api calls. */
(() => {
  const K = window.AIKitCore;
  const btn = $("ai-menu-btn"), menu = $("ai-menu");
  if (!btn || !menu) return;

  function setOpen(open) {
    menu.hidden = !open;
    btn.setAttribute("aria-expanded", String(open));
    if (!open) $("ai-fallback").hidden = true;
  }
  btn.addEventListener("click", () => { setOpen(menu.hidden); $("ai-status").textContent = ""; });
  // Escape closes the menu from inside it or from the toggle button, and returns focus to the toggle.
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape" || menu.hidden) return;
    if (e.target !== btn && !menu.contains(e.target)) return;
    e.stopPropagation(); setOpen(false); btn.focus();
  });

  const status = (msg, isErr) => { const el = $("ai-status"); el.textContent = msg; el.className = "meta" + (isErr ? " err" : ""); };
  const opts = () => ({ lang: I18N.lang, includeCustom: $("ai-custom").checked });

  async function actions() {
    const list = await getPickableActions();
    if (!list.length) throw new Error(t("The movement library is empty."));
    return list;
  }

  async function writeClipboard(text) {
    if (navigator.clipboard && window.isSecureContext) {
      try { await navigator.clipboard.writeText(text); return true; } catch { /* fall through */ }
    }
    const ta = document.createElement("textarea");
    ta.value = text; ta.setAttribute("readonly", ""); ta.style.cssText = "position:fixed;top:0;left:0;opacity:0";
    document.body.appendChild(ta); ta.select();
    let ok = false;
    try { ok = document.execCommand("copy"); } catch { ok = false; }
    ta.remove();
    return ok;
  }

  window.AIKit = { writeClipboard };

  function download(filename, text, type) {
    const url = URL.createObjectURL(new Blob([text], { type }));
    const a = document.createElement("a");
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function run(button, fn) {
    button.disabled = true;
    try { await fn(); }
    catch (e) { status(t("Could not prepare the export: {msg}", { msg: e.message }), true); }
    finally { button.disabled = false; }
  }

  $("ai-copy").addEventListener("click", (e) => run(e.currentTarget, async () => {
    const text = K.buildPrompt(await actions(), opts());
    if (await writeClipboard(text)) {
      $("ai-fallback").hidden = true;
      status(t("Copied. Paste it in your AI chat and add your goal."));
      toast(t("Copied. Paste it in your AI chat and add your goal."));
    } else {
      $("ai-fallback").hidden = false;
      const ta = $("ai-fallback-text"); ta.value = text; ta.focus(); ta.select();
      status(t("Copying is blocked by the browser. Select the text below and copy it."), true);
    }
  }));

  $("ai-dl-lib").addEventListener("click", (e) => run(e.currentTarget, async () => {
    const o = opts();
    const file = K.libraryFilename(o.lang);
    download(file, JSON.stringify(K.libraryForAI(await actions(), o), null, 2), "application/json");
    status(t("Exported {file}", { file }));
  }));

  $("ai-dl-guide").addEventListener("click", (e) => run(e.currentTarget, async () => {
    const o = opts();
    const file = K.guideFilename();
    download(file, K.buildGuide(await actions(), o), "text/markdown");
    status(t("Exported {file}", { file }));
  }));
})();
