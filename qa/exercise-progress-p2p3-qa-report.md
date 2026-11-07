# Exercise Progress Phases 2 and 3 (issue #9): QA report, round 1

Branch `feat/exercise-progress-p23`, HEAD `093eb09`. Independent QA, product code untouched. Test plan: `qa/exercise-progress-p2p3-test-plan.md`. Environment: fixture server :8851, stubbed app :8852, Claude Browser pane (Chromium), fake clock. Oracle and i18n scripts live in the QA scratchpad.

## Verdict: READY, with 4 Minor and 4 Trivial findings (no Blocker, no Major)
Every acceptance criterion passes. The findings are polish and edge cases; none loses data, breaks a flow or violates the request budget.

## Automated checks (AC8)
- `node --test static/*.test.js`: 254 pass, 0 fail, three runs (the ai-kit timing test did not flake).
- `check-external-hosts.js`: ok (52 files). `check-theme-contrast.js`: all pairs pass (11 pre-existing advisory warnings). No colour literals in the Phase 2/3 CSS.
- Core review: `listExercises` groups by action id, uses `buildSeries` figures (same as the detail screen), name fallback and sort tie-breaks are sound; tested for weightless best, 0 kg-only exercises, missing library entry, blank library name, garbage input. `warmupDecision`: exact boundary (29:59.999 blocked, 30:00 runs), future `lastRunAt` and negative `everyMs` run (fail open), corrupted values (`"abc"`, `NaN`, `{}`, `Infinity`) run (fail open, then re-stamped), `cooldownLeft` string works, `NaN` ignored. Test gaps: no test for `ß`, kana or width folding (see P4).

## Acceptance criteria
| AC | Result | Evidence |
|---|---|---|
| 1 List, rows, tap, Back | Pass | 8 rows match the independent oracle (sessions, best, first to latest, last date, mode, kg and lb; custom 9001 and L/R pair 530/531 as separate rows; 777 without library entry listed under its index name). Tap opens progress (figures identical to the detail screen); Back restores query, sort, scrollY (200 to 200) and row focus; Escape works from progress and list; report > progress > report still works. |
| 2 Search and sorts | Pass (P1, P4) | "SEATED", "seáted chést", "  row  ", "(r)", Spanish "flexion" / "FLEXIÓN DE" match; "zzz" shows the no-match state with Clear search; 4 keystrokes give 1 render; live region reads "8 exercises". Recent (ties by name), sessions (44/44/44 then 42/42/41/22/3, ties by recency), name A-Z all correct. |
| 3 Cached, live, states | Pass (P3, P7) | Cached open instant; first sync: "Loading", 7 rows after 2 s, counts growing, banner "Syncing... n of 86", no live-region chatter. Empty, offline-no-cache, error with Retry (focus lands on the title), WAF cooldown banner with 3 throttled announcements. Second open costs 1 list call. |
| 4 Editor icon | Pass (P5) | Icon on 512, 530, 9001, 777, 570 only; none on 560/561 (even with stale weight 5.0) or unknown without weight. Name "Progress for {name}". 44 x 44 at 320 (36 on a fine pointer at 768 and up). Overlay: dialog, aria-modal, `#app` inert, body scroll locked, Tab cycles inside, Escape and Back close with focus on the icon; edited name and two weights intact, scroll 300 unchanged; Save posts the full program (8 steps, id 71, edits 9.5 kg = 95, 7.3 kg = 73). Overlay during a first sync shows progress; closing stops requests (18 to 18); reopening resumes (3 of 69). |
| 5 Warm-up | Pass (P2) | New account and half-finished first sync: `no-full-sync`, 0 requests. Boundary 28.95 min: `recent`, 30.1 min: runs (1 list, no library refetch). Hidden, offline: wait and then run on `visibilitychange` / `online`; saveData: never. Web Lock held by another holder: no requests, no UI. WAF limit 45 with the user switching tabs: peak 42, 0 blocks. 429 on list: no banner on unrelated screens, list shows "Waiting n s". Logout mid-run: detail count frozen at click time. Runs per account (separate DBs). Default delay 5.05 s. |
| 6 No Phase 1 regression | Pass | First sync under `waf=60:10:10`: peak 40 per 10 s, 0 blocks, 86 details + 2 library + 2 list. Second open, report entry, tab-bar History and `clearAll` wipe (3 DBs to 0, registry cleared) fine. Purge rules: code path unchanged, Phase 1 tests green (not re-run in browser). |
| 7 i18n, units, themes, widths, a11y | Pass (P6) | 21 keys present in de, fr, it, ja, ko, zh (only "Name A-Z" identical to English in de) and the es block; placeholders consistent. de, ja, zh, ko, fr, es at 320: no horizontal overflow in list, progress or editor. kg/lb, dark, tide, hallowfit fine; 768 and 1280 fine. Keyboard path: entry > list > search > sort > rows > progress works; polite live region announces only after search/sort. |
| 8 Tests and checks | Pass | see above |

## Judgements requested
- **30-missing-details cap**: acceptable. A user absent about 10 weeks at 3 workouts a week exceeds it and the warm-up goes quiet (logged `too-many`, 1 list call, no fetch) until they open the list, which syncs normally. It protects the "first sync is user-initiated" rule. It is not in the plan; keep it documented.
- **No re-arm in a long-lived tab**: acceptable. Both screens sync on open anyway; the only loss is a stale cache in a tab left open for hours. A single `setTimeout` at the end of the 30-minute window would close it cheaply; optional.
- **Fail-open on corrupted or skewed meta**: acceptable; the run restamps `meta.warm`.

## Defects

### P1 (Minor) Escape in the search field leaves the list
Repro: History > Exercises, focus the search box, type "remo", press Escape. Expected: the search is cleared (native behaviour of a search field), list stays. Actual: `onKey` goes Back to the dashboard and the typed search is lost. Suggest: if the event target is the search input with a value, clear it and stop; leave only on an empty box.

### P2 (Minor) A foreground hand-off re-fetches the in-flight details
Repro: `#synced=20&warmdelay=300` (fresh e-mail), History tab, wait until the warm-up runs, after 1.5 s open Exercises. Expected: no request twice (plan: "no double sync"; impl notes: "no duplicated detail request"). Actual: 22 detail requests for 20 missing ids; 20080 and 20073 were fetched twice, 3 s apart. Cause: `doSync` discards a completed response when `stopped()` (`if (stopped()) return;` after `pacedCall`), so up to CONCURRENCY (3) requests are repeated per hand-off. The sync itself is single (no second pool). Suggest storing a response that arrived even if the run was superseded.

### P3 (Minor) Offline-without-cache list never recovers
Repro: `#offline`, fresh e-mail, open Exercises, then `__epOffline(false)`. Expected: sync starts when the connection returns, or a Retry button exists. Actual: stays on "You are offline..." until the user leaves and reopens the list. Same root as the Phase 1 progress screen (no `online` handler for foreground owners), more visible in the list because the screen is otherwise empty.

### P4 (Minor) Search folding gaps (`fold`)
`fold("Straße")` is "straße" so "fuss" does not find "Fußheben" and "strasse" does not find "Straße" (ß is not expanded). `fold` removes every `\p{M}`, so Japanese dakuten and handakuten vanish: "ヘンチ" matches "ベンチ" and "ハ" matches "パ" (over-matching, wrong results for ja users). Half-width kana ("ﾍﾞﾝﾁ") and full-width Latin ("ＡＢＣ") are not unified (no NFKC), so IME variants miss. Suggest `s.replace(/ß/g,"ss")`, NFKC first, and strip marks only for Latin/Greek/Cyrillic ranges (or keep U+3099/U+309A). Add tests; none exist for these cases.

### P5 (Trivial) Progress icon touches the row menu button at 320
At 320 px the icon box is x 202 to 246 and the menu button x 244 to 278: 2 px overlap, adjacent targets with no gap. Move the icon 4 to 6 px left (`right: 46px`).

### P6 (Trivial) Screen-reader details
Row `aria-label` replaces the content, so the weight-mode text ("Per side", "Combined", "No weight") is not read; `ul.exl-list` has `list-style: none` and no `role="list"` (VoiceOver drops list semantics); `#ex-list` carries `aria-labelledby` without a role; the end of a sync is not announced in the list. VoiceOver and NVDA were not run.

### P7 (Trivial) Duplicate offline text
Offline with no cache prints the same sentence in the banner and in the empty-state block (read twice).

### P8 (Trivial) Debounce race can drop focus
Typing then Tab within 200 ms focuses a row that the pending filter then removes; focus falls to `<body>`. Flush the debounce on `blur`.

Also noted, not defects: the list counts sessions with a chartable value (Seated Chest Fly 44 versus 45 workouts, one with only 0 kg sets); documented in the impl notes. The row list re-renders every 700 ms during a sync (rebuilds all `<img>` nodes), fine for 8 rows, not measured for a 300-exercise library.

## Not verified
- VoiceOver, NVDA, TalkBack; real touch devices (44 px measured on a 320 emulated width, pointer stayed fine at 768).
- Real X1 API behaviour (`/action/list` per-language names, caps); the stub answers the save call locally, so the "request body" check used the stub's capture (`window.__saves`), not the fixture server.
- Two real browser tabs racing for the Web Lock (only a held lock was simulated); real `requestIdleCallback` under load; a 300-exercise list's render cost; purge rules in the browser; unit change while the overlay is open; the stub re-logs-in on reload, so "after logout" was verified by request counts until the page reloaded.
