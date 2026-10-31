/* HallowFit decoration layer: cobwebs, spiders, jack-o-lantern, bats, fog, ghost, eyes.
   Pure helpers are exported for node:test (module.exports); the DOM part registers with ThemeFx.
   Everything is aria-hidden and pointer-events none; mounted after idle so it never delays first render. */
(function () {
  "use strict";
  const LITE_TABS = ["plans", "history", "fitness"]; // charts, planner, activity dashboard/explorer/report
  const TRIP = [8000, 20000], SCUTTLE = [60000, 90000], BAT = [22000, 28000], EYES = [10000, 14000], FLUTTER = [6000, 11000];

  /** Uniform delay in [min, max] from a [0,1) source. */
  function randDelay(range, rnd) {
    const r = typeof rnd === "function" ? rnd() : Math.random();
    const x = !(r >= 0) ? 0 : r >= 1 ? 0.999999 : r;
    return Math.round(range[0] + x * (range[1] - range[0]));
  }
  /** Data-heavy screens get static minimal decoration. */
  function isLite(tab, editorOpen) {
    return LITE_TABS.indexOf(tab) !== -1 || (tab === "programs" && !!editorOpen);
  }
  /** Spider trip scheduler: asks for the next trip time; skips (retries sooner) while busy, hidden or lite. */
  function nextTrip(state, rnd) {
    const s = state || {};
    if (s.lite || s.hidden) return { go: false, wait: randDelay(TRIP, rnd) };
    if (s.busy) return { go: false, wait: 1500 + randDelay([0, 1500], rnd) };
    return { go: true, wait: randDelay(TRIP, rnd) };
  }

  const api = { LITE_TABS, TRIP, SCUTTLE, BAT, randDelay, isLite, nextTrip };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (typeof window === "undefined" || !window.ThemeFx) return;

  const html = document.documentElement;
  const ART = ["web-corner", "spider", "jack-o-lantern", "bat", "ghost", "eyes-in-dark", "bat-logo-accent"];
  let gen = 0;
  let S = null;

  function svgOf(m) { return (m || "").replace("<svg ", '<svg aria-hidden="true" focusable="false" '); }
  function box(cls, art, extra) {
    const d = document.createElement("div");
    d.className = "hf " + cls;
    d.setAttribute("aria-hidden", "true");
    d.innerHTML = svgOf(art) + (extra || "");
    return d;
  }

  function activeTab() {
    const p = document.querySelector(".tab-panel:not([hidden])");
    return p && p.id ? p.id.replace(/^tab-/, "") : "";
  }
  function updateLite() {
    if (!S) return;
    const lite = isLite(activeTab(), !!document.querySelector("#editor:not([hidden])"));
    S.lite = lite;
    html.classList.toggle("hf-lite", lite);
  }

  function build(ctx, art) {
    const full = ctx.mode === "full";
    S = { timers: new Set(), lite: false, busy: false, full, perch: null, ghost: null, spiders: [], front: ctx.front };
    const later = (fn, ms) => {
      const id = setTimeout(() => { S && S.timers.delete(id); fn(); }, ms);
      S && S.timers.add(id);
    };
    S.later = later;

    // back layer: webs, fog, eyes
    const back = ctx.back, front = ctx.front;
    back.appendChild(box("hf-web l", art["web-corner"]));
    back.appendChild(box("hf-web r", art["web-corner"]));
    const f1 = document.createElement("div"); f1.className = "hf hf-fog"; back.appendChild(f1);
    const f2 = document.createElement("div"); f2.className = "hf hf-fog b"; back.appendChild(f2);
    const eyes = box("hf-eyes", art["eyes-in-dark"]); back.appendChild(eyes);

    // front layer: spiders, pumpkin, ghost
    ["s1", "s2", "s3"].forEach((c) => {
      const sp = document.createElement("div");
      sp.className = "hf hf-sp " + c;
      sp.setAttribute("aria-hidden", "true");
      sp.innerHTML = '<div class="hf-th"></div><div class="hf-sb">' + svgOf(art.spider) + "</div>";
      front.appendChild(sp);
      S.spiders.push(sp);
    });
    front.appendChild(box("hf-pump", art["jack-o-lantern"]));
    const ghost = box("hf-ghost", art.ghost);
    front.appendChild(ghost);
    S.ghost = ghost;

    // bat perched on the logo
    const mark = document.querySelector(".brand-mark");
    if (mark) {
      const p = document.createElement("span");
      p.className = "hf-perch";
      p.setAttribute("aria-hidden", "true");
      p.innerHTML = svgOf(art["bat-logo-accent"]);
      mark.appendChild(p);
      S.perch = p;
    }

    // lite on data screens
    S.mo = new MutationObserver(updateLite);
    document.querySelectorAll(".tab-panel, #editor").forEach((el) => S.mo.observe(el, { attributes: true, attributeFilter: ["hidden"] }));
    updateLite();

    if (!full) return; // subtle: finished still picture, no timers, no easter eggs

    const state = () => ({ lite: S.lite, hidden: document.hidden, busy: S.busy });

    // spider trips
    S.spiders.forEach((sp, i) => {
      const sb = sp.querySelector(".hf-sb");
      const trip = () => {
        const n = nextTrip(state());
        if (!n.go) return later(trip, n.wait);
        S.busy = true;
        sp.classList.add("go");
        const done = () => {
          if (!sp.classList.contains("go")) return;
          sp.classList.remove("go");
          S.busy = false;
          later(trip, randDelay(TRIP));
        };
        sb.addEventListener("animationend", done, { once: true });
        later(done, 10500);
      };
      later(trip, 3500 + i * 5000 + randDelay([0, 3000]));
    });

    // bat flying across the top 30%
    const fly = (fast) => {
      if (S.busy) return false;
      S.busy = true;
      const b = box("hf-bat" + (Math.random() < 0.5 ? " rtl" : "") + (fast ? " fast" : ""), art.bat);
      b.style.top = (5 + Math.random() * 22).toFixed(1) + "vh";
      b.innerHTML = '<div class="in">' + b.innerHTML + "</div>";
      front.appendChild(b);
      let gone = false;
      const rm = () => { if (gone) return; gone = true; b.remove(); S && (S.busy = false); };
      b.addEventListener("animationend", (e) => { if (e.target === b) rm(); });
      later(rm, fast ? 6500 : 13500);
      return true;
    };
    const batLoop = () => {
      if (S.lite || document.hidden) return later(batLoop, randDelay(BAT));
      if (!fly(false)) return later(batLoop, 2000); // a spider is mid-trip: try again shortly
      later(batLoop, randDelay(BAT));
    };
    later(batLoop, 9000);

    // surprise scuttle along the bottom edge
    const scuttle = () => {
      if (!S.lite && !document.hidden && !S.busy) {
        const r = box("hf-run", art.spider);
        front.appendChild(r);
        const rm = () => r.remove();
        r.addEventListener("animationend", rm, { once: true });
        later(rm, 4200);
      }
      later(scuttle, randDelay(SCUTTLE));
    };
    later(scuttle, randDelay(SCUTTLE));

    // eyes blink
    const blink = () => {
      eyes.classList.add("blink");
      later(() => eyes.classList.remove("blink"), 1200);
      later(blink, randDelay(EYES));
    };
    later(blink, 5000);

    // perched bat flutters now and then
    if (S.perch) {
      const flut = () => {
        if (!S.lite && !S.perch.classList.contains("flee")) {
          S.perch.classList.add("flut");
          later(() => S.perch && S.perch.classList.remove("flut"), 1300);
        }
        later(flut, randDelay(FLUTTER));
      };
      later(flut, 4000);
    }

    // easter egg: tap the logo -> ghost says Boo!, perched bat flaps away
    S.onClick = (e) => {
      const t = e.target;
      if (!t || !t.closest || !t.closest(".brand-mark") || !S) return;
      if (!S.ghost.querySelector(".hf-boo")) {
        const boo = document.createElement("span");
        boo.className = "hf-boo";
        boo.setAttribute("aria-hidden", "true");
        boo.textContent = "Boo!";
        S.ghost.appendChild(boo);
        const rm = () => boo.remove();
        boo.addEventListener("animationend", rm, { once: true });
        later(rm, 1700);
      }
      const p = S.perch;
      if (p && !p.classList.contains("flee") && !p.classList.contains("gone")) {
        p.classList.remove("flut", "ret");
        p.classList.add("flee");
        later(() => { p.classList.remove("flee"); p.classList.add("gone"); }, 1650);
        later(() => { p.classList.remove("gone"); p.classList.add("ret"); }, 7000);
        later(() => p.classList.remove("ret"), 8000);
      }
    };
    document.addEventListener("click", S.onClick);
  }

  function teardown() {
    if (!S) return;
    const s = S;
    S = null;
    s.timers.forEach(clearTimeout);
    if (s.mo) s.mo.disconnect();
    if (s.onClick) document.removeEventListener("click", s.onClick);
    if (s.perch) s.perch.remove();
    html.classList.remove("hf-lite");
  }

  const handler = {
    mount(ctx) {
      const my = ++gen;
      const go = () => {
        if (my !== gen) return;
        Promise.all(ART.map((n) => ctx.inline(n))).then((list) => {
          if (my !== gen) return;
          const art = {};
          ART.forEach((n, i) => { art[n] = list[i]; });
          teardown();
          build(ctx, art);
        });
      };
      if (window.requestIdleCallback) window.requestIdleCallback(go, { timeout: 2500 });
      else setTimeout(go, 400);
    },
    unmount() { gen++; teardown(); },
  };
  window.ThemeFx.register("hallowfit", handler);
  // theme-fx.js applies once at load, before this file registers, and marks the theme as mounted
  // without a handler, so register() cannot mount it. Mount here when that happened.
  const root = document.getElementById("fx-root");
  const m = window.ThemeFx.mode();
  if (!S && !gen && m !== "off" && html.getAttribute("data-theme") === "hallowfit" && root) {
    handler.mount({ theme: "hallowfit", mode: m, back: root.querySelector(".fx-back"), front: root.querySelector(".fx-front"), inline: window.ThemeFx.inline });
  }
})();
