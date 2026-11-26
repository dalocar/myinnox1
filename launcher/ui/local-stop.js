/* "Stop MyInnoX1" header button for the desktop launcher. server.py adds this
   script to index.html only when MYINNOX1_LAUNCHER=1, so it carries its own
   strings and styles; nothing under static/ knows about it. */
(function () {
  "use strict";
  const STRINGS = {
    en: {
      button: "Stop MyInnoX1",
      confirm: "Stop MyInnoX1? Unsaved changes will be lost.",
      stopped: "MyInnoX1 has stopped.",
      detail: "You can close this tab. Docker also closes if the launcher started it and nothing else is running.",
      failed: "Could not stop MyInnoX1. Try again, or use the Stop MyInnoX1 shortcut.",
    },
    es: {
      button: "Detener MyInnoX1",
      confirm: "¿Detener MyInnoX1? Se perderán los cambios sin guardar.",
      stopped: "MyInnoX1 se ha detenido.",
      detail: "Puedes cerrar esta pestaña. Docker también se cierra si lo abrió el lanzador y no hay nada más en ejecución.",
      failed: "No se pudo detener MyInnoX1. Inténtalo de nuevo o usa el acceso directo Stop MyInnoX1.",
    },
    de: {
      button: "MyInnoX1 beenden",
      confirm: "MyInnoX1 beenden? Nicht gespeicherte Änderungen gehen verloren.",
      stopped: "MyInnoX1 wurde beendet.",
      detail: "Du kannst diesen Tab schließen. Docker wird ebenfalls beendet, wenn der Launcher es gestartet hat und sonst nichts läuft.",
      failed: "MyInnoX1 konnte nicht beendet werden. Versuche es erneut oder nutze die Verknüpfung „Stop MyInnoX1“.",
    },
    fr: {
      button: "Arrêter MyInnoX1",
      confirm: "Arrêter MyInnoX1 ? Les modifications non enregistrées seront perdues.",
      stopped: "MyInnoX1 est arrêté.",
      detail: "Vous pouvez fermer cet onglet. Docker se ferme aussi si le lanceur l’a démarré et que rien d’autre n’est en cours d’exécution.",
      failed: "Impossible d’arrêter MyInnoX1. Réessayez ou utilisez le raccourci Stop MyInnoX1.",
    },
    it: {
      button: "Arresta MyInnoX1",
      confirm: "Arrestare MyInnoX1? Le modifiche non salvate andranno perse.",
      stopped: "MyInnoX1 è stato arrestato.",
      detail: "Puoi chiudere questa scheda. Si chiude anche Docker, se è stato avviato dal launcher e non c’è altro in esecuzione.",
      failed: "Impossibile arrestare MyInnoX1. Riprova o usa il collegamento Stop MyInnoX1.",
    },
    ko: {
      button: "MyInnoX1 종료",
      confirm: "MyInnoX1을 종료할까요? 저장하지 않은 변경 사항은 사라집니다.",
      stopped: "MyInnoX1이 종료되었습니다.",
      detail: "이 탭을 닫아도 됩니다. 런처가 Docker를 시작했고 실행 중인 다른 항목이 없으면 Docker도 종료됩니다.",
      failed: "MyInnoX1을 종료하지 못했습니다. 다시 시도하거나 Stop MyInnoX1 바로가기를 사용하세요.",
    },
    zh: {
      button: "停止 MyInnoX1",
      confirm: "要停止 MyInnoX1 吗？未保存的更改将会丢失。",
      stopped: "MyInnoX1 已停止。",
      detail: "你可以关闭此标签页。如果 Docker 是由启动器启动的，且没有其他内容在运行，Docker 也会一并关闭。",
      failed: "无法停止 MyInnoX1。请重试，或使用 Stop MyInnoX1 快捷方式。",
    },
    ja: {
      button: "MyInnoX1 を停止",
      confirm: "MyInnoX1 を停止しますか？ 未保存の変更は失われます。",
      stopped: "MyInnoX1 を停止しました。",
      detail: "このタブは閉じてかまいません。ランチャーが Docker を起動し、ほかに実行中のものがなければ、Docker も終了します。",
      failed: "MyInnoX1 を停止できませんでした。もう一度試すか、Stop MyInnoX1 ショートカットを使ってください。",
    },
  };
  const TIMEOUT_MS = 10000;

  const header = document.querySelector(".header-right");
  if (!header || document.getElementById("local-stop-btn")) return;

  function text(key) {
    const lang = window.I18N && window.I18N.lang;
    return (Object.prototype.hasOwnProperty.call(STRINGS, lang) ? STRINGS[lang] : STRINGS.en)[key];
  }

  // Colours, radius and button look come from the app (style.css, themes.css).
  const style = document.createElement("style");
  style.textContent = `
    #local-stop-btn { flex: none; display: inline-flex; align-items: center; justify-content: center; gap: 6px; white-space: nowrap; }
    #local-stop-btn svg { flex: none; width: 18px; height: 18px; }
    @media (max-width: 899px) {
      #local-stop-btn { width: 40px; padding: 0; }
      #local-stop-btn span { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); }
    }
    @media (max-width: 899px) and (pointer: coarse) { #local-stop-btn { width: 44px; } }
    @media (max-width: 719px) { .header-right { flex-shrink: 0; } }
    /* The extra button leaves no room for the wordmark on phones: hide it visually, as style.css does below 401px. */
    @media (max-width: 479px) {
      header { gap: 8px; }
      header h1 { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
    }
    body.local-stopped > :not(#local-stopped) { display: none !important; }
    #local-stopped {
      max-width: 420px; margin: 15vh auto; padding: 32px; text-align: center;
      background: var(--surface); color: var(--text); border: 1px solid var(--border);
      border-radius: var(--radius-lg); box-shadow: var(--shadow);
    }
    #local-stopped h2:focus { outline: none; }
    #local-stopped p { color: var(--text-2); margin: 12px 0 0; }
    @media (max-width: 479px) { #local-stopped { margin-left: 16px; margin-right: 16px; padding: 24px 20px; } }
  `;
  document.head.appendChild(style);

  const button = document.createElement("button");
  button.type = "button";
  button.id = "local-stop-btn";
  button.className = "secondary";
  button.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true" focusable="false"><path d="M12 3v9"/><path d="M6.6 6.6a8 8 0 1 0 10.8 0"/></svg><span></span>';
  header.insertBefore(button, header.querySelector("#userbar"));

  let stopped = null; // the "has stopped" panel, once shown

  function render() {
    button.querySelector("span").textContent = text("button");
    button.title = text("button");
    if (stopped) {
      stopped.querySelector("h2").textContent = text("stopped");
      stopped.querySelector("p").textContent = text("detail");
    }
  }

  function showStopped() {
    stopped = document.createElement("main");
    stopped.id = "local-stopped";
    const title = document.createElement("h2");
    title.tabIndex = -1;
    stopped.append(title, document.createElement("p"));
    render();
    // The app stays in the DOM (hidden), so its pending callbacks do not throw.
    document.body.appendChild(stopped);
    document.body.classList.add("local-stopped");
    window.scrollTo(0, 0);
    title.focus();
  }

  function showFailure() {
    // toast() is the app's own message bar (app.js).
    if (typeof window.toast === "function") window.toast(text("failed"), true);
    else window.alert(text("failed"));
  }

  button.addEventListener("click", async () => {
    if (!window.confirm(text("confirm"))) return;
    button.disabled = true;
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), TIMEOUT_MS);
    let accepted = false;
    try {
      const res = await fetch("/_local/stop", {
        method: "POST",
        headers: { "X-MyInnoX1": "stop" },
        cache: "no-store",
        signal: abort.signal,
      });
      accepted = res.status === 202;
    } catch (e) {
      /* no answer: reported below */
    } finally {
      clearTimeout(timer);
    }
    if (accepted) showStopped();
    else {
      button.disabled = false;
      showFailure();
    }
  });

  new MutationObserver(render).observe(document.documentElement, { attributes: true, attributeFilter: ["lang"] });
  render();
})();
