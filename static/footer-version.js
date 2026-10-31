// Fills the footer with the build identifier so users can quote it in bug reports.
(function () {
  var el = document.getElementById("app-version");
  if (!el) return;
  var v = window.APP_VERSION || {};
  var text = "MyInnoX1 · build " + (v.sha || "dev") + (v.date ? " · " + v.date : "");
  el.textContent = text;
  el.title = text;
  el.hidden = false;
})();
