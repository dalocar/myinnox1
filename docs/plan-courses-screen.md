# Plan: "Courses" screen (browse / search official courses)

Same adaptation as the Movements screen ([plan-movements-screen.md](plan-movements-screen.md)), now for **courses**. Reference: official-app recording `~/Downloads/WhatsApp Video 2026-10-28 at 22.18.55.mp4` (tab "Curso" / "Cursos propios").

## Official screen (observed)
- Two sub-tabs: **Curso** (official courses) and **Cursos propios** (your own templates, with a ⋮ menu and a + button).
- Search box ("Ingresa un nombre").
- Row of quick topic chips (**Tema**): Pérdida de grasa, Estiramiento, Fuerza, Condición física, Entren. temático.
- Filter button (with active-count badge) opening a sheet: **Dificultad** (Principiante/Medio/Avanzado), **Duración** (10/20/30/40 min), **Accesorio** (Manijas, Correas para tobillos, Barra de pesas, Cinturón, Cuerda para tríceps, Banco ajustable, Banda de resistencia, Peso corporal, Soporte de dominadas), **Tema**; buttons Restablecer / Confirmar.
- Wide cards: course image, title, pills with duration and difficulty. Empty state illustration.

## Our version
Where: the **Programs tab** gets the same segmented control as the Actions tab: **Courses | My programs** (default Courses; "My programs" = the existing custom programs list/editor, untouched).

Data (confirmed with the real API, `GET /course/list`, 75 courses; fixture `qa/fixtures/course-list-real.json`):
- `level` 1/2/3 = Beginner / Intermediate / Advanced (25 / 37 / 13).
- `courseType` 1..5 = topic: 1 Fat loss (20), 2 Stretching (3), 3 Strength (30), 4 Conditioning (4), 5 Themed training (18). Mapping inferred from course names; Spanish names from the official app (Pérdida de grasa, Estiramiento, Fuerza, Condición física, Entren. temático).
- `duration` minutes (10..60).
- `partsList` = accessory ids (strings). Inferred from action `reqPartList`: 1 Handles (Manijas), 2 Ankle straps (Correas para tobillos), 3 Barbell (Barra de pesas), 4 Belt (Cinturón), 5 Triceps rope (Cuerda para tríceps), 6 Adjustable bench (Banco ajustable), 14 Pull-up bar (Soporte de dominadas). Unconfirmed: 8 (foam roller?), 13, 16 (resistance band? body weight?) -> show only ids that have a confirmed label; hide the unknown ones (do not invent labels). `muscleParts`/`tags` are not in the list payload.
- No HOT/featured field.
- `actionNum`, `capacity` are null in the list; `GET /course/detail?id=` has `description`, `mainStepList` (exercises with pic/video), `warmUpStepList`, `relaxStepList`.

Behaviour:
1. Search by name (accent-insensitive, reuse `MovementsCore.normalize`).
2. Topic chips row (single or multi select, same chip style) + a "Filters" button with a count badge opening a compact panel with Difficulty, Duration (up to 10/20/30/40 min, single select; document the assumption) and Accessory (multi, OR within the group). Filters AND across groups. Reset. Because filters apply instantly (as in Movements) no Confirm button.
3. Card list/grid: course image (`smallImg`), name, pills "N min" and difficulty. Count line with correct plural ("1 course / 5 courses", "1 curso / 5 cursos"). Show more paging if > 60.
4. Click a card -> read-only detail modal (reuse the lightbox/modal infrastructure): big image, name, pills, description, list of exercises from `mainStepList` (thumbnail, name, reps/sets) fetched lazily from `/course/detail`. No write actions in v1.
5. States: loading, error + Retry, empty + Reset.
6. i18n: all strings via `t()` + Spanish in `i18n.js`; language switch clears the course cache and refetches with `languageId`; filters/search survive the switch.
7. Style: same tokens/chips/cards as Movements and Programs; mobile 2 columns -> 1 column cards under 480 px; chips 44 px under coarse pointer; no overflow at 320 px.
8. Files: `static/courses-core.js` (+ `courses-core.test.js`, pure logic: filter, facets, label maps, duration buckets), `static/courses.js` (DOM), markup in `index.html`, CSS, hooks in `app.js` (`switchTab("programs")`, `I18N.onChange`), README bullet.

Out of scope: adding a course to a plan/program from this screen, favorites (`course/collect`), recommended list.

## Acceptance
Search/filters/reset/paging correct with the real fixture; detail modal loads exercises; ES/EN complete; no regressions in Programs editor (My programs), picker, Plans, Movements; unit tests pass (`node --test static/*.test.js`).
