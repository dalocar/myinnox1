# Courses screen - QA test plan

Scope: docs/plan-courses-screen.md (Programs tab: Courses | My programs toggle).
Fixtures (qa/fixtures/):
- `course-list-real.json`: 75 real courses. Expected counts: level 1/2/3 = 25/37/13; topic (courseType) 1..5 = 20/3/30/4/18; duration "up to" buckets <=10: 2, <=20: 21, <=30: 52, <=40: 69 (durations also include 45/50/60, which only appear unfiltered); accessory ids (OR in group): 1:64, 2:6, 3:28, 4:10, 5:31, 6:30, 14:2; unknown ids 8:1, 13:5, 16:3 (must NOT produce chips; courses still listed); courses with at least one confirmed accessory: 70.
- Combos: Beginner + Strength = 11; Beginner + Strength + <=30 min = 11; accessory 1 OR 2 = 64.
- `course-detail-41.json`: detail stub for course id 41 built from rutinaA.json (mainStepList 14 exercises with picUrl/videoUrl/count/groupNum, empty warmUp/relax lists, description containing `<b>` and quotes for escaping).
Harness: isolatedContext "stub", localStorage innodigym_token/innodigym_email dummy, `fetch` override: `/api/course/list*` -> course-list-real (also record URL for languageId), `/api/course/detail*id=41` -> detail stub (other ids: 500 error / delayed), `/api/action/list*` -> action-list-real, everything else `{success:true,data:[]}`. Real-account page (isolatedContext "real") READ-ONLY, GET only.

## A. Entry / toggle
| ID | Steps | Expected |
|---|---|---|
| A1 | Open Programs tab | Segmented "Courses | My programs" (ES: Cursos | Mis programas or per notes); Courses default |
| A2 | Toggle to My programs | Existing custom list ("New program", cards, edit/delete) exactly as before; Courses hidden |
| A3 | Back to Courses | Search/filters preserved (or defined); no duplicate handlers |
| A4 | Tab bar unchanged (6 tabs) | |
| A5 | Switch tabs Programs -> Plans -> Actions -> Programs | No errors, no stale spinner |

## B. Search
| B1 | Type partial name e.g. "fat" | Matches names containing it, case-insensitive; count line updates |
| B2 | Accent-insensitive in ES with real Spanish names ("fuerza"/"Fuerza", "estiramiento") | Same results regardless of accents |
| B3 | Debounce, clear returns 75 | |
| B4 | Special chars `( [ \ .*` | No exception, literal |
| B5 | `<b>` in query | Nothing rendered as HTML |
| B6 | Trim spaces | |
| B7 | No results | Empty state + Reset button |

## C. Topic chips
| C1 | Each topic chip alone | Counts 20/3/30/4/18 |
| C2 | Two topics (multi) | OR within topics: e.g. Fat loss + Stretching = 23 |
| C3 | aria-pressed toggles; chip labels EN: Fat loss/Stretching/Strength/Conditioning/Themed training; ES: Pérdida de grasa/Estiramiento/Fuerza/Condición física/Entren. temático | |
| C4 | Topic with 0 in data not shown (if facet-derived) | |

## D. Filters panel
| D1 | Filters button opens panel; count badge shows number of active groups/selections | Open/close via button, Escape closes, focus returns to button |
| D2 | Difficulty each: 25/37/13 | |
| D3 | Duration buckets single-select "up to": 10 -> 2, 20 -> 21, 30 -> 52, 40 -> 69; selecting another replaces; selecting active again deselects | |
| D4 | Accessory multi (OR): 1 -> 64; 2 -> 6; 1+2 -> 64; 14 -> 2 | |
| D5 | Accessory unknown ids 8/13/16 | No chips; courses with them still listed unfiltered |
| D6 | AND across groups: Beginner + Strength = 11; + <=30 = 11; Beginner + <=10 min -> expected computed from fixture (document) | |
| D7 | Topic chip + panel filters AND | |
| D8 | Reset clears search, topic, panel filters, badge; full 75 | |
| D9 | Badge hidden at 0 | |
| D10 | Panel accessible: role/aria-expanded on trigger, labelled groups | |

## E. List / cards / paging
| E1 | Count line plural EN: 0 courses / 1 course / 5 courses; ES: 0 cursos / 1 curso / 5 cursos | |
| E2 | 75 courses > 60: 60 cards + Show more "(15 left)"; click -> 75, button gone; focus to first new card | |
| E3 | Filter change resets page | |
| E4 | Card shows image (smallImg), name, "N min" pill, difficulty pill (translated) | |
| E5 | Broken/missing image placeholder; lazy loading | |
| E6 | Long name wraps, no overflow | |
| E7 | Names with double spaces ("Strength for Fat Loss  for Beginner") render sanely | |

## F. Detail modal
| F1 | Click card 41 | Modal opens with big image, name, pills, description (escaped, `<b>` shown as text), spinner while detail loads |
| F2 | Exercises listed: 14 from mainStepList with thumbnail, name, sets x reps; empty warmUp/relax sections not shown (or labelled) | |
| F3 | Exercise thumbnail click opens media (if implemented) | |
| F4 | Detail error (500) -> error + Retry within modal, no crash | |
| F5 | Detail for course with empty lists | graceful |
| F6 | Close via X, backdrop, Escape; focus returns to originating card | |
| F7 | Focus trapped while modal open; background not scrollable (or defined) | |
| F8 | Open another course quickly / race: shows latest | |
| F9 | Language switch with modal open | Defined behavior, no stale language |
| F10 | No write controls (read-only) | |
| F11 | Modal at 320/375 scrolls internally, close button reachable | |

## G. States
| G1 | Loading skeleton/text (delay 2.5 s) | |
| G2 | List error (500, reject) + Retry works | |
| G3 | Empty list `[]` | message, no crash |
| G4 | data null | no crash |

## H. i18n
| H1 | Every visible string EN and ES present, no raw `{placeholders}`, no English left in ES | |
| H2 | Language switch on Courses refetches `/api/course/list?languageId=es|en` (once per switch) and clears cache; names change (real account: real translated names) | |
| H3 | Search/filters/topic selections survive switch; chips relabelled | |
| H4 | `<html lang>` updates | |
| H5 | Switch while My programs shown | stays; Courses refreshed on return |
| H6 | ES text no overflow at 320/375 | |
| H7 | Plural count lines (see E1) | |

## I. Layout
| I1 | 1280: multi-column grid, no horizontal scroll | |
| I2 | 768: 2+ columns | |
| I3 | 375: <480px -> 1 column cards; no overflow | |
| I4 | 320 ES: no horizontal scroll (header/tab bar) | |
| I5 | Last card / Show more not hidden by bottom tab bar | |

## J. Keyboard / a11y
| J1 | Tab order: toggle -> search -> topic chips -> Filters -> cards -> Show more | |
| J2 | Enter/Space on chips, Filters, cards | |
| J3 | Focus ring visible on chips, filters button, cards, toggle (screenshot) | |
| J4 | Coarse pointer: chips/buttons >= 44px (emulate touch) | |
| J5 | Cards are buttons with accessible names; count aria-live | |
| J6 | prefers-reduced-motion respected (CSS rule) | |

## K. Regression
| K1 | My programs: list, New Program opens editor (no save in real account), editor unchanged | |
| K2 | Programs editor picker: opens, search accent-insensitive, chips, 80 results | |
| K3 | Movements (Actions tab): Library loads, filters, search, lightbox Escape/focus return | |
| K4 | Plans list, My actions, Profile load; no console errors | |
| K5 | `node --check static/*.js`; `node --test static/*.test.js` | |
| K6 | Script load order; no global redeclaration errors; static files served | |
| K7 | Real account (read-only): course list real counts, real ES names, real detail with real media | GET only |
