# Movements screen - QA test plan

Scope: Library | My actions segmented control inside the Actions tab (see docs/plan-movements-screen.md).
Fixtures (qa/fixtures/): `action-list.json` (40 items, Spanish names, default), `action-list.en.json` (same 40, English), `action-list.large.json` (280 items, for pagination).
Fixture design: ids 500-539; muscleParts 1-8 covered; actionType values 1 (stretch), 2 (warm-up), 3 (strength/custom); countType 1/2; items 536 and 538 have null picUrl/videoUrl (placeholder); 538 and 539 are `custom:true`; 538 name and 539 contain HTML/quote chars (`<b>&"x"</b>`) for XSS/escaping; 539 is a very long name; accents in ES names (bíceps, tríceps, tirón, cadera, ángel, móvil...).
Fetch mocking: browser tests set localStorage `innodigym_token`/`innodigym_email`, override `window.fetch` so `/api/action/list*` returns the fixture (chosen by `languageId` query: 1/en vs es), everything else returns `{code:200,success:true,data:[]}`.

Conventions: ES = Spanish UI, EN = English UI. Expected counts refer to the 40-item fixture.

## A. Entry and navigation
| ID | Steps | Expected |
|---|---|---|
| A1 | Log in (dummy token), click Actions tab | Segmented control visible with "Library" selected by default (or per implementation notes); library loads; no console errors |
| A2 | Click "My actions" | Existing custom actions panel (list, refresh, add form) shown; library panel hidden |
| A3 | Switch Library -> My actions -> Library | Library state (query/filters) preserved or cleanly reset (document which); no duplicate listeners (typing once gives one render) |
| A4 | Switch to Programs/Plans/History and back to Actions | Screen re-shows without error, no double-loading spinner stuck |
| A5 | Tab bar at 375px | Same number of tabs as before (no new tab), no overflow regression |

## B. Search
| ID | Steps | Expected |
|---|---|---|
| B1 | ES: type `pecho` | Matches "Estiramiento de pecho" (1) |
| B2 | ES: type `biceps` (no accent) | Matches "Curl de bíceps con barra" |
| B3 | ES: type `BÍCEPS` (upper+accent) | Same result as B2 |
| B4 | ES: type `triceps`, `tricep`, `ep` | tríceps item; substring semantics |
| B5 | EN: type `press` | Incline Bench Press, Flat Bench Press, Overhead Press, Leg Press, Hip... (all containing "press") count matches manual grep of fixture |
| B6 | EN: `PUSH` | "Push-up" and "Triceps Pushdown" |
| B7 | Query with leading/trailing spaces `  curl  ` | Trimmed, matches Curl items |
| B8 | Query `zzzz` | Empty state with Reset button; count shows 0 |
| B9 | Regex/special chars `(`, `.*`, `[` , `\` | No exception, treated literally, empty state |
| B10 | Query `<b>` | Matches the custom item literally; markup is NOT rendered as HTML anywhere (card, count, lightbox title) |
| B11 | Type fast (10 chars in 300 ms) | Debounced: result reflects final text only; no stale render |
| B12 | Clear with backspace to empty | Full list returns |
| B13 | Search `angel` ES | Matches "Ángel de nieve" (leading accent capital) |
| B14 | `ñ`/`ü` queries | No crash |
| B15 | Search box has an associated label (aria-label or <label>), `type=search` or equivalent | a11y snapshot shows a name |
| B16 | Enter key in search | Does not reload the page / submit a form |

## C. Filters
| ID | Steps | Expected |
|---|---|---|
| C1 | Open body-part filter, select Chest only | Items with muscleParts containing 1: expect 5 (ids 500,501,502,503,532) |
| C2 | Select Chest + Back (multi) | OR within filter: union of both |
| C3 | Each body part 1-8 individually | Count equals fixture count by muscleParts (tabulate in report) |
| C4 | Filter Type = each actionType found in data (1 stretch, 2 warm-up, 3 strength) | Only types present in data are offered (facetsFrom); counts equal fixture |
| C5 | Difficulty filter | Fixture has NO level field -> filter must be hidden (not faked). If the implementer found a level field, test against it |
| C6 | Part + Type + search combined | AND semantics between filters; e.g. Legs + Type 1 + "isquio" -> 1 result |
| C7 | Active filter count badge | Shows number of active filter groups/selections consistently; 0 -> badge hidden |
| C8 | `aria-pressed` on chips/buttons toggles true/false | Verified in a11y snapshot / DOM |
| C9 | Deselect a chip | Results widen accordingly |
| C10 | Filters survive language switch? | Document; labels re-translated either way |
| C11 | Filter that yields 0 | Empty state with Reset |
| C12 | muscleParts with spaces or missing/null/"" in data | No crash; item excluded under part filters, included when no part filter |

## D. Reset
| D1 | Apply search+filters, click Reset | Search cleared, chips cleared, badge hidden, full count (40), focus managed sensibly |
| D2 | Reset when nothing active | Hidden/disabled or harmless |
| D3 | Reset button in empty state | Same as D1 |

## E. Results, count, pagination
| E1 | Count line | "40 movements" / "40 movimientos"; singular for 1 ("1 movement"); updates with filters |
| E2 | Fixture-large (280): initial render | Only 60 cards in DOM; count shows 280; "Show more" button visible |
| E3 | Click Show more | 120 cards; button text/remaining count updates; continues until all 280 then button disappears |
| E4 | Filter change after Show more | Pagination resets to first page of the filtered set |
| E5 | Exactly 60 results | No Show more button |
| E6 | 61 results | Show more shows, adds 1 card |
| E7 | Images use `loading="lazy"` and have alt (name or empty if decorative with button label) | DOM check |
| E8 | Card with null picUrl | Placeholder glyph shown, no broken image icon, still clickable? (lightbox returns early if no pic and no video - must not throw) |
| E9 | Broken image URL (404) | Falls back to placeholder (onerror) or at least layout stays intact |
| E10 | Long name | Truncated/wrapped within card, no horizontal overflow |
| E11 | Name with HTML chars | Rendered as text |
| E12 | Duplicate ids | No crash |

## F. States
| F1 | Loading | Skeleton or "Loading..." visible while fetch pending (delay fixture 2 s) |
| F2 | Error: fetch returns 500 / `{success:false,msg:"boom"}` | Error message with Retry button; no uncaught exception |
| F3 | Retry click after fixing mock | List loads, error cleared |
| F4 | Network failure (fetch rejects) | Same as F2 |
| F5 | Empty library (`data: []`) | Sensible empty state (no filter chips with zero options, no crash) |
| F6 | `data: null` / missing | No crash |
| F7 | Slow response then user switches tab before it returns | No errors, no DOM updates into hidden wrong panel; no stale overwrite after language switch (race) |
| F8 | Rapid language switch twice | Final language wins |

## G. Language switch while on the screen
| G1 | Switch EN -> ES (header toggle) while on Library | Stays on Actions > Library; strings (placeholder, filter labels, chips, count, buttons) in Spanish; list reloaded with `languageId` of new lang; names are the ES fixture |
| G2 | ES -> EN | Same in reverse |
| G3 | Query text typed before switch | Defined behavior (kept and re-applied to new names, or cleared) and no stale results |
| G4 | Switch while on "My actions" sub-tab | My actions stays; Library gets relang on next show |
| G5 | Segmented control labels translated | Yes, both tabs |
| G6 | Every new string has an ES entry in i18n.js (grep `t("...")` in movements.js against ES map) | No untranslated English in ES mode |

## H. Lightbox
| H1 | Click card with pic+video | Lightbox opens with video and title = name |
| H2 | Click card with pic only | Image shown |
| H3 | Close via X, backdrop click, Escape | Closes; video stops (media cleared). Escape support may be pre-existing or not - record |
| H4 | After close, focus returns to the originating card (a11y nicety) | Record result |
| H5 | Title with HTML chars | textContent, not HTML |
| H6 | Card without media | No exception (openLightbox returns early) |
| H7 | Lightbox opened from Programs editor thumbnails still works | Regression |

## I. Keyboard / a11y
| I1 | Tab order: segmented control -> search -> filters -> Reset -> cards -> Show more | Logical, no traps |
| I2 | Cards are `<button>` or role=button with accessible name = movement name | Snapshot |
| I3 | Enter/Space on card opens lightbox | yes |
| I4 | Enter/Space toggles filter chips | yes |
| I5 | Focus ring visible on chips, cards, segmented control, search | Visual check (screenshot after focus) |
| I6 | Filter sheet/popover (if any): Escape closes, focus restored, focus trapped while modal | Record |
| I7 | Segmented control uses aria-pressed / role=tab+aria-selected consistently | Snapshot |
| I8 | Count line `aria-live=polite` (or status) so changes announced | Record |
| I9 | `prefers-reduced-motion: reduce` emulation | No hover lift/transition/skeleton animation |
| I10 | Contrast of overlaid card name over gradient on white/bright images | Visual |
| I11 | Tap targets >= 40px on mobile for chips and buttons | Measure |
| I12 | Dark mode (if app supports) | Not unreadable |

## J. Layout
| J1 | 375x812: no horizontal scroll (`document.documentElement.scrollWidth <= innerWidth`) | pass |
| J2 | 375px: grid is 2 columns; filter row wraps; search full width | pass |
| J3 | 320px | no overflow |
| J4 | 768px | 3 columns or sensible |
| J5 | 1280px: 3-5 columns; content centered/max-width consistent with other tabs | pass |
| J6 | Bottom tab bar does not cover last card / Show more (padding-bottom) | Scroll to bottom at 375px |
| J7 | Sticky elements (if any) don't overlap | |
| J8 | Cards keep 3:4 ratio; no layout shift when images load | |

Screenshots to save in qa/screens/: library-375.png, library-1280.png, filtered-375.png, empty-375.png, error-375.png, lightbox-375.png, library-es-375.png, focus-375.png.

## K. Regression
| K1 | Programs editor: open "Add exercise" picker | Opens, chips + search work as before, uses same action list (shared cache), results counts unchanged |
| K2 | Picker Select adds a step | Works |
| K3 | Custom actions CRUD (My actions): list, refresh, add form validation, delete/edit if present | Behave as before (mocked) |
| K4 | Plans tab loads (PlannerUI.show) | No errors |
| K5 | History/Fitness/Profile tabs load with empty mocks | No new console errors attributable to movements |
| K6 | Language switch on Programs list / editor / Plans | Unchanged behavior |
| K7 | All static/*.js pass `node --check` | pass |
| K8 | `node static/planner-core.test.js` and `node static/movements-core.test.js` | pass |
| K9 | Script load order: movements-core.js before movements.js; both loaded by index.html; app.js tolerates `window.MovementsUI` undefined | pass |
| K10 | No global name collisions (let/const redeclaration across scripts such as `$`, `t`, `LANG`) | no console SyntaxError |
| K11 | server.py static serving includes new files (200, correct MIME) | pass |
| K12 | README bullet added | present |

## L. Core unit-level checks (node, via qa/ script if implementer tests are thin)
- normalize: `"Bíceps"`, `"ÁNGEL"`, `"ñandú"`, `null`, `undefined`, number -> no throw, deterministic.
- filterMovements: empty query returns all; whitespace query; parts OR semantics; types; levels; AND across; items with null muscleParts; does not mutate input.
- facetsFrom: only values present; sorted stable.
- paginate: page sizes at boundary 0, 59, 60, 61, 120; returns `hasMore`/remaining.

## M. i18n (explicit, EN and ES)
Fixture: prefer qa/fixtures/action-list-real.json (268 real actions, level 1/2/3 = difficulty, actionType 1/2/3 = stretch/warm-up/strength); synthetic fixtures for edge cases.
| ID | Check | Expected |
|---|---|---|
| M1 | Enumerate every visible string on the screen in EN (segmented labels, heading, search placeholder + sr-only label, filter titles, all chip labels for parts/types/levels, count line, Reset (+badge), Show more, Retry, error message, empty message, loading text, aria-labels) | All present in i18n.js ES map |
| M2 | Same in ES | No English text left (regex scan of visible text against EN key set), no raw `{n}`/`{msg}` placeholders |
| M3 | Count line plural: 0, 1, 2, 38 in EN and ES | "1 movement"/"1 movimiento", never "1 movements"/"1 movimientos"; 0 handled |
| M4 | Show more label: "(n left)" / ES equivalent, n correct, no placeholder |
| M5 | Accent-insensitive search in both languages (ES: biceps/bíceps/BÍCEPS/angel; EN: names with accents typed without) |
| M6 | Filters (chips) and query preserved across EN<->ES switch; chip labels re-translated; aria-pressed correct after re-render |
| M7 | Intercepted request URL on each switch contains languageId=es / languageId=en; exactly one new /action/list per switch (no duplicates) |
| M8 | `document.documentElement.lang` updates on switch |
| M9 | 375px ES: no chip/card/segmented label overflows or is clipped; no horizontal scroll; longest ES strings (Cuerpo completo, Mis ejercicios, Ningun movimiento coincide...) wrap |
| M10 | Difficulty/Type chip labels are translated names (Beginner/Intermediate/Advanced, Stretch/Warm-up/Strength), not "Level N"/"Type N" |
| M11 | Language switch while in loading / error / empty states |
