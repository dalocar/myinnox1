# Fitness screen: implementation notes

## Built
- `static/fitness-core.js` (pure, UMD `FitnessCore`: SLOTS, FITNESS_TYPES, LEVELS, levelIndex, clampPercent, normalizeTests, segments, formatValue, radarPoints) + `static/fitness-core.test.js` (10 tests, incl. a check that the `--fit-*` tokens exist in all themes).
- `static/fitness.js` (`window.FitnessUI = {show, relang}`): DOM only; API text goes through `escapeHtml`.
- `app.js`: `loadFitness` removed; `switchTab("fitness")` calls `FitnessUI.show()`, `I18N.onChange` calls `FitnessUI.relang()` (labels only, data is language independent).
- `index.html`: `h2` "Fitness Level", container `#fitness-body`, two script tags. `style.css`: `.fit-*` block at the end. `themes.css`: tokens `--fit-on-badge`, `--fit-c/b/a/s` in all 5 blocks (contrast checked: badge letter >= 5:1, badge vs surface >= 4.9:1). `i18n.js`: ES strings.

## Data rules
- testType 3 = Upper-limb (kg, confirmed), 4 = Lower-limb (kg) and 2 = Endurance (reps), both inferred from the 2026-10-30 results (190 / 41, level S / S+) and unit plausibility; unknown testTypes render as generic "Test {n}" cards.
- Latest test per type wins (testTime, then testId). Segments: known letter -> ladder position (C=1, B=2, A=3, S=4, S+=5 of 5); unknown letter -> ceil(percent/20); untested -> 0. Percent clamped to 0..100 (NaN/null -> 0). Radar radius = percent/100 with a 4% floor.
- No "Next: X" hint: the level ladder is not confirmed.

## DOM for QA
`#tab-fitness > h2 + #fitness-body` containing `.fit-radar-wrap > svg.fit-radar[role=img]` (`.fit-ring`, `.fit-axis`, `.fit-poly`, `.fit-dot`, `.fit-axis-label`) and `ul.fit-cards > li.fit-card[data-key=upper|lower|endurance|type-N][data-tier]` with `.fit-name`, `.fit-date`, `.fit-bar[role=progressbar] > .fit-seg(.on)`, `.fit-value strong/small`, `svg.fit-badge[data-tier]` (`.is-off` when untested). States: `.server-error` + `#fit-retry`, `.empty-state.fit-empty`, "Loading…" paragraph.

## How to test
- `node --check static/*.js && node --test static/*.test.js` (53 pass).
- Visual: `node qa/fixture-server.js` (port 8799) + `python3 -m http.server 8790 --directory static`; load the page with `qa/fitness-stub-init.js` as init script, then `showLoggedIn("a@b.c"); switchTab("fitness")`. Variant via hash: `#last` (real payload), `#empty`, `#multi` (levels A/B/Z, extra types 5 and 9, duplicate type 3), `#error`. Fixtures: `qa/fixtures/fitness-last*.json`. Screenshots: `qa/screens/fitness-*.png` (375 and 1280; ES + empty at 375). No horizontal overflow seen at 375/1280.

## Known gaps
- Ladder C, B, A, S, S+ (C, S, S+ observed; B, A assumed). Types 2 and 4 mapping is inferred, confirm against the official app.
- Radar polygon is tiny with the real data (9 % of one axis), as in the official app.
- Only the Default theme was checked visually; other themes rely on token contrast numbers. 320/768 px, error state and reduced-motion were not screenshotted.
- No submit-a-test, no history chart.
