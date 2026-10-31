/* Seasonal decorations - pure logic (no DOM). Browser global `ThemeFxCore`, Node
   module.exports. Decides how much decoration a theme gets; colours and fonts of a
   theme always apply, only the animated/decorative layer is governed here. */
(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.ThemeFxCore = api;
})(typeof self !== "undefined" ? self : this, function () {
  const KEY = "innodigym_fx";
  const MODES = ["full", "subtle", "off"];
  const THEMES = ["fit-xmas", "hallowfit"]; // themes that have a decoration layer

  /** Stored value -> a valid setting; anything else is "full" (the default). */
  function normalizeMode(v) {
    return typeof v === "string" && MODES.indexOf(v) !== -1 ? v : "full";
  }
  function hasFx(themeId) {
    return THEMES.indexOf(themeId) !== -1;
  }
  /**
   * Setting + environment -> the mode actually applied.
   * off stays off; reduced motion and data-saver cap "full" at "subtle" (static
   * decorations, no movement); a theme without a layer is always off.
   */
  function effective(setting, env) {
    const e = env || {};
    if (!hasFx(e.theme)) return "off";
    const m = normalizeMode(setting);
    if (m === "off") return "off";
    if (e.reducedMotion || e.saveData) return "subtle";
    return m;
  }
  /** Particle budget (snow flakes etc.) from viewport width and device hints. */
  function particleCount(width, cores, memory) {
    let n = width < 600 ? 40 : 70;
    if ((cores && cores < 4) || (memory && memory < 4)) n = Math.round(n / 2);
    return n;
  }
  return { KEY, MODES, THEMES, normalizeMode, hasFx, effective, particleCount };
});
