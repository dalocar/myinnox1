# Plan: "Movements" screen (browse / search the exercise library)

Reference: screen recording of the official app's **Movimientos** tab (`~/Downloads/WhatsApp Video 2026-10-28 at 22.26.13.mp4`, 26 s, phone).

## What the official screen does (observed)

- Header with two sub-tabs: **Movimientos** (full library, default) and **Acciones propias** (your custom actions).
- Search box ("Ingresa un nombre"), live filtering while typing; results update per keystroke.
- Three dropdown filters on one row, each opens a sheet with chips + **Restablecer** (reset) / **Confirmar**:
  - **Dificultad**: Principiante / Medio / Avanzado (single choice; shows "Dificultad: 1" when active).
  - **Tipo**: Estiramiento / Fuerza / Calentamiento (stretch / strength / warm-up).
  - **Parte**: body part (chest, shoulder, back, arm, hips, legs, abdomen, full-body).
- 2-column grid of portrait cards: image fills the card, name overlaid bottom-left over a dark gradient, optional **HOT** ribbon top-right.
- Empty-image placeholder (dumbbell glyph) for actions without a picture (custom ones).
- Empty state illustration when search has no results.
- (Tap on a card opens the movement detail with video; not shown in the recording.)

## Our version

New top-level tab **Movements** (between Programs/Plans and Actions; icon: magnifier or grid). It replaces nothing: the existing **Actions** tab (custom actions CRUD) stays, and the picker modal in the Programs editor is untouched.

### Behaviour
1. Data: `GET /action/list` (already cached via `getActionLibrary()` in `app.js`; it is invalidated on language change). No new endpoints.
2. Search: debounced (150 ms) case/diacritic-insensitive substring on `name` (Spanish: "pecho" must match "Pecho"; "biceps" must match "bíceps").
3. Filters (combinable, AND semantics between filters):
   - **Body part**: reuse `MUSCLE_GROUPS` (`muscleParts` is a comma list of ids; multi-select = OR within the filter, as in the picker today).
   - **Type**: from `actionType` (known value: `3` = custom; the other values must be discovered, see Discovery).
   - **Difficulty**: only if the action payload carries a difficulty/level field (see Discovery). If it does not, hide that filter rather than fake it.
   - A **Reset** link clears search + filters; an active-filter count badge.
4. Results: responsive card grid (2 columns on phone, 3-5 on desktop), lazy images, count line ("123 movements"), page in chunks of 60 with a "Show more" button (the library is ~270 items; avoid rendering all images at once).
5. Card click opens the existing lightbox (`openLightbox(picUrl, videoUrl, name)`); add a small "Add to program" action only if cheap (out of scope for v1, mention as follow-up).
6. States: loading skeleton/"Loading…", error with Retry, empty ("No movements match your filters" + Reset button), image-missing placeholder.
7. i18n: every string through `t()` with Spanish added to `ES` in `i18n.js`; muscle chips already have `es` labels. Language switch must re-render the screen and reload data (hook into `I18N.onChange` in `app.js`, same pattern as the other tabs).
8. a11y: filters are buttons with `aria-pressed`, grid is a list of buttons with accessible names, search has a label, focus visible, `prefers-reduced-motion` respected.

### Visual style (match the rest of the app, not the dark official look)
- Reuse tokens in `style.css` (`--surface`, `--border`, `--primary`, `--radius`, chips `.chip`, `.empty-state`, `.row-between`, tab icons style in `nav#tabs`).
- Search input = existing text input style with a leading magnifier; filter row = existing `.chip` buttons (wrap on phone).
- Card: reuse the image-overlay idea from the official app but with our palette: 3:4 image, name over a bottom gradient, rounded `--radius`, hover lift as in `.cover-option`.
- Mobile (< 720 px): bottom tab bar already exists; 6 tabs today, adding a 7th overflows. Decision: **replace the icon of nothing, merge**: put Movements inside the existing **Actions** tab as a segmented control (`Library | My actions`) exactly like the official sub-tabs, instead of a new tab. Net: no tab-bar change, and the official app's structure is mirrored.

### Files
- `static/movements-core.js` (new, pure, unit-testable, no DOM): `normalize(str)`, `filterMovements(list, {query, parts, types, levels})`, `facetsFrom(list)` (which filter options actually exist in the data), `paginate`.
- `static/movements-core.test.js` (new): node tests, same style as `planner-core.test.js`.
- `static/movements.js` (new): DOM + wiring; exposes `MovementsUI.show()` / `MovementsUI.relang()`.
- `static/index.html`: segmented control + panel markup inside `#tab-actions`; script tags.
- `static/app.js`: `switchTab("actions")` calls `MovementsUI.show()`; `I18N.onChange` hook calls `MovementsUI.relang()`.
- `static/style.css`: grid, card, skeleton, segmented control (reuse `.pl-seg` if possible).
- `static/i18n.js`: new strings.
- `README.md`: one bullet under Features.

### Discovery (first task for the implementer)
The action-list payload fields beyond `id, name, picUrl, videoUrl, muscleParts, muscleGroups, actionType, countType, custom, sideWeight` are unknown. Before building filters, fetch `/action/list` once (credentials: `INNODIGYM_ENV_FILE`, see `scripts/innodigym_api.py`; or ask the user to paste a response) and record in this file: the distinct values of `actionType`, whether a difficulty/level or "hot" flag exists, and how `muscleParts` map. Build only the filters the data supports. Update the "Type"/"Difficulty" decisions above accordingly.

### Out of scope (v1)
Add-to-program from this screen, favorites, sorting options, editing library items.

### Acceptance criteria
- Typing in search filters live, accent-insensitive, in both languages.
- Filters combine; Reset restores the full list; counts are correct.
- No console errors; no horizontal scroll at 375 px; keyboard operable end to end.
- Switching language re-renders and reloads names in the new language without leaving the screen.
- Existing screens (Programs editor picker, custom Actions CRUD, Plans) behave exactly as before.
- Unit tests for the core module pass with `node static/movements-core.test.js`.

## Discovery result
Real `/action/list` captured in `qa/fixtures/action-list-real.json` (268 library actions, all `custom` false):
- `level` 1/2/3 = difficulty: Beginner 130 / Intermediate 102 / Advanced 36 (Principiante / Medio / Avanzado). Read directly.
- `actionType` 1 = Stretching (41, Estiramiento), 2 = Warm-up (40, Calentamiento), 3 = Strength (187, Fuerza).
- `muscleParts` ids 1-8 as in `MUSCLE_GROUPS` (counts 28/60/46/72/69/62/52/18).
- No hot/featured field exists, so no HOT ribbon. All three filters are enabled by the data. Custom actions (`custom` truthy) are excluded from the Library view.
