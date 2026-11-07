# Exercise Progress (Phase 1, issue #9): QA report, round 1

Branch `feat/exercise-progress`, HEAD `41ca07a`. Independent QA, product code untouched. Test plan: `qa/exercise-progress-test-plan.md`. Environment: fixture server :8821, stubbed app :8822, Claude Browser pane (Chromium), fixed clock 2026-10-29. Scratch scripts (oracle, i18n check) live in the QA scratchpad, not in the repo.

## Verdict: NOT READY (1 Major, 6 Minor, 6 Trivial)
Everything the plan lists as a flow works: tap and Back, ranges, tooltip, Combined/Per side/weightless, L/R, custom action, duplicates, first sync, cached reopen, leave/resume, pause/Resume, 429 with Retry-After, bisect, offline-in-session, logout wipe, account isolation, delete, kg/lb live switch, languages, themes, widths. One Major: "Personal best" is not the personal best when a range other than All is selected.

## Automated checks (AC9)
- `node --test static/*.test.js`: 232 pass, 0 fail, run 4 times (the flaky ai-kit timing test did not fail). `exercise-progress-core.test.js` alone: 42 pass, also green under `TZ` America/Los_Angeles, Pacific/Auckland, Asia/Kolkata, Europe/Madrid.
- `node scripts/check-external-hosts.js`: ok, 51 files. `node scripts/check-theme-contrast.js`: all pairs pass (11 pre-existing advisory warnings, none from this feature).
- `exercise-progress.css` has no colour literals; no new hosts or network APIs in the new JS.

## Defects

### D1 (Major) "Personal best" and "Change since first" are computed over the selected range, not over all time
Repro: stub flags `#fxport=8821&email=a@example.test`, History > Upper A report > any exercise, or `ExerciseProgressUI.open(561,...)` (Push-up). Click 3M, then All.
Expected: "Personal best 16 on 2025-02-05" in every range (it is a personal best); range changes the chart, sessions and the change-over-range.
Actual: 3M shows "Personal best 16 / 2026-08-12", 6M "2026-05-27", 1Y "2025-12-17", All "2025-02-05". The screen-reader summary says the same ("personal best 16 on 2026-08-12"). "Change since first" and "Sessions" also follow the range (3M: first 2026-07-29, 8 sessions). Cause: `buildSeries` filters `pts` by the cutoff and then calls `summarize(pts)` (`static/exercise-progress-core.js` lines 195-199). Plan criterion 2 lists "personal best with date" as a summary stat with no range qualifier; a user looking at 3M and seeing a personal best that is not their best will be misled, and a lifter whose best was 5 months ago would be told the best is last week's.
Judgement: not acceptable as "personal best". Either compute `best` (and its date) from all points and keep latest/sessions/change on the range, or relabel the tile "Best in range". Recommended: all-time best, and keep "Change since first" over the range but label it so (or keep all-time). Unit test needed: best is range-independent.

### D2 (Minor) With an empty cache, error and offline states leave "Loading…" in the chart card
Repro A (error): flags `#fxport=8821&email=e1@example.test&retryscale=0.02`, open History, then `curl 'localhost:8821/ep/_fail?status=envelope&n=all&route=list'`, open any exercise. Banner says "Could not load your workout history ... Retry" but the card below says "Loading…" indefinitely.
Repro B (offline, no cache): new e-mail, `#offline` or `__epOffline(true)`, open an exercise. Banner says "You are offline. Showing the data saved on this device." (there is none) and the card says "Loading…".
Expected: no promise of data that does not exist, no endless "Loading…".
Actual as above. Cause: `setSync()` only calls `renderSync()`; the chart message is recomputed only by `renderData()`, and for status `offline`/`stale` the `S.sync.status === "idle"` branch is not what is left stale but `renderData` is never called after the status change. A related wording problem shows in state "paused" before any data arrived: "No history for this exercise yet / Complete a workout..." (paused, 0 of 86 loaded): the history is merely unloaded, not empty.

### D3 (Minor) Truncation by a server cap other than 50 is undetected, and the sync is then marked complete
Repro: `#fxport=8821&email=c7@example.test&cap=7` (cap on the fixture server, default `size=500`). Open an exercise.
Expected (plan 3, "never assume truncation cannot happen"): all 86 workouts.
Actual: 14 workouts (7 per window), sync status done, `meta.complete = true`, so later opens only look at the newest window. `isFull` only treats `count >= size` or `count === 50` as "possibly truncated". The real cap is not verifiable (probe account dismissed). If the real API ignores `size` and caps at e.g. 20 or 100, history is silently incomplete forever. With cap 6 and `size=6` bisecting works perfectly (86/86, 48 list calls). Suggest: treat any window whose count equals the largest count previously seen for a non-final window, or use `size=50`-style conservative detection, or at least do not set `complete` after a walk whose windows all returned the same count > 0 below `size`.

### D4 (Minor) Workouts deleted elsewhere, older than the newest 12-month window, are never purged
Repro: sync `full1` fully; insert two fake cached workouts (IndexedDB `workouts`: ids 99991 dated 2026-03-01 and 99992 dated 2025-03-02); reopen an exercise.
Actual: 99991 is purged (`stale`), 99992 stays forever (until logout), still in the chart and counts. With `meta.complete` the incremental walk stops after the first window, so `coveredFrom` is only 2025-10-30. Plan 7 only requires removal on delete in the app, which works, but a workout deleted from another device or the native app keeps inflating the history. Acceptable as a documented limitation; flag for the owner.

### D5 (Minor) Focus is lost (to `<body>`) when the screen is re-rendered
Repro: (a) paused or error state, activate Resume/Retry with keyboard: the button is removed, focus goes to body; (b) with the screen open and a range button focused, change the unit (Units.set) or language: `render(false)` rebuilds the whole screen, focus goes to body and an open "Data table" is collapsed again.
Expected: focus stays on a sensible element (title or the control), details state kept.
Impact: keyboard and screen-reader users lose their place during unit/language switches (rare while on this screen) and after Resume/Retry (common path).

### D6 (Minor) Training Report link looks like a plain heading and is a 32 px target
The exercise name keeps the heading colour and weight, with only a small chevron as affordance (screenshot 1280: "Seated Chest Fly >"); height is 32 px (above the WCAG 2.2 24 px minimum, under the 44 px used elsewhere in the app, e.g. the Back button). The existing report layout and focus order are otherwise intact (Back, title, links in order, accessible name "View progress of X" contains the visible text). Not a blocker; consider an underline or the accent colour.

### D7 (Minor) `docs/exercise-progress-impl-notes.md` does not exist
The plan, the core file header and the task brief refer to it (stub flags, run commands); the file was never committed (`git ls-files docs` has no such file, no stray copy in the worktree). The flags are documented in the header of `qa/exercise-progress-stub-init.js`, which is what QA used.

### D8 (Trivial) Single session shows "Change since first 0.0 kg (0%)"
With one point the change tile is meaningless; show an em dash or hide it.

### D9 (Trivial) Scrollable data table has no keyboard focus or name
`.exp-tablewrap` scrolls in both axes (max height, 44 rows at 320 px) with no `tabindex="0"`, role or label. Chromium makes such containers focusable by default, Safari does not; add `tabindex=0 role=region aria-label`.

### D10 (Trivial) Server messages and ISO dates are not localised
"Sync paused: {msg}" and the error line show the raw server text ("injected 503"); dates in tiles, tooltip and table are raw `YYYY-MM-DD HH:mm` (consistent with the rest of the app, so only noted).

### D11 (Trivial) German range buttons wrap at 320 px ("3 / Mon.", "6 / Mon.")
No overflow, only a two-line label. Consider "3 M" or abbreviations.

### D12 (Trivial) Detail results that arrive after the user left are discarded
`shutdown()` comment says finished requests are still saved, but the worker returns before `store.put` when `stopped()` (up to 3 wasted requests per leave; churn test: 101 detail calls for 86 workouts). Harmless.

### D13 (Trivial) lb rounding: change is converted separately from the values
Combined 512 in lb: Latest 33.1, first 17.6, "Change +15.4 lb" (33.1 - 17.6 = 15.5). Tenths of kg are the source of truth, so 15.4 is the exact conversion; only the visible arithmetic differs by 0.1.

## Pass / fail per acceptance criterion
| AC | Result | Evidence |
|---|---|---|
| 1 Tap, Back to same report | PASS | Mouse and keyboard (Enter/Tab/Enter, Escape, Back button): focus on the title, then on the used link; scrollY 753.5 restored exactly; tab-switch away and back closes progress and stops the sync |
| 2 Chart, ranges, tooltip, summary | PARTIAL | Oracle comparison of all 8 actions: points, weights, reps, sets identical; ranges 8/13/25/44 points; real hover tooltip (date, weight, reps, sets; total for Combined); max weight only, tenths, actionId keying; FAIL on D1 (personal best per range) |
| 3 Combined / Per side / weightless | PASS | 512 and custom 9001 "Combined", "Load per cable", total 2x (11.0 kg -> 22.0 kg); 530/531/570 "Per side"; Plank seconds, Push-up reps, stale 5 kg ignored; `#nolibrary` and unknown 777 chart the stored value without a label |
| 4 Empty, single, table, announcement | PASS with D2, D8, D9 | Empty and out-of-range messages, single-point message, table with caption and `th scope`, canvas `role=img` label with summary, live region on range change |
| 5 Sync | PASS | Newest first with progress bar; cached reopen renders in <60 ms with one list call; leaving stops requests (0 after leave) and reopening fetched only the missing 44; offline reopen from cache keeps chart; pause after 15 detail attempts then Resume completes. Caveat D2 for empty-cache offline |
| 6 Pagination, retry, concurrency | PASS with D3 | `size=6&cap=6`: 86/86, 48 list calls; 5x 429 with `Retry-After: 2` waited 2 s each; max in flight 3, also under open/close churn; unit tests for delays, always-full termination (8754 calls with size 3, terminates) |
| 7 Cache lifecycle | PASS with D4 | One DB per account, names are hashes (no e-mail); new account starts empty; logout removed all `myinnox1-progress-*` DBs and the registry key; deleting a workout removed it from memory and IndexedDB at once |
| 8 i18n, units, themes, widths | PASS | All 50 keys translated in 7 languages (script; only cognates "3M/6M/Total/Reps/Date" equal English, "Reps" is the existing pack's choice); es and de UI, de at 320 no overflow; kg to lb live update (stats, axis title, ticks, head, aria); themes default, dark, ember, tide, graphite, fit-xmas, hallowfit switch the chart colours live; 320, 768, 1280 no page-level scroll. D5, D11 |
| 9 Automated | PASS | See above |
| 10 Fixtures and stub | PASS | All required cases exist in `qa/fixtures/exercise-progress`; every stub flag worked |

Regression: Training Report (sets table, header), History dashboard (recent list, medals, Delete), Explorer day view, tab switching, logout all still work; console shows only the injected 429/503 network errors, no JS errors.

## Not verified
- Real API behaviour: `size=500`, true page cap, rate-limit threshold, first-sync time with real ~0.8 s latency (500 workouts), machine-side meaning of Combined x2 (inferred in the plan).
- Page reload while offline (the app itself needs the network to reach History), service-worker or PWA behaviour.
- IndexedDB unavailable (private mode) memory fallback, quota errors, `indexedDB.databases()` missing (Firefox before 126): code read only.
- Browsers other than Chromium; touch hover/tap tooltip on a real phone; actual screen reader (VoiceOver/NVDA): semantics read from the DOM only.
- Visual check of ja, ko, zh, fr, it (keys verified by script only), ember/tide/graphite screenshots (contrast values only), 500-point chart performance.
- Retry cost of a permanently failing single record (envelope `code != 200` is retryable: 15 s of backoff on the shared gate for every sync, then counted as failed): by code reading only, not reproducible with the fixtures without editing them.
- Explorer-originated report path (fixture statistics carry no records).
