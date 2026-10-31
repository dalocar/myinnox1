/* Minimal i18n: English strings are the keys, Spanish is looked up in ES below and
   the other languages in packs (i18n-<code>.js, registered on window.I18N_PACKS
   before this file loads). A missing key falls back to the English text. Static
   markup in index.html is translated in place by walking its text nodes/attributes
   once; strings built in JS go through t(). LANG is also sent to the API as
   languageId (the codes below are the ones the server accepts). */
(function () {
  const KEY = "innodigym_lang";
  // Order and names follow the official app's language picker.
  const LANGS = [
    { code: "en", name: "English", flag: "🇺🇸" },
    { code: "es", name: "Español", flag: "🇪🇸" },
    { code: "de", name: "Deutsch", flag: "🇩🇪" },
    { code: "fr", name: "Français", flag: "🇫🇷" },
    { code: "it", name: "Italiano", flag: "🇮🇹" },
    { code: "ko", name: "한국어", flag: "🇰🇷" },
    { code: "zh", name: "中文", flag: "🇨🇳" },
    { code: "ja", name: "日本語", flag: "🇯🇵" },
  ];
  const SUPPORTED = LANGS.map((l) => l.code);
  const PACKS = window.I18N_PACKS || {};

  const ES = {
    // ----- static markup (index.html) -----
    "MyInnoX1 — Unofficial X1 Pro Client": "MyInnoX1 — Cliente no oficial de X1 Pro",
    "Unofficial X1 Pro client": "Cliente no oficial de X1 Pro",
    "Language": "Idioma",
    "Welcome back": "Bienvenido de nuevo",
    "Log in with your INNODIGYM account.": "Inicia sesión con tu cuenta de INNODIGYM.",
    "Email": "Correo electrónico",
    "Password": "Contraseña",
    "Log in": "Iniciar sesión",
    "Log out": "Cerrar sesión",
    "Credentials are sent through this site's proxy straight to power.renhesports.com. The proxy doesn't store or log them. Your session token stays in this browser's localStorage.":
      "Las credenciales se envían a través del proxy de este sitio directamente a power.renhesports.com. El proxy no las guarda ni las registra. El token de sesión se conserva en el localStorage de este navegador.",
    "Main sections": "Secciones principales",
    "Programs": "Programas",
    "Plans": "Planes",
    "Actions": "Ejercicios",
    "History": "Historial",
    "Fitness": "Forma física",
    "Profile": "Perfil",
    // ----- theme picker -----
    "Theme": "Tema",
    "Buy me a coffee": "Invítame a un café",
    "Free, independent and unofficial. If it saves you time, a coffee helps keep it running. Nothing is locked behind it.": "Gratis, independiente y no oficial. Si te ahorra tiempo, un café ayuda a mantenerlo en marcha. Nada queda bloqueado tras ello.",
    "Saved on this device only.": "Se guarda solo en este dispositivo.",
    "Auto": "Automático",
    "Follows your device": "Sigue el ajuste de tu dispositivo",
    "Teal Classic": "Teal clásico",
    "Midnight": "Medianoche",
    "Ember": "Brasa",
    "Tide": "Marea",
    "Graphite": "Grafito",
    "The current look, fresh teal with a lime spark": "El aspecto actual, verde azulado fresco con un toque lima",
    "Deep dark theme, easy on the eyes at night": "Tema oscuro profundo, cómodo para la vista de noche",
    "Warm amber-brown and sand": "Ámbar tostado y arena cálidos",
    "Cool, calm blue": "Azul fresco y sereno",
    "High contrast, black on white": "Alto contraste, negro sobre blanco",
    "Snowy nights and twinkling lights": "Noches nevadas y luces centelleantes",
    "Pumpkins, cobwebs and creeping spiders": "Calabazas, telarañas y arañas sigilosas",
    "Seasonal decorations": "Decoraciones de temporada",
    "Animated extras for FitMas and HallowFit. They never block the app.": "Extras animados para FitMas y HallowFit. Nunca bloquean la app.",
    "Full": "Completo",
    "Subtle": "Sutil",
    "Off": "Desactivado",
    "Applies when you pick FitMas or HallowFit.": "Se aplica al elegir FitMas o HallowFit.",
    "Theme: {name}": "Tema: {name}",
    "Your Custom Programs": "Tus programas personalizados",
    "New Program": "Nuevo programa",
    "Refresh": "Actualizar",
    "Edit Program": "Editar programa",
    "← Back to list": "← Volver a la lista",
    "Name": "Nombre",
    "Cover": "Portada",
    "Change cover": "Cambiar portada",
    "Edit": "Editar",
    "Action": "Ejercicio",
    "Reps": "Reps",
    "Load (kg)": "Carga (kg)",
    "Per side": "Por lado",
    "Combined": "Combinado",
    "No weight": "Sin peso",
    "×2 cables = {total} total": "×2 cables = {total} en total",
    "Load per cable (kg)": "Carga por cable (kg)",
    "Resistance on each cable; both cables work at once": "Resistencia en cada cable; los dos cables trabajan a la vez",
    "Rest (s)": "Descanso (s)",
    "Sets": "Series",
    "+ Add action": "+ Añadir ejercicio",
    "Save changes": "Guardar cambios",
    "Delete program": "Eliminar programa",
    "Training Plans": "Planes de entrenamiento",
    "New Plan": "Nuevo plan",
    "New plan": "Nuevo plan",
    "← Back to plans": "← Volver a los planes",
    "Plan steps": "Pasos del plan",
    "Back": "Atrás",
    "Next": "Siguiente",
    "Save plan": "Guardar plan",
    "Add an action": "Añadir un ejercicio",
    "Close": "Cerrar",
    "Search actions…": "Buscar ejercicios…",
    "Your Custom Actions": "Tus ejercicios personalizados",
    "Add a custom action": "Añadir un ejercicio personalizado",
    "Mode": "Modo",
    "Weight-based": "Por peso",
    "Rep-based": "Por repeticiones",
    "Est. calories": "Calorías est.",
    "Add": "Añadir",
    "Workout History": "Historial de entrenamientos",
    "Refresh (last 180 days)": "Actualizar (últimos 180 días)",
    // ----- fitness screen -----
    "Fitness Level": "Nivel de forma física",
    "Upper-limb strength": "Fuerza de tren superior",
    "Lower-limb strength": "Fuerza de tren inferior",
    "Endurance": "Resistencia",
    "Not tested yet": "Sin probar aún",
    "Level {n}, step {a} of {b}": "Nivel {n}, paso {a} de {b}",
    "Step {a} of {b}": "Paso {a} de {b}",
    "Test {n}": "Prueba {n}",
    "kg": "kg",
    "lb": "lb",
    "Fitness tests are taken on the training machine; your results will show up here.": "Las pruebas de forma física se hacen en la máquina de entrenamiento; tus resultados aparecerán aquí.",
    "Fitness Tests": "Pruebas de forma física",
    "Nickname": "Apodo",
    "Birthday": "Fecha de nacimiento",
    "Sex": "Sexo",
    "Male": "Hombre",
    "Female": "Mujer",
    "Units": "Unidades",
    "Metric": "Métrico",
    "Imperial": "Imperial",
    "Daily training goal (min)": "Objetivo diario de entrenamiento (min)",
    "Target weight (kg)": "Peso objetivo (kg)",
    "Height (cm)": "Altura (cm)",
    "Currently fails on INNODIGYM's server for any value (confirmed 500) — edit in the official app.":
      "Actualmente falla en el servidor de INNODIGYM con cualquier valor (error 500 confirmado): edítalo en la app oficial.",
    "Weight (kg)": "Peso (kg)",
    "Same server-side issue as height.": "Mismo problema del servidor que con la altura.",
    "Choose a cover": "Elige una portada",
    "muscle.1": "Pecho", "muscle.2": "Hombro", "muscle.3": "Espalda", "muscle.4": "Brazo",
    "muscle.5": "Cadera", "muscle.6": "Piernas", "muscle.7": "Abdomen", "muscle.8": "Cuerpo completo",

    // ----- programs -----
    "Loading…": "Cargando…",
    "No custom programs yet. Use \"New Program\" to create one.": "Aún no hay programas personalizados. Usa «Nuevo programa» para crear uno.",
    "{n} exercises · {min} min · updated {date}": "{n} ejercicios · {min} min · actualizado {date}",
    "Delete": "Eliminar",
    "Failed to load: {msg}": "Error al cargar: {msg}",
    "Delete \"{name}\"? This cannot be undone.": "¿Eliminar «{name}»? Esta acción no se puede deshacer.",
    "Deleted.": "Eliminado.",
    "Delete failed: {msg}": "Error al eliminar: {msg}",
    "Failed to load program: {msg}": "Error al cargar el programa: {msg}",
    "Select cover": "Seleccionar portada",
    "Drag to reorder step {n} (or use arrow keys)": "Arrastra para reordenar el paso {n} (o usa las flechas del teclado)",
    "Drag to reorder": "Arrastra para reordenar",
    "Actions for {name}": "Acciones de {name}",
    "step {n}": "paso {n}",
    "Row actions": "Acciones de la fila",
    "Move up": "Subir",
    "Move down": "Bajar",
    "Duplicate": "Duplicar",
    "Remove": "Quitar",
    "All": "Todos",
    "No matches.": "Sin resultados.",
    "Saving…": "Guardando…",
    "Saved.": "Guardado.",
    "Saved — {name}": "Guardado — {name}",
    "Failed: {msg}": "Error: {msg}",
    "The server rejected the request": "El servidor rechazó la solicitud",
    "Save failed: {msg}": "Error al guardar: {msg}",

    // ----- actions tab -----
    "No custom actions yet. Add one below.": "Aún no hay ejercicios personalizados. Añade uno abajo.",
    "Delete this custom action?": "¿Eliminar este ejercicio personalizado?",
    "Adding…": "Añadiendo…",
    "Added (id {id}).": "Añadido (id {id}).",
    "Action added.": "Ejercicio añadido.",
    "Add failed: {msg}": "Error al añadir: {msg}",

    // ----- history / fitness -----
    "No workout records in the last 180 days.": "No hay entrenamientos en los últimos 180 días.",
    "(unnamed)": "(sin nombre)",
    "Delete this workout record? This cannot be undone.": "¿Eliminar este registro de entrenamiento? Esta acción no se puede deshacer.",
    "No fitness test results yet.": "Aún no hay resultados de pruebas de forma física.",

    // ----- profile -----
    "Failed to load profile: {msg}": "Error al cargar el perfil: {msg}",
    "Nothing changed.": "No hay cambios.",
    "Some fields failed to save: {list}": "Algunos campos no se pudieron guardar: {list}",
    "Profile partially saved — see details.": "Perfil guardado parcialmente; consulta los detalles.",
    "Profile saved.": "Perfil guardado.",

    // ----- planner -----
    "Mon": "Lun", "Tue": "Mar", "Wed": "Mié", "Thu": "Jue", "Fri": "Vie", "Sat": "Sáb", "Sun": "Dom",
    "You already have an ongoing plan. Stop it first (only one ongoing plan is allowed).": "Ya tienes un plan en curso. Detenlo primero (solo se permite un plan en curso).",
    "This plan is stopped or ended, so it can't be changed.": "Este plan está detenido o finalizado, por lo que no se puede modificar.",
    "The plan needs a name.": "El plan necesita un nombre.",
    "The plan needs a number of weeks.": "El plan necesita un número de semanas.",
    "Pick at least one training weekday.": "Elige al menos un día de la semana para entrenar.",
    "The plan has no training days.": "El plan no tiene días de entrenamiento.",
    "The plan has no routines scheduled.": "El plan no tiene rutinas programadas.",
    "Training days and scheduled days don't match.": "Los días de entrenamiento y los días programados no coinciden.",
    "Give the plan a name.": "Ponle un nombre al plan.",
    "Pick a valid start date.": "Elige una fecha de inicio válida.",
    "Weeks must be between 1 and {n}.": "Las semanas deben estar entre 1 y {n}.",
    "There are no training days in this range.": "No hay días de entrenamiento en este rango.",
    "Drag to reorder {name} (or use arrow keys)": "Arrastra para reordenar {name} (o usa las flechas del teclado)",
    "Move {name} up": "Subir {name}",
    "Move {name} down": "Bajar {name}",
    "My template": "Mi plantilla",
    "Course": "Curso",
    "Routine source": "Origen de las rutinas",
    "My templates": "Mis plantillas",
    "Courses": "Cursos",
    "Search routines…": "Buscar rutinas…",
    "Search routines": "Buscar rutinas",
    "Done": "Hecho",
    "{n} selected": "{n} seleccionadas",
    "No custom templates yet. Create one in the Programs tab.": "Aún no hay plantillas propias. Crea una en la pestaña Programas.",
    "No courses available.": "No hay cursos disponibles.",
    "Showing {shown} of {total} — type to narrow the list.": "Mostrando {shown} de {total}; escribe para acotar la lista.",
    "Retry": "Reintentar",
    "Ongoing": "En curso",
    "Stopped & ended": "Detenidos y finalizados",
    "No ongoing plan. Use “New Plan” to build one.": "No hay ningún plan en curso. Usa «Nuevo plan» para crear uno.",
    "Nothing here yet.": "Aún no hay nada aquí.",
    "Failed to load plans: {msg}": "Error al cargar los planes: {msg}",
    "{n}% done": "{n}% completado",
    "View / Edit": "Ver / Editar",
    "View": "Ver",
    "Stop": "Detener",
    "Stop this plan?": "¿Detener este plan?",
    "<b>{name}</b> will move to “Stopped & ended” and can't be edited afterwards.": "<b>{name}</b> pasará a «Detenidos y finalizados» y después no se podrá editar.",
    "Cancel": "Cancelar",
    "Stop plan": "Detener plan",
    "Plan stopped.": "Plan detenido.",
    "Stop failed: {msg}": "Error al detener: {msg}",
    "Delete this plan?": "¿Eliminar este plan?",
    "<b>{name}</b> will be permanently deleted. This cannot be undone.": "<b>{name}</b> se eliminará de forma permanente. Esta acción no se puede deshacer.",
    "Plan deleted.": "Plan eliminado.",
    "That plan no longer exists.": "Ese plan ya no existe.",
    "Failed to load plan: {msg}": "Error al cargar el plan: {msg}",
    "Discard changes?": "¿Descartar los cambios?",
    "You have unsaved changes to this plan.": "Tienes cambios sin guardar en este plan.",
    "Keep editing": "Seguir editando",
    "Discard": "Descartar",
    "View plan": "Ver plan",
    "Edit plan": "Editar plan",
    "Basics": "Básicos",
    "Routines": "Rutinas",
    "Review": "Revisión",
    "Details": "Detalles",
    "This plan is <b>{status}</b>, so it's view-only. The server doesn't allow changing stopped or ended plans.": "Este plan está <b>{status}</b>, por lo que es de solo lectura. El servidor no permite modificar planes detenidos o finalizados.",
    "stopped": "detenido",
    "ended": "finalizado",
    "Editing a saved plan. Start date, length and weekdays are fixed (the server ignores changes to them), but you can rename it, change the cover and fine-tune every day.": "Editando un plan guardado. La fecha de inicio, la duración y los días de la semana son fijos (el servidor ignora los cambios), pero puedes renombrarlo, cambiar la portada y ajustar cada día.",
    "Can't save yet:": "Aún no se puede guardar:",
    "Plan name": "Nombre del plan",
    "e.g. Autumn strength": "p. ej. Fuerza de otoño",
    "Start date": "Fecha de inicio",
    "Length (weeks)": "Duración (semanas)",
    "{n} weeks": "{n} semanas",
    "Training weekdays": "Días de entrenamiento",
    "None": "Ninguna",
    "Cover {n}": "Portada {n}",
    "{days}, {range}.": "{days}, {range}.",
    "No training days yet — pick at least one weekday.": "Aún no hay días de entrenamiento: elige al menos un día de la semana.",
    "Every training day gets all the selected routines, in the order shown below.": "Cada día de entrenamiento recibe todas las rutinas seleccionadas, en el orden mostrado abajo.",
    "Each training day gets the next routine in the list, then it loops back to the first. With Mon/Wed/Fri and A, B: Mon A · Wed B · Fri A · next Mon B…": "Cada día de entrenamiento recibe la siguiente rutina de la lista y después vuelve a la primera. Con lun/mié/vie y A, B: lun A · mié B · vie A · lun siguiente B…",
    "Routines & distribution": "Rutinas y distribución",
    "Add / change routines": "Añadir / cambiar rutinas",
    "+ Choose routines": "+ Elegir rutinas",
    "Remove {name}": "Quitar {name}",
    "Choose one or more routines — your own templates or official courses.": "Elige una o más rutinas: tus propias plantillas o cursos oficiales.",
    "Distribution": "Distribución",
    "Apply to all days": "Aplicar a todos los días",
    "Rotate through routines": "Rotar entre rutinas",
    "Restart the order every week": "Reiniciar el orden cada semana",
    "Preview": "Vista previa",
    "Choose routines": "Elegir rutinas",
    "Pick at least one routine to see how the days will be filled.": "Elige al menos una rutina para ver cómo se rellenarán los días.",
    "No training days — check the weekdays in step 1.": "No hay días de entrenamiento: revisa los días de la semana en el paso 1.",
    "First week": "Primera semana",
    "Second week": "Segunda semana",
    "…and {text} following the same pattern.": "…y {text} siguiendo el mismo patrón.",
    "Review & fine-tune": "Revisar y ajustar",
    "{text} without a routine.": "{text} sin rutina.",
    "Tap a day to add one.": "Toca un día para añadir una.",
    "Select empty days": "Seleccionar días vacíos",
    "Apply routine to selected": "Aplicar rutina a los seleccionados",
    "Clear selection": "Borrar selección",
    "Re-apply distribution": "Reaplicar distribución",
    "Tick the box on a day to select several, or tap a day to edit it. ✎ marks days changed by hand.": "Marca la casilla de un día para seleccionar varios, o toca un día para editarlo. ✎ indica los días cambiados a mano.",
    "Week of {date}": "Semana del {date}",
    "No training days. Go back to Basics and pick weekdays.": "No hay días de entrenamiento. Vuelve a Básicos y elige los días de la semana.",
    "Apply to {text}": "Aplicar a {text}",
    "Applied to {text}.": "Aplicado a {text}.",
    "{date}: {state}": "{date}: {state}",
    "no routine": "sin rutina",
    ", edited by hand": ", editado a mano",
    "View day": "Ver día",
    "Edit day": "Editar día",
    "Edited by hand": "Editado a mano",
    "No routine": "Sin rutina",
    "Select {date}": "Seleccionar {date}",
    "{text} were changed by hand. What should happen to them?": "{text} se cambiaron a mano. ¿Qué debe pasar con ellos?",
    "{text} was changed by hand. What should happen to it?": "{text} se cambió a mano. ¿Qué debe pasar con él?",
    "Keep my edits": "Conservar mis cambios",
    "Overwrite everything": "Sobrescribir todo",
    "Distribution re-applied.": "Distribución reaplicada.",
    "Re-applied to days you hadn't edited.": "Reaplicada a los días que no habías editado.",
    "Edited by hand ✎": "Editado a mano ✎",
    "Replace": "Reemplazar",
    "No routine on this day yet.": "Aún no hay ninguna rutina este día.",
    "+ Add routine": "+ Añadir rutina",
    "Replace {name}": "Reemplazar {name}",
    "Replace with…": "Reemplazar con…",
    "Add a routine": "Añadir una rutina",
    "You already have an ongoing plan": "Ya tienes un plan en curso",
    "Only one plan can be ongoing at a time, and <b>{name}</b> ({range}) is still running.": "Solo puede haber un plan en curso a la vez, y <b>{name}</b> ({range}) sigue activo.",
    "Stop it to save this new plan? Stopped plans can't be edited again.": "¿Detenerlo para guardar este nuevo plan? Los planes detenidos no se pueden volver a editar.",
    "Stop it and continue": "Detenerlo y continuar",
    "Plan updated.": "Plan actualizado.",
    "Plan saved.": "Plan guardado.",
    " (It has no upcoming days, so it isn't listed as ongoing.)": " (No tiene días futuros, por lo que no aparece como en curso.)",
    // ----- movements (library browser) -----
    "Library": "Biblioteca",
    "My actions": "Acciones propias",
    "Actions view": "Vista de ejercicios",
    "Movements": "Movimientos",
    "Reset": "Restablecer",
    "Search movements": "Buscar movimientos",
    "Enter a name": "Ingresa un nombre",
    "Body part": "Parte",
    "Type": "Tipo",
    "Difficulty": "Dificultad",
    "Beginner": "Principiante",
    "Intermediate": "Medio",
    "Advanced": "Avanzado",
    "Stretching": "Estiramiento",
    "Warm-up": "Calentamiento",
    "Strength": "Fuerza",
    "Part {n}": "Parte {n}",
    "Part": "Parte",
    "Attributes": "Atributos",
    "Equipment-based": "Con equipamiento",
    "Bodyweight-only": "Solo peso corporal",
    "Timer-based": "Por tiempo",
    "Repetition-based": "Por repeticiones",
    "Weight mode": "Modo de peso",
    "Action image": "Imagen de la acción",
    "Remove image": "Quitar imagen",
    "Enter a name.": "Introduce un nombre.",
    "Pick at least one body part.": "Elige al menos una parte del cuerpo.",
    "Uploading image…": "Subiendo imagen…",
    "Image upload failed ({msg}). You can still add the action without an image.": "Error al subir la imagen ({msg}). Aún puedes añadir la acción sin imagen.",
    "Type {n}": "Tipo {n}",
    "Level {n}": "Nivel {n}",
        "View summary of {name}": "Ver resumen de {name}",
        "The movement library is empty.": "La biblioteca de movimientos está vacía.",
        "No movements match your filters": "Ningún movimiento coincide con tus filtros",
    "Show more ({n} left)": "Mostrar más ({n} restantes)",
    // ----- courses (official course browser) -----
    "Programs view": "Vista de programas",
    "My programs": "Cursos propios",
    "Search courses": "Buscar cursos",
    "Topic": "Tema",
    "Filters": "Filtros",
    "Duration": "Duración",
    "Accessory": "Accesorio",
    "Fat loss": "Pérdida de grasa",
    "Conditioning": "Condición física",
    "Themed training": "Entren. temático",
    "Handles": "Manijas",
    "Ankle straps": "Correas para tobillos",
    "Barbell": "Barra de pesas",
    "Belt": "Cinturón",
    "Triceps rope": "Cuerda para tríceps",
    "Adjustable bench": "Banco ajustable",
    "Pull-up bar": "Soporte de dominadas",
    "{n} min": "{n} min",
    "Up to {n} min": "Hasta {n} min",
    "No courses match your filters": "Ningún curso coincide con tus filtros",
    "Exercises": "Ejercicios",
    "No exercises listed.": "Sin ejercicios listados.",
    "{sets} × {reps} reps": "{sets} × {reps} reps",
    // ----- program export / import / clone -----
    "Import": "Importar",
    "Export all": "Exportar todo",
    "Import programs file": "Archivo de programas a importar",
    "Clone": "Clonar",
    "Export": "Exportar",
    "Clone {name}": "Clonar {name}",
    "Export {name}": "Exportar {name}",
    "Exported {file}": "Exportado {file}",
    "Export failed: {msg}": "Error al exportar: {msg}",
    "Nothing to export.": "No hay nada que exportar.",
    "Clone program": "Clonar programa",
    "Name for the copy": "Nombre de la copia",
    "Create copy": "Crear copia",
    "A name is required.": "El nombre es obligatorio.",
    "A program with this name already exists.": "Ya existe un programa con este nombre.",
    "Cloned — {name}": "Clonado — {name}",
    "Clone failed: {msg}": "Error al clonar: {msg}",
    "copy": "copia",
    "Import programs": "Importar programas",
    "Could not read the file: {msg}": "No se pudo leer el archivo: {msg}",
    "Import failed: {msg}": "Error al importar: {msg}",
    "That file is not valid JSON.": "Ese archivo no es un JSON válido.",
    "That is not a MyInnoX1 program file.": "Ese no es un archivo de programas de MyInnoX1.",
    "This file was made by a newer version of MyInnoX1 (format {v}).": "Este archivo lo creó una versión más reciente de MyInnoX1 (formato {v}).",
    "The file contains no programs.": "El archivo no contiene programas.",
    "This entry is not a program.": "Esta entrada no es un programa.",
    "The program has no name.": "El programa no tiene nombre.",
    "The program has no exercises.": "El programa no tiene ejercicios.",
    "{list} is not a list of exercises.": "{list} no es una lista de ejercicios.",
    "Exercise {n} in {list} is not valid.": "El ejercicio {n} de {list} no es válido.",
    "Exercise {n} in {list} has an invalid {field}.": "El ejercicio {n} de {list} tiene un valor no válido en {field}.",
    "The file is not valid.": "El archivo no es válido.",
    "Select the programs to import. Names that already exist get a copy suffix.": "Selecciona los programas que quieres importar. Los nombres que ya existen reciben un sufijo de copia.",
    "Import {name}": "Importar {name}",
    "(no name)": "(sin nombre)",
    "Not in your action library, skipped: {text}": "No están en tu biblioteca de acciones y se omiten: {text}",
    "None of its exercises are in your action library.": "Ninguno de sus ejercicios está en tu biblioteca de acciones.",
    "Import selected ({n})": "Importar seleccionados ({n})",
    "{n} entries in the file cannot be imported.": "{n} entradas del archivo no se pueden importar.",
    "Importing…": "Importando…",
    "Importing {done} of {total}…": "Importando {done} de {total}…",
    "Imported": "Importado",
    "Imported {ok} of {total}": "Importados {ok} de {total}",
    "Warm up": "Calentamiento",
    "Stretch": "Estiramiento",
  };

  // Count nouns: [singular, plural] per language (one form for languages without plurals);
  // English falls back to w / w+"s".
  const NOUNS_ES = {
    "week": ["semana", "semanas"],
    "training day": ["día de entrenamiento", "días de entrenamiento"],
    "day": ["día", "días"],
    "more day": ["día más", "días más"],
    "routine": ["rutina", "rutinas"],
    "exercise": ["ejercicio", "ejercicios"],
    "movement": ["movimiento", "movimientos"],
    "course": ["curso", "cursos"],
  };
  const MONTHS_EN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const MONTHS_ES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

  // Per-language data: strings (English key -> text), nouns, months.
  const DATA = {
    en: { s: {}, nouns: {}, months: MONTHS_EN },
    es: { s: ES, nouns: NOUNS_ES, months: MONTHS_ES },
  };
  for (const code of Object.keys(PACKS)) if (SUPPORTED.includes(code)) DATA[code] = { s: {}, nouns: {}, months: MONTHS_EN, ...PACKS[code] };

  function detect() {
    try {
      const saved = localStorage.getItem(KEY);
      if (SUPPORTED.includes(saved)) return saved;
    } catch { /* storage unavailable */ }
    const nav = (navigator.language || "en").toLowerCase().split("-")[0];
    return SUPPORTED.includes(nav) ? nav : "en";
  }

  const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
  const I18N = {
    lang: detect(),
    es: ES,
    langs: LANGS,
    t(key, vars) {
      const d = DATA[I18N.lang].s;
      let s = has(d, key) ? d[key] : key;
      if (vars) s = s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m));
      return s;
    },
    plural(n, w) {
      const forms = DATA[I18N.lang].nouns[w];
      if (forms) {
        const one = I18N.lang === "fr" ? n < 2 : n === 1; // French: 0 is singular too
        const sep = DATA[I18N.lang].noSpace ? "" : " ";
        return `${n}${sep}${forms[one || forms.length === 1 ? 0 : 1]}`;
      }
      return `${n} ${w}${n === 1 ? "" : "s"}`;
    },
    months: () => DATA[I18N.lang].months,
    // "5 Jan" (day first, abbreviated month) or the language's own order, e.g. 1月5日.
    dayMonth(day, monthIdx) {
      const f = DATA[I18N.lang].dayMonth;
      return f ? f(day, monthIdx) : `${day} ${DATA[I18N.lang].months[monthIdx]}`;
    },
    // East Asian conventions: year before the date, weekday after it (10月30日(金)).
    yearFirst: () => ["ko", "zh", "ja"].includes(I18N.lang),
    weekdayAfter: () => ["zh", "ja"].includes(I18N.lang),
    onChange: [],
    setLang(l) {
      if (!SUPPORTED.includes(l) || l === I18N.lang) return;
      I18N.lang = l;
      try { localStorage.setItem(KEY, l); } catch { /* ignore */ }
      I18N.applyStatic();
      I18N.onChange.forEach((fn) => fn(l));
    },
  };

  // ----- static markup: collect once (before JS renders anything), re-apply on switch -----
  const ATTRS = ["placeholder", "aria-label", "title", "alt"];
  let statics = null;
  function collect() {
    statics = [];
    const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n = w.nextNode(); n; n = w.nextNode()) {
      if (n.parentNode.closest("script")) continue;
      const m = /^(\s*)([\s\S]*?)(\s*)$/.exec(n.nodeValue);
      if (m[2]) statics.push({ node: n, lead: m[1], trail: m[3], orig: m[2] });
    }
    document.querySelectorAll("*").forEach((el) => {
      for (const a of ATTRS) if (el.hasAttribute(a)) statics.push({ el, attr: a, orig: el.getAttribute(a) });
    });
    statics.title = document.title;
  }
  I18N.applyStatic = function () {
    if (!statics) collect();
    document.documentElement.lang = I18N.lang;
    document.title = I18N.t(statics.title);
    for (const s of statics) {
      if (s.node) { if (s.node.isConnected) s.node.nodeValue = s.lead + I18N.t(s.orig) + s.trail; }
      else if (s.el.isConnected) s.el.setAttribute(s.attr, I18N.t(s.orig));
    }
    syncMenu();
  };

  collect(); // before the dropdown adds its (native-name) options

  // ----- header language dropdown (button + listbox; names are native, never translated) -----
  const btn = document.getElementById("lang-btn");
  const list = document.getElementById("lang-list");
  function syncMenu() {
    const cur = LANGS.find((l) => l.code === I18N.lang);
    btn.querySelector(".lang-flag").textContent = cur.flag;
    btn.querySelector(".lang-code").textContent = cur.code.toUpperCase();
    list.querySelectorAll("[data-lang]").forEach((li) => {
      const on = li.dataset.lang === I18N.lang;
      li.setAttribute("aria-selected", String(on));
      if (on) list.setAttribute("aria-activedescendant", li.id);
    });
  }
  function setOpen(open, focusBtn) {
    list.hidden = !open;
    btn.setAttribute("aria-expanded", String(open));
    if (open) {
      const sel = list.querySelector('[aria-selected="true"]') || list.firstElementChild;
      setActive(sel);
      list.focus();
    } else if (focusBtn) btn.focus();
  }
  function moveActive(step) {
    const items = [...list.querySelectorAll("li")];
    const i = Math.max(0, items.findIndex((li) => li.classList.contains("active")));
    setActive(items[Math.min(items.length - 1, Math.max(0, i + step))]);
  }
  function setActive(next) {
    list.querySelectorAll("li").forEach((li) => li.classList.toggle("active", li === next));
    list.setAttribute("aria-activedescendant", next.id);
    next.scrollIntoView({ block: "nearest" });
  }
  function choose(li) { setOpen(false, true); I18N.setLang(li.dataset.lang); }
  for (const l of LANGS) {
    const li = document.createElement("li");
    li.id = "lang-opt-" + l.code;
    li.setAttribute("role", "option");
    li.dataset.lang = l.code;
    li.lang = l.code;
    li.innerHTML = '<span class="lang-flag" aria-hidden="true"></span><span class="lang-name"></span>';
    li.firstChild.textContent = l.flag;
    li.lastChild.textContent = l.name;
    li.addEventListener("click", () => choose(li));
    list.appendChild(li);
  }
  btn.addEventListener("click", () => setOpen(list.hidden));
  btn.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); setOpen(true); }
  });
  list.addEventListener("keydown", (e) => {
    if (e.key === "Escape" || e.key === "Tab") { setOpen(false, e.key === "Escape"); if (e.key === "Escape") e.preventDefault(); }
    else if (e.key === "ArrowDown") { e.preventDefault(); moveActive(1); }
    else if (e.key === "ArrowUp") { e.preventDefault(); moveActive(-1); }
    else if (e.key === "Home") { e.preventDefault(); moveActive(-LANGS.length); }
    else if (e.key === "End") { e.preventDefault(); moveActive(LANGS.length); }
    else if (e.key === "Enter" || e.key === " ") { e.preventDefault(); const a = list.querySelector("li.active"); if (a) choose(a); }
  });
  document.addEventListener("click", (e) => { if (!list.hidden && !e.target.closest("#lang-menu")) setOpen(false); });

  window.I18N = I18N;
  window.t = I18N.t;
  window.LANG = () => I18N.lang;

  I18N.applyStatic();
})();
