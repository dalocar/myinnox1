# Plan: "Fitness" screen redesign (gamified "Fitness Level")

Reference: official app screen **Fitness Level** (`~/Downloads/WhatsApp Image 2026-10-29 at 00.26.09.jpeg`).

## Today
`loadFitness()` (`static/app.js`) calls `GET /physicalFitnessTest/last` and dumps each row as `JSON.stringify` inside a `.record-card`. Markup: `#tab-fitness` > `h2` + `#fitness-list` in `index.html`.

## Real data (probed read-only 2026-10-29, bearer)
`data: [{testId:348, testTime:"2026-10-28", testType:3, resultValue:54.7, resultLevel:"C", resultLevelPercent:9.12}]`
- `testType 3` = **Upper-limb strength** (value in kg) — confirmed by the screenshot (54.7 kg, level C).
- Lower-limb strength (kg) and Endurance (reps) type ids are **unknown** (the account only has type 3). Do NOT guess ids. Keep a `FITNESS_TYPES` table `{3: upper}` with the other two slots keyed as "not tested yet"; any unknown `testType` that does show up is rendered as a generic card ("Test {n}", raw value, no unit) so nothing is hidden. Document this as a known gap.
- Level letters seen: only "C". Full ladder unknown. Use an ordered list `["C","B","A","S"]` extended defensively: unknown letter -> badge shows the letter, segments fall back to `resultLevelPercent`.

## What the official screen does
1. Title "Fitness Level", back arrow.
2. **Radar (triangle)** with 3 axes: Upper-limb strength (top), Endurance (bottom-left), Lower-limb strength (bottom-right); dashed concentric guide triangles, filled green polygon showing the 3 scores (tiny here because scores are low).
3. Three **cards**, one per ability: name, last test date (grey, only if tested), big green value + small unit (`54.7 kg`, `0.0 kg`, `0 Reps`), a **5-segment progress bar** (first segment filled blue at level C), and a winged **rank badge** with the level letter on the right.
4. Untested abilities still show a card with `0.0` and the lowest level.

## Our version
Keep the existing **Fitness** tab; replace the body of `#tab-fitness`. Same API, no new endpoints. Theme tokens only (no hex literals in `style.css`: a test enforces it), so it works in all 5 themes + Auto; the official app's dark look is NOT copied, its structure/gamification is.

### Layout
- `h2` "Fitness Level" (i18n key `Fitness Tests` stays for the tab title; add `Fitness Level`).
- `.fit-radar`: inline SVG triangle, 3 labelled axes, 4 dashed guide rings, polygon filled with `--accent`/`--primary` at low opacity, dots on vertices, `role="img"` + `aria-label` summarising the three scores (also a visually-hidden text list). Radius per axis = `resultLevelPercent/100` (0 when untested), min visible radius so the polygon never vanishes.
- 3 `.fit-card` in fixed order Upper / Lower / Endurance: left = name, date, 5-segment bar (`role="progressbar"` with aria-valuenow/text "Level C, 1 of 5"); right = value+unit (big, `--accent`-ish token with sufficient contrast per theme; add tokens if needed to `themes.css` for ALL themes) and the **badge**.
- **Badge**: inline SVG (hex/shield with wings, letter in the centre), colour per tier (C slate/blue, B green, A gold, S purple) via CSS custom properties; letter is text, not colour-only.
- Gamification touches (CSS only, respect `prefers-reduced-motion`): bar segments fill with a short stagger on first render, badge pops in, radar polygon scales in. "Next level" hint under the bar when computable (e.g. "Next: B") — only if the ladder is known; otherwise omit.
- Responsive: single column <720 px (like the phone screenshot), cards in a 3-column row >=960 px with radar above; no horizontal scroll at 320 px.
- States: loading, error (+Retry button), empty (no tests at all -> the three cards at 0 with "Not tested yet" and a short explanation that tests are taken on the machine), partial.
- Language switch re-renders (hook `I18N.onChange` like other tabs); dates formatted via existing helpers if any, else `YYYY-MM-DD` as the API gives it.

### Code structure (match courses/movements pattern)
- `static/fitness-core.js` (pure, UMD like `courses-core.js`): `FITNESS_TYPES`, `normalizeTests(rows)` -> 3 ordered slots + extras, `levelIndex(letter)`, `segments(level, percent)`, `radarPoints(slots, size)`, `formatValue(slot)`. 
- `static/fitness-core.test.js` (`node --test`): known type 3, untested slots, unknown testType kept as extra, unknown level letter fallback, percent clamping (<0, >100, NaN/null), radar geometry, value formatting (54.7, 0.0, 0).
- `static/fitness.js`: DOM rendering (all values escaped with `escapeHtml`), no `innerHTML` of raw API strings.
- `index.html`: script tags, container; `style.css`: new `.fit-*` block at the end; `i18n.js`: ES strings ("Fitness Level", "Upper-limb strength" = "Fuerza de tren superior", "Lower-limb strength" = "Fuerza de tren inferior", "Endurance" = "Resistencia", "Reps" = "Reps", "Not tested yet" = "Sin probar aún", "Level {l}", ...). Keep the key-coverage scan green.
- Update `README.md` Fitness bullet; write `docs/fitness-impl-notes.md`.

## Acceptance criteria
1. Real payload (type 3, 54.7 kg, C, 9.12 %) renders upper card with 54.7 kg, date 2026-10-28, badge C, first bar segment filled; other two cards show 0.0 kg / 0 Reps, "Not tested yet".
2. Radar shows 3 labelled axes + polygon proportional to percents.
3. No raw JSON anywhere. No hex/rgba literals in `style.css` declarations; all 5 themes legible (contrast >= 4.5:1 for text, 3:1 for graphics).
4. ES translation complete; language switch re-renders.
5. a11y: roles/labels above, keyboard/focus unaffected, reduced-motion disables animations, letter text on badge.
6. 320/375/768/1280 px: no horizontal overflow.
7. `node --check static/*.js && node --test static/*.test.js` green.
8. Error/empty/loading states reachable and correct; XSS-safe.

## Out of scope
Submitting a new test (`POST /physicalFitnessTest`), history chart (`listByType` returns the same single row today), guessing unknown type ids.
