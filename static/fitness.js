/* Fitness screen: gamified "Fitness Level" (radar + three ability cards with a
   rank badge). Pure logic lives in fitness-core.js; this file is DOM + wiring
   only. Depends on app.js globals: $, api, t, escapeHtml. All API-derived text
   goes through escapeHtml / textContent, never raw into innerHTML. */
(function () {
  const C = window.FitnessCore;
  const S = { data: null, loading: false, error: null, token: 0 };

  const nameOf = (s) => (s.name ? t(s.name) : t("Test {n}", { n: s.typeId }));
  const tierOf = (s) => (C.levelIndex(s.level) >= 0 ? C.LEVELS[C.levelIndex(s.level)] : "C");
  const letterOf = (s) => (s.level ? s.level.slice(0, 2) : s.tested ? "\u2013" : "C");

  function levelText(s) {
    if (!s.tested) return t("Not tested yet");
    const seg = C.segments(s.level, s.percent, true);
    return s.level
      ? t("Level {n}, step {a} of {b}", { n: s.level, a: seg.filled, b: seg.total })
      : t("Step {a} of {b}", { a: seg.filled, b: seg.total });
  }

  function badge(s) {
    const on = s.tested;
    const letter = escapeHtml(letterOf(s));
    return `<svg class="fit-badge${on ? "" : " is-off"}" data-tier="${tierOf(s)}" viewBox="0 0 72 60" ${on && s.level ? `role="img" aria-label="${escapeHtml(t("Level {n}", { n: s.level }))}"` : 'aria-hidden="true"'}>
      <path class="fit-wing" d="M26 22C16 14 7 12 2 14c2 8 7 15 16 18 3 1 6 1 8 0z"/>
      <path class="fit-wing" d="M46 22c10-8 19-10 24-8-2 8-7 15-16 18-3 1-6 1-8 0z"/>
      <path class="fit-shield" d="M36 3l15 8v17c0 11-7 20-15 25-8-5-15-14-15-25V11z"/>
      <text class="fit-letter" x="36" y="35" text-anchor="middle" ${letter.length > 1 ? 'style="font-size:17px"' : ""}>${letter}</text>
    </svg>`;
  }

  function cardHtml(s) {
    const v = C.formatValue(s, Units.get());
    const seg = C.segments(s.level, s.percent, s.tested);
    const segs = Array.from({ length: seg.total }, (_, i) => `<span class="fit-seg${i < seg.filled ? " on" : ""}"></span>`).join("");
    const unit = v.unit ? t(v.unit) : "";
    return `<li class="fit-card${s.tested ? "" : " is-off"}" data-key="${escapeHtml(s.key)}" data-tier="${tierOf(s)}">
      <div class="fit-info">
        <h3 class="fit-name">${escapeHtml(nameOf(s))}</h3>
        <div class="fit-date meta">${s.tested ? escapeHtml(s.date || "") : escapeHtml(t("Not tested yet"))}</div>
        <div class="fit-bar" role="progressbar" aria-label="${escapeHtml(nameOf(s))}" aria-valuemin="0" aria-valuemax="${seg.total}" aria-valuenow="${seg.filled}" aria-valuetext="${escapeHtml(levelText(s))}">${segs}</div>
      </div>
      <div class="fit-side">
        <div class="fit-value"><strong>${escapeHtml(v.text)}</strong>${unit ? ` <small>${escapeHtml(unit)}</small>` : ""}</div>
        ${badge(s)}
      </div>
    </li>`;
  }

  function radarHtml(slots) {
    const r = C.radarPoints(slots, 360);
    const label = slots.map((s) => {
      const v = C.formatValue(s, Units.get());
      return `${nameOf(s)}: ${s.tested ? `${v.text} ${v.unit ? t(v.unit) : ""}`.trim() : t("Not tested yet")}`;
    }).join("; ");
    const lines = r.axes.map((a) => `<line class="fit-axis" x1="${r.cx}" y1="${r.cy}" x2="${a.x}" y2="${a.y}"/>`).join("");
    const rings = r.rings.map((p, i) => `<polygon class="fit-ring${i === r.rings.length - 1 ? " outer" : ""}" points="${p}"/>`).join("");
    const labels = r.axes.map((a, i) => `<text class="fit-axis-label" x="${a.labelX}" y="${a.labelY}" text-anchor="middle">${escapeHtml(nameOf(slots[i]))}</text>`).join("");
    const dots = r.dots.map((d, i) => `<circle class="fit-dot${slots[i].tested ? "" : " is-off"}" cx="${d.x}" cy="${d.y}" r="4"/>`).join("");
    return `<svg class="fit-radar" viewBox="0 0 ${r.width} ${r.height}" role="img" aria-label="${escapeHtml(label)}">
      ${rings}${lines}<polygon class="fit-poly" points="${r.polygon}"/>${dots}${labels}</svg>`;
  }

  function render() {
    const box = $("fitness-body");
    if (!box) return;
    if (S.error) {
      box.innerHTML = `<p class="server-error">${escapeHtml(t("Failed to load: {msg}", { msg: S.error }))} <button type="button" id="fit-retry" class="secondary">${escapeHtml(t("Retry"))}</button></p>`;
      $("fit-retry").onclick = load;
      return;
    }
    if (!S.data) {
      box.innerHTML = `<p class="meta">${escapeHtml(t("Loading…"))}</p>`;
      return;
    }
    const { slots, extras } = S.data;
    const none = !slots.some((s) => s.tested) && !extras.length;
    box.innerHTML = (none ? `<div class="empty-state fit-empty"><p>${escapeHtml(t("No fitness test results yet."))}</p><p class="meta">${escapeHtml(t("Fitness tests are taken on the training machine; your results will show up here."))}</p></div>` : "") +
      `<div class="fit-radar-wrap">${radarHtml(slots)}</div>` +
      `<ul class="fit-cards">${slots.concat(extras).map(cardHtml).join("")}</ul>`;
  }

  async function load() {
    const token = ++S.token;
    S.loading = true; S.error = null;
    render();
    try {
      const res = await api("/physicalFitnessTest/last");
      if (token !== S.token) return;
      S.data = C.normalizeTests(res && res.data);
    } catch (e) {
      if (token !== S.token) return;
      S.error = e.message;
    }
    S.loading = false;
    render();
  }

  // Tab activated: refresh in the background, keeping the last render meanwhile.
  function show() { if (S.data) render(); load(); }
  // Language changed: labels only, data is language independent.
  function relang() { render(); }

  window.FitnessUI = { show, relang, _state: S };
})();
