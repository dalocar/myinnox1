# Seasonal themes (FitMas `fit-xmas`, HallowFit `hallowfit`): QA test plan

Scope: Phase 5 of the seasonal themes (decoration layer: `theme-fx-core.js`, `theme-fx.js/css`, `theme-fx-xmas.js/css`, `theme-fx-halloween.js/css`).
Environment: `cd static && python3 -m http.server 8791`, `node qa/fixture-server.js` (:8799), chrome-devtools isolated context `stub`, init script = `qa/themes-stub-init.js` (dummy token, stubbed fetch). Note: any emulation change (`emulate`) or `reload` drops the init script, so re-navigate with it afterwards. Never real credentials or the real API.
Widths: 375, 320, 1280. Modes: Full (all), Subtle, Off (one pass). Helpers: `qa/seasonal-audit.js`, `qa/seasonal-contrast-scan.js`, `qa/seasonal-perf-probe.js` (evaluate_script `sourcePath`).
Screenshots: `qa/screens/seasonal-<theme>-<screen>-<width>.png`.

## 1. Real screens
| ID | Case | Pass criterion |
|---|---|---|
| R1 | Programs (Courses list, course modal, My programs, editor), Plans, Actions (cards with images, lightbox), History, Fitness, Profile at 375/320/1280, both themes Full | No decoration over text or controls that matters, no horizontal overflow (`scrollWidth - innerWidth == 0`) |
| R2 | Layout shift: compare ~80 element rects per screen Full vs Off (`seasonal-audit.js`) | 0 elements moved by > 0.6 px |
| R3 | Lite mode on real tab clicks: `xmas-lite` (Plans, Actions, History, Fitness, editor) / `hf-lite` (Plans, History, Fitness, editor); Courses, My programs list and Profile are not lite | Class toggles with the real tab buttons; snow canvas hidden in lite and back on leaving |
| R4 | Editor open/close toggles lite | `hf-lite`/`xmas-lite` on open, removed on "Back to list" |
| R5 | Overlay never blocks input: `elementFromPoint` at 15 points per screen, real clicks on tab buttons, modal Close, lightbox | 0 hits inside `#fx-root`, `.xmas-top`, `.xmas-snow`, `.hf*`; clicks work |
| R6 | Stacking: decorations below tab bar (40), modals (50+), lightbox (60), toast (80) | Modal/lightbox cover decorations; `elementFromPoint` on a decoration under a modal returns the modal |
| R7 | Subtle and Off passes | Subtle: art static, 0 running animations; Off: `#fx-root` display none, no canvas, no `.xmas-top`, DOM back to baseline |

## 2. Accessibility
| ID | Case | Pass criterion |
|---|---|---|
| A1 | Lighthouse a11y (snapshot) both themes | No new failures vs default theme |
| A2 | Computed contrast scan of all visible text per tab (`seasonal-contrast-scan.js`) | No failures except text on image gradients (mv-name) |
| A3 | `node scripts/check-theme-contrast.js` incl. state pairs (danger, ok, active tab, disabled, warn hover) | Exit 0; advisory warnings listed in the report |
| A4 | Keyboard: Tab order, focus ring visible (2px `--focus`), focused element topmost at its centre | Pass |
| A5 | Nothing focusable in `#fx-root`/`.xmas-top`; all decoration `aria-hidden` (incl. canvas) | 0 tabbable, 0 un-hidden SVGs |
| A6 | `forced-colors: active` | Overlay and all pseudo-element art hidden, canvas hidden |
| A7 | `prefers-reduced-motion: reduce` | Effective mode subtle, `document.getAnimations()` running = 0 on every tab, both themes |
| A8 | Colour-blind (deuteranopia matrix filter; protan uses the same red/green axis) | Error/ok/warn/info keep icon glyphs; selected states keep fill/check; nothing red-vs-green only |
| A9 | Photosensitivity | No animated luminance change > 3 per second (twinkle 2.3-3.1 s cycles, flicker steps >= 0.5 s apart, blink 2 per 1 s) |

## 3. Performance and robustness
| ID | Case | Pass criterion |
|---|---|---|
| P1 | LCP / CLS / TBT, mobile profile (375, 4x CPU, Fast 4G), fx Off vs Full per theme | CLS 0, TBT ~0, LCP within noise of Off |
| P2 | rAF frame time at 4x CPU, Full, data and non-data screen | p95 < 16.7 ms (or display interval), no frames > 33 ms |
| P3 | 20 + 20 rapid theme switches (default, fit-xmas, hallowfit) | nodes, canvases, `#fx-root` children, animations, timers, rAF loops, listeners equal baseline; 0 console errors |
| P4 | Cross-tab: change `innodigym_theme`/`innodigym_fx` in another tab | First tab applies theme, mode and picker without reload |
| P5 | Hidden tab | `html.fx-paused`, running animations 0, rAF loop stopped; resumes on visible |
| P6 | Data-saver | Unit-covered (`ThemeFxCore.effective`); `navigator.connection.saveData` cannot be set |
| P7 | Auto never seasonal | `ThemeCore.resolve("auto", dark|light)` is `dark|default`; unit test |
| P8 | Network: no 404 caused by our code | Page load with stub: 0 non-200 |

## 4. Static
| ID | Case | Pass criterion |
|---|---|---|
| S1 | `node --check` on changed JS, `node --test static/*.test.js` | exit 0, all pass |
| S2 | `--fx-*` tokens used by each theme's art are declared under that theme (`theme-fx-css.test.js`) | pass |
| S3 | No pseudo-element inside `:is()/:where()` in fx CSS | pass |
