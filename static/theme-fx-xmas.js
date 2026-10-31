/* FitMas (fit-xmas) decoration layer: light string, snow canvas, logo sparkles, shooting star.
   Registered with ThemeFx; static art (hat, snow lips, icicles, ornaments) lives in theme-fx-xmas.css.
   Pure helpers are exported for Node tests (module.exports). */
(function (root, factory) {
  const api = factory(root);
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (typeof window !== "undefined" && window.ThemeFx) api.register(window.ThemeFx);
})(typeof self !== "undefined" ? self : this, function (root) {
  const LIMIT_MS = 24, WINDOW_MS = 2000;
  const DATA_TABS = ["plans", "actions", "history", "fitness"];

  // ---------- pure helpers ----------
  /** Deterministic-friendly flake factory (rnd injectable). */
  function makeFlakes(n, w, h, rnd) {
    const r = rnd || Math.random, out = [];
    for (let i = 0; i < n; i++) {
      const size = 1 + r() * 2.6; // radius px, small
      out.push({ x: r() * w, y: r() * h, r: size, vy: 16 + size * 9 + r() * 10, vx: (r() - 0.5) * 8, ph: r() * 6.28, sw: 0.6 + r() * 0.9 });
    }
    return out;
  }
  /** Wrap a coordinate into [-pad, max+pad). */
  function wrap(v, max, pad) {
    const span = max + pad * 2;
    return ((((v + pad) % span) + span) % span) - pad;
  }
  /** Advance one flake by dt seconds at time t (ms); mutates and returns it. */
  function stepFlake(f, dt, w, h, t) {
    f.y += f.vy * dt;
    f.x += (f.vx + Math.sin(t * 0.001 * f.sw + f.ph) * 10) * dt;
    f.y = wrap(f.y, h, f.r + 2);
    f.x = wrap(f.x, w, f.r + 2);
    return f;
  }
  /** Rolling frame-cost accumulator; decision once >= 2s of samples average above 24ms. */
  function newStats() { return { sum: 0, n: 0, span: 0 }; }
  function addSample(s, cost, interval) { s.sum += cost; s.n++; s.span += interval; return s; }
  function budgetExceeded(s, limit, windowMs) {
    return s.span >= (windowMs || WINDOW_MS) && s.n > 0 && s.sum / s.n > (limit || LIMIT_MS);
  }
  /** Data-heavy screen => decoration goes static/minimal. */
  function isDataScreen(tab, editorOpen) {
    return DATA_TABS.indexOf(tab) !== -1 || (tab === "programs" && !!editorOpen);
  }
  function nextStarDelay(rnd) { return 40000 + (rnd || Math.random)() * 20000; }
  function burstSpecs(n, rnd) {
    const r = rnd || Math.random, cols = ["#ffd54a", "#ffffff", "#e5243b", "#2fbf71", "#9fd0ff"], out = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * 6.283 + r() * 0.5, d = 34 + r() * 46;
      out.push({ dx: Math.round(Math.cos(a) * d), dy: Math.round(Math.sin(a) * d - 8), rot: Math.round(r() * 360 - 180), size: 5 + Math.round(r() * 5), color: cols[i % cols.length], shape: i % 3 });
    }
    return out;
  }

  // ---------- runtime ----------
  function register(ThemeFx) {
    const FC = root.ThemeFxCore, doc = document, html = doc.documentElement;
    let live = null; // per-mount state

    function mount(ctx) {
      const st = { dead: false, timers: [], mo: null, raf: 0, cv: null, lite: false, stopped: false, ctx, burstAt: 0 };
      live = st;
      const idle = root.requestIdleCallback ? (fn) => root.requestIdleCallback(fn, { timeout: 1500 }) : (fn) => setTimeout(fn, 120);
      idle(() => { if (!st.dead) build(st); });
    }

    function unmount() {
      const st = live;
      if (!st) return;
      st.dead = true;
      live = null;
      st.timers.forEach(clearTimeout);
      cancelAnimationFrame(st.raf);
      if (st.mo) st.mo.disconnect();
      (st.off || []).forEach((fn) => fn());
      if (st.top && st.top.parentNode) st.top.remove();
      if (st.cv) st.cv.remove();
      html.classList.remove("xmas-lite", "xmas-static");
    }

    function build(st) {
      st.off = [];
      const { ctx } = st, full = ctx.mode === "full";
      const on = (t, ev, fn, o) => { t.addEventListener(ev, fn, o); st.off.push(() => t.removeEventListener(ev, fn, o)); };
      buildLights(st);
      buildSnow(st, on, full);
      watchTabs(st);
      const mark = doc.querySelector(".brand-mark");
      if (mark && full) on(mark, "click", () => burst(st, mark));
      if (full) scheduleStar(st);
      on(doc, "visibilitychange", () => { if (doc.hidden) { cancelAnimationFrame(st.raf); st.raf = 0; } else startLoop(st); });
    }

    // --- light string (top of page, scrolls with it) ---
    function buildLights(st) {
      st.ctx.inline("light-string").then((svg) => {
        if (st.dead || !svg) return;
        const top = doc.createElement("div");
        top.className = "xmas-top";
        top.setAttribute("aria-hidden", "true");
        const scale = root.innerWidth < 600 ? 0.75 : 1, w = 160 * scale, n = Math.ceil(root.innerWidth / w) + 1;
        const bare = svg.replace(/<defs>[\s\S]*?<\/defs>/, ""); // symbol id only once
        // 4 stacked layers (wire + 3 bulb groups); each group twinkles via its own element's opacity (compositor only)
        const tiles = (first) => { let h = ""; for (let i = 0; i < n; i++) h += (first && !i ? svg : bare).replace("<svg ", '<svg class="xmas-ls" width="' + w + '" height="' + 24 * scale + '" focusable="false" '); return h; };
        top.innerHTML = '<div class="xmas-l xmas-wire">' + tiles(true) + '</div><div class="xmas-l xmas-g1">' + tiles() + '</div><div class="xmas-l xmas-g2">' + tiles() + '</div><div class="xmas-l xmas-g3">' + tiles() + "</div>";
        doc.body.appendChild(top);
        st.top = top;
      });
    }

    // --- snow ---
    function buildSnow(st, on, full) {
      const cv = doc.createElement("canvas");
      cv.className = "xmas-snow";
      cv.setAttribute("aria-hidden", "true");
      doc.body.appendChild(cv); // body level so z-index -1 really sits behind page content (the fx layers paint above it)
      st.cv = cv;
      const cx = cv.getContext("2d");
      if (!cx) return;
      st.cx = cx;
      st.stats = newStats();
      const size = () => {
        const dpr = Math.min(root.devicePixelRatio || 1, 1.5);
        st.W = root.innerWidth; st.H = root.innerHeight;
        cv.width = Math.round(st.W * dpr); cv.height = Math.round(st.H * dpr);
        cx.setTransform(dpr, 0, 0, dpr, 0, 0);
        const nav = root.navigator || {};
        const want = full ? FC.particleCount(st.W, nav.hardwareConcurrency, nav.deviceMemory) : 14;
        if (!st.flakes || Math.abs(st.flakes.length - want) > 4) st.flakes = makeFlakes(want, st.W, st.H);
        else st.flakes.forEach((f) => { f.x = Math.min(f.x, st.W); f.y = Math.min(f.y, st.H); });
        st.capMs = st.W < 600 ? 33 : 0;
        draw(st);
      };
      size();
      let rt = 0;
      on(root, "resize", () => { clearTimeout(rt); rt = setTimeout(() => !st.dead && size(), 200); st.timers.push(rt); });
      if (full) startLoop(st);
    }

    function draw(st) {
      const cx = st.cx;
      cx.clearRect(0, 0, st.W, st.H);
      cx.fillStyle = "rgba(255,255,255,.92)";
      cx.strokeStyle = "rgba(96,140,184,.6)";
      cx.lineWidth = 0.8;
      cx.beginPath();
      const arms = new Path2D();
      for (const f of st.flakes) {
        if (f.r > 2.7) { // a few snowflake crosses
          for (let k = 0; k < 3; k++) {
            const a = k * 1.047, dx = Math.cos(a) * f.r * 1.6, dy = Math.sin(a) * f.r * 1.6;
            arms.moveTo(f.x - dx, f.y - dy); arms.lineTo(f.x + dx, f.y + dy);
          }
        } else { cx.moveTo(f.x + f.r, f.y); cx.arc(f.x, f.y, f.r, 0, 6.283); }
      }
      cx.fill(); cx.stroke();
      cx.lineWidth = 1.1;
      cx.stroke(arms);
    }

    function startLoop(st) {
      if (st.dead || st.raf || !st.cx || st.ctx.mode !== "full" || st.lite || st.stopped || doc.hidden) return;
      st.last = 0; st.stats = newStats();
      st.raf = requestAnimationFrame((ts) => frame(st, ts));
    }
    function frame(st, ts) {
      st.raf = requestAnimationFrame((t2) => frame(st, t2));
      if (st.last && ts - st.last < st.capMs - 2) return;
      const interval = st.last ? ts - st.last : 0;
      st.last = ts;
      const dt = Math.min(interval || 16, 100) / 1000, t0 = performance.now();
      for (const f of st.flakes) stepFlake(f, dt, st.W, st.H, ts);
      draw(st);
      const cost = performance.now() - t0;
      if (interval && interval < 250) {
        const late = Math.max(0, interval - (st.capMs ? 34 : 18));
        addSample(st.stats, cost + late, interval);
        if (budgetExceeded(st.stats)) { // too heavy: freeze as static decor
          st.stopped = true; cancelAnimationFrame(st.raf); st.raf = 0;
          html.classList.add("xmas-static");
        }
      } else st.stats = newStats();
    }

    // --- lighter on data screens ---
    function watchTabs(st) {
      const host = doc.getElementById("main-section") || doc.body;
      const check = () => {
        const p = host.querySelector(".tab-panel:not([hidden])");
        const ed = doc.getElementById("editor");
        const lite = isDataScreen(p ? p.id.replace("tab-", "") : "", ed && !ed.hidden);
        if (lite === st.lite) return;
        st.lite = lite;
        html.classList.toggle("xmas-lite", lite);
        if (lite) { cancelAnimationFrame(st.raf); st.raf = 0; if (st.cv) st.cv.style.display = "none"; }
        else { if (st.cv) st.cv.style.display = ""; startLoop(st); }
      };
      let q = false;
      st.mo = new MutationObserver(() => { if (!q) { q = true; Promise.resolve().then(() => { q = false; if (!st.dead) check(); }); } });
      st.mo.observe(host, { attributes: true, attributeFilter: ["hidden"], subtree: true });
      check();
    }

    // --- easter eggs ---
    function burst(st, mark) {
      const now = Date.now();
      if (now - st.burstAt < 1100) return;
      st.burstAt = now;
      const r = mark.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      const wrap2 = doc.createElement("div");
      wrap2.className = "xmas-burst";
      burstSpecs(14).forEach((s) => {
        const e = doc.createElement("i");
        e.className = "xmas-p xmas-p" + s.shape;
        e.style.cssText = "left:" + cx + "px;top:" + cy + "px;width:" + s.size + "px;height:" + s.size + "px;background:" + s.color + ";--dx:" + s.dx + "px;--dy:" + s.dy + "px;--r:" + s.rot + "deg";
        wrap2.appendChild(e);
      });
      st.ctx.front.appendChild(wrap2);
      st.timers.push(setTimeout(() => wrap2.remove(), 1150));
    }
    function scheduleStar(st) {
      st.timers.push(setTimeout(() => {
        if (st.dead) return;
        if (!doc.hidden && !st.lite) shootingStar(st);
        scheduleStar(st);
      }, nextStarDelay()));
    }
    function shootingStar(st) {
      const w = root.innerWidth, h = root.innerHeight, e = doc.createElement("i");
      e.className = "xmas-star";
      e.style.cssText = "left:" + Math.round(w * (0.05 + Math.random() * 0.4)) + "px;top:" + Math.round(h * (0.06 + Math.random() * 0.2)) + "px;--dx:" + Math.round(w * 0.55) + "px;--dy:" + Math.round(w * 0.55 * 0.47) + "px";
      st.ctx.front.appendChild(e);
      st.timers.push(setTimeout(() => e.remove(), 1700));
    }

    ThemeFx.register("fit-xmas", { mount, unmount });
  }

  return { makeFlakes, wrap, stepFlake, newStats, addSample, budgetExceeded, isDataScreen, nextStarDelay, burstSpecs, register };
});
