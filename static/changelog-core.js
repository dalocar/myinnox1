/* The user-facing change log: data plus pure helpers, no DOM. Browser global `ChangelogCore`, Node module.exports.
   Newest first. Add an entry (and its strings in every language pack) when a release changes what users can DO.
   Leave out support / tip prompts, analytics, refactors, CI and small layout fixes. Texts are English i18n keys. */
(function (root) {
  "use strict";
  const RELEASES = [
    { version: "1.6", date: "2026-11-27", title: "Export your training for AI analysis", items: [
      "Export all your workouts, or those between two dates, as one file that an AI chat can read.",
      "Pick a suggested question, then copy it with your data or download the file.",
      "Find Export on the History tab and in My Activity.",
    ] },
    { version: "1.5", date: "2026-11-26", title: "Easier self-hosting", items: [
      "If you run the app on your own computer, start it with a double-click on Windows or macOS, and stop it from the app.",
    ] },
    { version: "1.4", date: "2026-11-18", title: "Training modes in your programs", items: [
      "Set Standard, Eccentric, Spring or Isokinetic mode for each exercise, or for all of them at once.",
      "Combined exercises explain the weight per cable and show the total.",
    ] },
    { version: "1.3", date: "2026-11-07", title: "Exercise progress", items: [
      "See how each exercise develops over time, with your personal best.",
      "Search all the exercises you have trained, and open their progress from the program editor.",
    ] },
    { version: "1.2", date: "2026-11-06", title: "Build routines with AI", items: [
      "Copy a ready-made prompt, ask your AI for a routine and import its answer as programs.",
    ] },
    { version: "1.1", date: "2026-11-01", title: "Better custom actions", items: [
      "Use your own actions in programs.",
      "Edit your custom actions and give them a picture.",
      "Program details now include warm-up and stretch exercises.",
    ] },
    { version: "1.0", date: "2026-10-31", title: "First release", items: [
      "Create and edit programs and multi-week plans.",
      "Browse official courses and the exercise library.",
      "Review your activity, medals, workout reports and fitness level.",
      "Choose your language, theme and weight units.",
    ] },
  ];
  const latest = () => RELEASES[0];
  // Every translatable string of the log.
  const keys = () => RELEASES.reduce((all, r) => all.concat(r.title, r.items), []);
  // "2026-11-07" in the reader's language; the raw date if it cannot be formatted.
  function formatDate(date, lang) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(date));
    if (!m) return String(date);
    try { return new Intl.DateTimeFormat(lang || "en", { dateStyle: "long", timeZone: "UTC" }).format(Date.UTC(+m[1], m[2] - 1, +m[3])); }
    catch (e) { return String(date); }
  }
  // "MyInnoX1 v1.6 · build abc1234 · 2026-11-27"; build is "dev" when not stamped by CI.
  function buildLabel(appVersion) {
    const v = appVersion || {};
    return `MyInnoX1 v${latest().version} · build ${v.sha || "dev"}${v.date ? " · " + v.date : ""}`;
  }
  const api = { RELEASES, latest, keys, formatDate, buildLabel };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.ChangelogCore = api;
})(typeof window !== "undefined" ? window : globalThis);
