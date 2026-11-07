# Exercise Progress (Phase 1, issue #9): QA test plan

Source of truth: `docs/plan-exercise-progress.md` (10 acceptance criteria, answers to the open questions). Written by the independent QA agent; it tests the contract, not the code. `docs/exercise-progress-impl-notes.md` was referenced by the plan but does not exist in the branch (see defect D7 in the report); the stub flags were taken from the header of `qa/exercise-progress-stub-init.js`.

Environment: `PORT=8821 node qa/fixture-server.js` (fixtures, failure injection, `/ep/_stats`, `/ep/_reset`, `/ep/_config`) and `PORT=8822 node qa/serve-with-stub.js` (app with the fetch stub injected), opened as `http://localhost:8822/#fxport=8821&...flags`. Fixed clock 2026-10-29 12:00 unless `now=` is given. A fresh `email=` flag gives a fresh cache (account scope), so every "first sync" case uses a new e-mail. Browser: Claude Browser pane (Chromium), real mouse hover/keyboard for tooltip, tap and focus cases, JS only for inspecting state and for flag-free bulk comparisons.

Methods: **U** node unit run / ad-hoc `node -e` against `exercise-progress-core.js`; **B** browser; **S** static script; **O** oracle (independent node computation from `qa/fixtures/exercise-progress/workouts.json`, compared with what the UI table shows).

## 0. Fixture facts used as oracle
86 workouts 2025-01-08 .. 2026-10-21. Actions: 512 Seated Chest Fly (Combined, sideNum 2), 530 / 531 Single-Arm Row R / L (Per side), 570 Hammer Curl (Per side), 560 Plank (sideNum 0, countType 2), 561 Push-up (sideNum 0, countType 1), 9001 My Cable Pullover (custom, Combined), 777 Retired Move (not in the library, 3 sessions only in early 2025). 512 has a deload dip (2025-06-11, 9.0 kg) and one workout with only zero-weight sets. 2026-10-20 has two workouts (07:15 and 18:40).

## 1. Acceptance criteria to test cases

### AC1 Tap an exercise in a Training Report, Back returns to that report
| ID | Case | Method | Expected |
|---|---|---|---|
| 1.1 | Open History, tap a workout, tap an exercise heading with the mouse | B | Progress screen for that actionId (title = exercise name), report hidden |
| 1.2 | Same with keyboard only (Enter on workout row, Tab to the exercise link, Enter) | B | Same; focus lands on the progress title |
| 1.3 | Back button, and Escape | B | Same report shown again, scroll position restored, focus on the link that was used |
| 1.4 | Tab order of the report with the new links | B | Back, title, links in reading order, accessible name "View progress of X" contains the visible text |
| 1.5 | Switch main tab and return to History while progress is open | B | Progress closed and sync stopped, dashboard shown, no double panels |
| 1.6 | Open from Explorer-originated report | B | Explorer fixture has no per-day records, so not reachable (noted as unverified) |

### AC2 Chart, ranges, tooltip, summary
| ID | Case | Method | Expected |
|---|---|---|---|
| 2.1 | Every action: number of points, first and last point, Reps and Sets columns equal the oracle | O+B | Identical (max weight per workout, reps at that weight, weighted sets) |
| 2.2 | Ranges 3M, 6M, 1Y, All; default All; boundaries inclusive on calendar months | B+U | Point counts 8 / 13 / 25 / 44 for Push-up, cutoff 2026-07-29 for 3M |
| 2.3 | Real mouse hover on a point | B | Tooltip: date and time, weight (unit aware), reps, sets (+ total for Combined) |
| 2.4 | Summary tiles: Latest, Personal best with date, Sessions, Change since first (absolute and %) | B+O | Values match the oracle for All; check what changes per range |
| 2.5 | Personal best for a short range versus all time | B | Personal best must be the best ever (or be labelled as range best) |
| 2.6 | Change since first when first value is 0, one session, tie for best | U | No NaN/Infinity, pct null when first is 0, earliest tie date |
| 2.7 | Same-day duplicates (2026-10-20) | B+O | Two distinct points and two table rows |
| 2.8 | Deload dip 2025-06-11 | B | Plotted, not hidden |
| 2.9 | Only the max weight (not volume), in tenths of kg, keyed by actionId (L/R separate, custom action works) | O+B | 530 and 531 separate series; 9001 charted and labelled Combined from the custom library |

### AC3 Combined / Per side / weightless
| ID | Case | Expected |
|---|---|---|
| 3.1 | 512 and 9001 | Sub line "Combined", y title and table head "Load per cable (kg)", note about the total, tooltip and table show Total = 2x |
| 3.2 | 530, 531, 570 | Sub line "Per side", "Weight (kg)", no total |
| 3.3 | 560 Plank | "Seconds" axis, "Best time per workout", values in s, no weight axis, stale default 5 kg ignored |
| 3.4 | 561 Push-up | "Reps", no weight |
| 3.5 | `#nolibrary` | No label, no total, stored value charted |
| 3.6 | 777 (not in library) | Weight (kg), no label |

### AC4 Empty, single, table, announcements
| ID | Case | Expected |
|---|---|---|
| 4.1 | Unknown actionId | Empty-state message, no ranges/stats/chart |
| 4.2 | Range with no points (777, 3M) | "No workouts in this range" and ranges still visible |
| 4.3 | Single point (`now=2025-01-16`, Hammer Curl) | Message plus a centered point; summary sane |
| 4.4 | Table alternative | `<details>` reachable by keyboard, caption, `th scope`, same data as the chart |
| 4.5 | Chart text alternative | Canvas `role=img` with a label containing the summary; live region announces on range change and sync end |
| 4.6 | Loading / error / offline states with an empty cache | Message matches the real state |

### AC5 Sync behaviour
| ID | Case | Expected |
|---|---|---|
| 5.1 | First open, 400 ms latency | Newest first, progress bar "n of total", chart fills in while syncing |
| 5.2 | Reopen cached | Stats render within 100 ms, exactly one list call, no detail calls |
| 5.3 | Leave mid-sync, no further requests; reopen resumes with only the missing ids | B + `/ep/_stats` |
| 5.4 | Offline after first sync | Banner, chart still drawn from cache |
| 5.5 | Offline with no cache | Honest message |
| 5.6 | Pause (503 on every detail call) then Resume | Pauses after 5 attempts x 3 lanes, Resume completes |
| 5.7 | Rapid open/close churn | Never more than 3 requests in flight |

### AC6 Pagination safety, retry, concurrency
| ID | Case | Expected |
|---|---|---|
| 6.1 | `size=6&cap=6` | All 86 workouts, bisected windows |
| 6.2 | Server cap not equal to size and not 50 (`cap=7`, default size) | Truncation detection limits |
| 6.3 | `429` x5 with `Retry-After: 2` on detail | Waits 2 s each time, completes, message shown |
| 6.4 | `maxInFlight` from `/ep/_stats` | 3 |
| 6.5 | Unit: retryDelay 1,2,4,8 s, Retry-After wins and is capped, bisect depth, always-full window terminates, DST/time zone runs of the unit tests | U |

### AC7 Cache lifecycle
| ID | Case | Expected |
|---|---|---|
| 7.1 | DB names | One IndexedDB per account, name does not contain the e-mail |
| 7.2 | New e-mail starts with an empty cache | Full first sync |
| 7.3 | Log out | All `myinnox1-progress-*` databases and the registry key removed |
| 7.4 | Delete a workout from the History list | Gone from memory and IndexedDB immediately |
| 7.5 | Cached workout that the server no longer lists (recent and older than 12 months) | Recent one purged on next sync, older one |

### AC8 i18n, units, themes, widths
| ID | Case | Expected |
|---|---|---|
| 8.1 | Every new key in es, de, fr, it, ja, ko, zh | Translated or an accepted cognate; no raw keys |
| 8.2 | es + de + en UI | No English leaks (apart from server messages); de at 320 has no horizontal overflow |
| 8.3 | kg to lb while the screen is open | Stats, axis title, ticks, table head, aria label update |
| 8.4 | Themes default, dark, ember, tide, graphite, fit-xmas, hallowfit | Chart and tooltip use tokens, readable; chart redraws on theme change |
| 8.5 | 320 / 768 / 1280 | No page-level horizontal scroll, stats wrap sensibly |
| 8.6 | Keyboard-only and focus management after rebuilds | Focus not lost |
| 8.7 | Console | No JS errors |

### AC9 Automated checks
| ID | Command | Expected |
|---|---|---|
| 9.1 | `node --test static/*.test.js` (run 4 times, flaky ai-kit timing test noted) | all green |
| 9.2 | `node scripts/check-external-hosts.js` | ok |
| 9.3 | `node scripts/check-theme-contrast.js` | all pairs pass |
| 9.4 | `exercise-progress.css` literals, new hosts | none |

### AC10 Fixtures and stub
| ID | Case | Expected |
|---|---|---|
| 10.1 | Fixtures contain: same exercise over months, Combined / Per side / weightless, L/R pair, deload dip, custom action, duplicate-date pair | Yes |
| 10.2 | Stub flags work (`imperial`, `now`, `email`, `size`, `cap`, `retryscale`, `latency`, `fail`, `nolibrary`, `offline`) | Yes |

## 2. Regression
Training Report layout (new link inside the h4), History dashboard (recent list, delete, medals), Explorer (day view), tab switching, language switch, logout.

## 3. Core logic review checklist (U / code reading)
Date maths only through Date.UTC (DST/timezone: unit tests re-run under four `TZ` values), same-day duplicates, L/R as separate ids, weightless countType 2, Combined doubling from tenths (no rounding drift), lb conversion from tenths, bisect termination (single day, always-full server), retry/Retry-After parsing (seconds, HTTP date, negative, garbage), gate shared across lanes, pool stop/pause, range filtering at month ends (Mar 31 -> Feb 28), first value 0, garbage in `summarizeWorkout` / `buildSeries`, stale detection coverage.
