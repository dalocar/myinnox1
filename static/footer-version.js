// The footer line with the version and build identifier (so users can quote it in bug reports). Clicking it opens the
// "What's new" dialog built here from changelog-core.js. Uses I18N from i18n.js.
(function () {
  var C = window.ChangelogCore;
  var el = document.getElementById("app-version");
  if (!el || !C) return;
  Object.assign(I18N.es, {
    "What's new": "Novedades",
    "Close": "Cerrar",
    "Version {v}": "Versión {v}",
    "Export your training for AI analysis": "Exporta tu entrenamiento para analizarlo con IA",
    "Export all your workouts, or those between two dates, as one file that an AI chat can read.": "Exporta todos tus entrenamientos, o los de un rango de fechas, en un único archivo que un chat de IA puede leer.",
    "Pick a suggested question, then copy it with your data or download the file.": "Elige una pregunta sugerida y cópiala junto con tus datos, o descarga el archivo.",
    "Find Export on the History tab and in My Activity.": "Encontrarás Exportar en la pestaña Historial y en Mi actividad.",
    "Easier self-hosting": "Autoalojamiento más sencillo",
    "If you run the app on your own computer, start it with a double-click on Windows or macOS, and stop it from the app.": "Si ejecutas la app en tu ordenador, iníciala con doble clic en Windows o macOS y deténla desde la propia app.",
    "Training modes in your programs": "Modos de entrenamiento en tus programas",
    "Set Standard, Eccentric, Spring or Isokinetic mode for each exercise, or for all of them at once.": "Elige el modo Estándar, Excéntrico, Resorte o Isocinético para cada ejercicio, o para todos a la vez.",
    "Combined exercises explain the weight per cable and show the total.": "Los ejercicios combinados explican el peso por cable y muestran el total.",
    "Exercise progress": "Progreso del ejercicio",
    "See how each exercise develops over time, with your personal best.": "Mira cómo evoluciona cada ejercicio, con tu mejor marca.",
    "Search all the exercises you have trained, and open their progress from the program editor.": "Busca entre los ejercicios que has entrenado y abre su progreso desde el editor de programas.",
    "Build routines with AI": "Crea rutinas con IA",
    "Copy a ready-made prompt, ask your AI for a routine and import its answer as programs.": "Copia unas instrucciones ya preparadas, pide una rutina a tu IA e importa su respuesta como programas.",
    "Better custom actions": "Mejores acciones propias",
    "Use your own actions in programs.": "Usa tus propias acciones en los programas.",
    "Edit your custom actions and give them a picture.": "Edita tus acciones propias y ponles una imagen.",
    "Program details now include warm-up and stretch exercises.": "El detalle del programa incluye ahora el calentamiento y los estiramientos.",
    "First release": "Primera versión",
    "Create and edit programs and multi-week plans.": "Crea y edita programas y planes de varias semanas.",
    "Browse official courses and the exercise library.": "Explora los cursos oficiales y la biblioteca de ejercicios.",
    "Review your activity, medals, workout reports and fitness level.": "Revisa tu actividad, medallas, informes de entrenamiento y nivel físico.",
    "Choose your language, theme and weight units.": "Elige idioma, tema y unidades de peso.",
  });

  var label = C.buildLabel(window.APP_VERSION);
  var make = function (tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };

  var link = make("button", "app-version-link");
  link.type = "button";
  link.setAttribute("aria-haspopup", "dialog");
  el.textContent = "";
  el.appendChild(link);
  el.hidden = false;

  // A native modal dialog: focus trapping, Escape and return of focus come from the browser.
  var dlg = make("dialog", "changelog");
  dlg.setAttribute("aria-labelledby", "changelog-title");
  var head = make("div", "changelog-head"), title = make("h2"), close = make("button", "secondary"), body = make("div", "changelog-body");
  title.id = "changelog-title"; title.tabIndex = -1; close.type = "button"; body.tabIndex = 0;
  head.append(title, close);
  dlg.append(head, body);
  document.body.appendChild(dlg);

  function paint() {
    var more = I18N.t("What's new");
    link.textContent = "";
    link.append(make("span", null, label), " · ", make("span", "app-version-more", more));
    title.textContent = more;
    close.textContent = I18N.t("Close");
    body.textContent = "";
    C.RELEASES.forEach(function (r) {
      var s = make("section"), meta = make("p", "meta"), time = make("time", null, C.formatDate(r.date, I18N.lang)), ul = make("ul");
      time.dateTime = r.date;
      meta.append(I18N.t("Version {v}", { v: r.version }), " · ", time);
      r.items.forEach(function (k) { ul.appendChild(make("li", null, I18N.t(k))); });
      s.append(make("h3", null, I18N.t(r.title)), meta, ul);
      body.appendChild(s);
    });
    body.appendChild(make("p", "changelog-build", label));
  }
  link.addEventListener("click", function () { dlg.showModal(); body.scrollTop = 0; title.focus(); });
  close.addEventListener("click", function () { dlg.close(); });
  dlg.addEventListener("click", function (e) { if (e.target === dlg) dlg.close(); }); // a click on the backdrop
  I18N.onChange.push(paint);
  paint();
})();
