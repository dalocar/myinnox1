/* Theme resolution - pure logic (no DOM). Browser global `ThemeCore`, Node
   module.exports. The inline boot script in index.html duplicates resolve()
   on purpose (it must run before the stylesheet); keep them in sync. */
(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.ThemeCore = api;
})(typeof self !== "undefined" ? self : this, function () {
  const KEY = "innodigym_theme";
  // Resolved ids (value of data-theme) -> page background, used for <meta name="theme-color">.
  const META = { default: "#f4f6fb", dark: "#0e1523", ember: "#faf4ec", tide: "#eef3fa", graphite: "#ececee", "fit-xmas": "#f3f8f5", hallowfit: "#120d1a" };
  const DARK = ["dark", "hallowfit"];
  const IDS = Object.keys(META);
  const PREFS = ["auto"].concat(IDS);

  /** Stored value -> a valid preference ("auto" or a theme id); anything else is "auto". */
  function normalizePref(v) {
    return typeof v === "string" && PREFS.indexOf(v) !== -1 ? v : "auto";
  }
  /** Preference + OS dark flag -> the theme id to put on <html>. */
  function resolve(pref, prefersDark) {
    const p = normalizePref(pref);
    if (p === "auto") return prefersDark ? "dark" : "default";
    return p;
  }
  /** color-scheme value for a resolved id. */
  function schemeOf(id) {
    return DARK.indexOf(id) !== -1 ? "dark" : "light";
  }
  return { KEY, META, IDS, PREFS, normalizePref, resolve, schemeOf };
});
