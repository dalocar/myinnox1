# Themes + logo: QA test plan

Source: docs/plan-themes.md (sections 3, 5, 7, 8b). Themes under test: `default` (Teal Classic), `dark` (Midnight), `ember` (Brasa), `tide` (Marea), `graphite` (Grafito), plus pref `auto`.
Environment: http://localhost:8788, chrome-devtools isolated context "stub" (dummy token in localStorage, `window.fetch` stubbed from qa/fixtures; other endpoints return empty OK). No real login.
Widths: 1280 (desktop), 375 and 320 (mobile), 414 for tab bar only.
Screenshot naming: `qa/screens/themes-<theme>-<screen>-<width>.png`.

## 0. Static / unit gates (run first)
| ID | Case | Pass criterion |
|---|---|---|
| S1 | `node --check static/*.js` | exit 0 for every file incl. new theme.js |
| S2 | `node --test static/*.test.js` | all pass (no regression) |
| S3 | Literal grep `grep -nE '#[0-9a-f]{3,8}\b\|rgba?\(' static/style.css` | only `--media-*` constants in shared :root |
| S4 | themes.css has 5 blocks; every token of plan 2.1 present in each; values equal plan table | diff-free (script parse) |
| S5 | `:root` colour block removed from style.css, no second :root for --warn* | one shared :root only |
| S6 | themes.css linked before style.css; boot script inline, first in head, before stylesheet links, after meta theme-color | order check |
| S7 | `<meta name="color-scheme" content="light dark">` present | present |
| S8 | Console clean (no errors/warnings, no 404 for new assets: themes.css, theme.js, favicon) on each theme | 0 errors |

## 1. Boot, persistence, no flash
| ID | Case | Pass criterion |
|---|---|---|
| B1 | Empty storage, OS light | `html[data-theme=default]`, look identical to pre-feature default (except accepted refinements) |
| B2 | Empty storage, OS dark (emulate) | resolves to `dark` |
| B3 | Store each of 5 ids + `auto`, reload | `data-theme` correct; `Theme.get()` returns pref |
| B4 | Invalid stored value (`"foo"`, `""`, `"DARK"`) | falls back safely (default or auto), no JS error, picker shows a sane selection |
| B5 | localStorage throws (override getItem to throw before load / Storage blocked) | page renders default, no uncaught error |
| B6 | No flash: add a MutationObserver/PerformanceObserver via `evaluateOnNewDocument`-style init (or record `getComputedStyle(documentElement).backgroundColor` at DOMContentLoaded and first `requestAnimationFrame`, plus screenshot sequence with CPU throttle 6x and slow-3G on CSS) | background at first paint = chosen theme `--bg`, never default for dark; `data-theme` already set when `<head>` finishes parsing |
| B7 | `html.style.colorScheme` set by boot script = dark only for dark | check per theme |
| B8 | `meta[name=theme-color]` content per theme | default #f4f6fb, dark #0e1523, ember #faf4ec, tide #eef3fa, graphite #ececee; also after runtime switch and after Auto OS flip |
| B9 | computed `color-scheme` on html per theme | dark => dark, others light |
| B10 | `--meta-theme-color` var defined per theme and equals meta content | equal |
| B11 | localStorage key is exactly `innodigym_theme`; no other keys written on switch; no network request on switch (list_network_requests before/after) | pass |
| B12 | Logout / clear token does not reset theme | theme kept |

## 2. Auto and live OS switch
| ID | Case | Pass criterion |
|---|---|---|
| A1 | pref=auto, emulate prefers-color-scheme light then dark (emulate tool) without reload | `data-theme` flips default<->dark live, meta + color-scheme follow, picker still shows Auto |
| A2 | pref=explicit (ember), flip OS | no change |
| A3 | Switch from explicit to Auto while OS dark | immediately dark |
| A4 | Two pages same origin: change theme in page A | page B follows through `storage` event (open second stub page) |
| A5 | Theme change with modal open (action picker, course modal, lightbox) and visible toast | all update live, no reload |
| A6 | Reduced motion emulation: no transition on switch; normal: no transition on load | pass |

## 3. Screen x theme matrix
Each cell: screenshot at 1280 and 375 (320 for login, Profile, tab bar, Plans), check no unthemed element (white/teal remnants), no text-on-bg unreadable, borders visible, hover/focus where listed.
Themes: default, dark, ember, tide, graphite.

| ID | Screen | Specific checks |
|---|---|---|
| L | Login | card, inputs (rest/hover/focus), placeholder legible, primary button + hover, error text (`.error`) with non-colour cue, lede text, logo hero two-tone (figure=primary, machine=text, cuts=surface), autofill state (dark: no dark-on-dark / white flash), body glows |
| H | Header | brand mark tile gradient per theme, glyph colour (`--brand-fg`), subtitle "Unofficial client" contrast, logo recognisable at ~40 px and 27 px |
| P1 | Programs list | cards, hover shadow, cover thumb, cover badge (white on dark scrim), empty state |
| P2 | Programs editor table | headers, row hover, inline number inputs rest/hover/focus, drag handle, drop-before/after lines, reorder buttons disabled, cover modal selected ring |
| P3 | Row menu | open menu, shadow, items hover, danger item colour/contrast, focus ring on items |
| C1 | Courses list | segmented control (pressed/unpressed), topic chips, filter panel, badge, card hover, skeleton |
| C2 | Course detail modal (course 41) | hero, steps, placeholder icons (`--border-strong` glyph legibility in dark), scrim, close focus |
| M | Movements | search icon + input, filter chips, count text, photo grid + caption fade, empty state, load more secondary button, skeleton |
| W1-3 | Plans wizard steps 1/2/3 | stepper active/inactive/num, covers selected ring, chips pressed, routine rows, drag states, official vs normal chip, calendar day selected/empty(warn)/hover, notes info + warn (icon cue), footer |
| X | History / Actions / Fitness | list cards |
| PR | Profile | picker + form: fields, disabled inputs, date input (icon + popup), select (popup) |
| MD | Modals | action picker (search, chips, rows hover), lightbox (scrim strength, image NOT filtered), backdrop |
| T | Toast | ok and error variants, fg/bg contrast, error has icon/text cue, switch theme while visible |
| TB | Mobile tab bar at 320/375/414 | translucent bar over scrolled content, active pill, labels not clipped, safe-area, icon currentColor |

## 4. Profile picker
| ID | Case | Pass criterion |
|---|---|---|
| PK1 | Structure | `fieldset#theme-picker` with legend, above `#profile-form`, not inside the form; 6 native `input[type=radio][name=theme]`; radiogroup with aria-label |
| PK2 | Checked radio matches `Theme.get()` on entering Profile and after reload | pass |
| PK3 | Click each card | applies instantly, persisted, no Save needed, no network, aria-live text "Theme: X" |
| PK4 | Keyboard: Tab enters group once (single tab stop), Arrow keys move+select, Space selects, Shift+Tab leaves | native radio semantics |
| PK5 | Focus visible on card (outline >= 3:1 in every theme), not clipped | pass |
| PK6 | Checked state visible without colour alone (check mark / 2px outline) | pass |
| PK7 | Mini previews render each theme's own tokens; Auto = split default/dark | pass |
| PK8 | Layout: 2 columns at 320, targets >= 44 px height, no overflow/horizontal scroll | measure |
| PK9 | Accessible names (snapshot a11y tree): each radio named by theme name + desc | pass |
| PK10 | Picker visible when profile form fails/offline | pass |

## 5. i18n
| ID | Case | Pass criterion |
|---|---|---|
| I1 | EN: all picker strings per plan 5.5, no raw `{name}` or `{placeholder}` anywhere | grep DOM text and aria-live |
| I2 | ES: Tema, Se guarda solo en este dispositivo., Automático, Sigue el ajuste de tu dispositivo, Teal clásico, Medianoche, Brasa, Marea, Grafito, descriptions; `Tema: {name}` resolved | pass |
| I3 | ES at 320 px: names/descriptions not truncated, no overflow | pass |
| I4 | Language switch while Profile open re-labels picker | pass |
| I5 | Every `t()` key used by theme code exists in i18n.js EN and ES | script check |

## 6. Logo and favicon
| ID | Case | Pass criterion |
|---|---|---|
| G1 | Dumbbell removed from header `.brand-mark` and login; logo SVG inline, `aria-hidden` | pass |
| G2 | Glyph colour = `--brand-fg` per theme (white / dark ink in dark) | computed style |
| G3 | Legible at header size (screenshot zoom) and at 27 px; login two-tone hero ~96 px | visual |
| G4 | Favicon `<link rel=icon>` resolves 200, valid SVG/PNG, apple-touch-icon if added | network check |
| G5 | Logo on each theme tile gradient incl. lime/gold/cyan end | visual |
| G6 | `DUMBBELL` placeholder in courses/movements unchanged | pass |

## 7. Native controls, states, focus
| ID | Case | Pass criterion |
|---|---|---|
| N1 | `input[type=date]` indicator and popup match scheme (dark theme: light icon) | screenshot |
| N2 | `<select>` popup/arrow, scrollbars (modal list, page), caret, selection | dark scheme in dark |
| N3 | Autofill (`:-webkit-autofill`) styling rule exists or default OK in dark | check CSS |
| F1 | Focus ring (`:focus-visible` outline 2px var(--focus)) on button, secondary, chip, tab, card, row-menu item, input, radio card, seg button | outline color == --focus, contrast >= 3:1 against adjacent bg, not clipped by overflow:hidden |
| F2 | Graphite focus is blue, visible on black buttons | pass |
| D1 | Hover/active/disabled for buttons, chips, cards, tabs, reorder buttons | distinguishable, disabled looks disabled |
| D2 | `forced-colors: active` emulation | text, borders, focus visible |

## 8. Contrast spot checks (measured in live DOM)
In-page script: for selector list, take `getComputedStyle` color + effective background (walk ancestors, composite rgba over page bg), compute WCAG ratio. Per theme and per Auto-resolved theme:
- body text on bg; text on surface (card/modal); text-2 on surface; muted on surface and on bg (header subtitle); muted on surface-2 (empty state)
- input placeholder on input bg (>= 4.5); input border vs surface and vs bg (>= 3)
- primary button label on primary (and hover); active chip; segmented pressed; cs-badge; stepper num
- primary as text on surface/primary-soft (active tab pill, .pl-note, pl-item-chip)
- danger text on danger-soft (.server-error / .error), row-menu danger item, toast.err
- ok, warn on warn-soft, warn-text on warn-soft (.pl-note.warn)
- official chip fg/bg; toast fg/bg; tab bar text on composited bar
- focus colour vs surface/bg (>= 3)
- compare measured values with plan 3.2 table (tolerance 0.05); flag any pair below threshold or divergence from table.

## 9. Colour-blind and non-colour cues
| ID | Case | Pass criterion |
|---|---|---|
| CB1 | Emulate protanopia, deuteranopia, tritanopia, achromatopsia on ember (primary check) and default/tide/dark spot check, screenshots of Plans step 3 with notes, login error, toast err | primary button vs warn note vs danger error distinguishable by structure |
| CB2 | `.pl-note`, `.pl-note.warn`, `.server-error`, `.error`, toast err carry an icon or text prefix (not hue only) | present |
| CB3 | Selected states (chip pressed, picker checked, calendar day selected) distinguishable in achromatopsia | pass |

## 10. Images in dark
| ID | Case | Pass criterion |
|---|---|---|
| IM1 | Content images (cards, movement thumbs, cs-hero, steps, cover) computed `filter` = brightness(.9) in dark, none elsewhere | computed style |
| IM2 | Lightbox image filter none | pass |
| IM3 | 1px border on image tiles in dark; glare check with white-bg PNG screenshot | visual |
| IM4 | Broken-image alt text colour readable | pass |

## 11. Regression
| ID | Case |
|---|---|
| R1 | Default theme pixel diff vs pre-feature screenshots in qa/screens (courses/movements screenshots from earlier QA) for login, programs, courses, movements, plans at 375/1280; only accepted refinements differ (placeholder, input border, muted, error text) |
| R2 | Tab navigation, language toggle, modals open/close, drag and drop, wizard steps, filters, search, load more all function (no JS errors) under each theme |
| R3 | No horizontal scroll at 320 in any theme |
| R4 | Existing unit tests pass; no new console errors/network failures |

## Execution notes
- Switch theme in tests via `localStorage.innodigym_theme` + reload (boot path) and via `Theme.set` / picker (runtime path); cover both.
- Contrast helper and fetch stub live in qa/ (themes-helpers.js) to avoid touching static/.
- Bugs: severity Blocker (unusable/unreadable), Major (clear defect), Minor, Nit.
