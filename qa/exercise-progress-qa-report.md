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

---

# Round 2 re-verification (commits 0f78a86, d720b83)

Automated: `node --test static/*.test.js` 236 pass / 0 fail (3 runs), external-hosts ok, theme contrast all pairs pass. Browser: fixture :8821, stub :8822, re-run of the round 1 scenarios plus the new code paths.

## Verdict: NOT READY, only because of Minor items the coordinator may choose to accept (N1, N2); no Major or Blocker open
All round 1 defects marked fixed were verified fixed except D12 and D11, which the implementer declared not done (both Trivial).

## Status per round 1 defect
| # | Status | Evidence |
|---|---|---|
| D1 Major | FIXED | Push-up on 3M/6M/1Y/All: Latest, Personal best (Feb 5, 2025), Sessions 44, Change since first (+4, +33.3%, from Jan 8, 2025) identical; the screen-reader summary and live region identical too; chart points and table rows still follow the range (8/13/25/44); Sessions tile adds "8 in this range" etc. |
| D2 Minor | FIXED | Error with empty cache: banner + Retry, no "Loading…"; Retry moves focus to title and recovers. Offline with empty cache: "You are offline, and no history is saved on this device yet." in both banner and card. Paused with 0 loaded: banner only, no "no history" claim; Resume works. |
| D3 Minor | FIXED, with a side effect (N1) | `cap=7`, default size: 86/86 workouts, 36 list calls, `complete=true`. `cap=2`: 86/86 (184 list calls), `saturated`, never complete, warning "Some history may be missing..." shown; correct, because the fixture really has a two-workout day. |
| D4 Minor | FIXED, trade-off acceptable | Within 24 h of the last full walk: a stale workout dated in the newest window is purged, an older stale one (2025-03-02) stays. After `fullAt` is aged 25 h: the older one is purged and `fullAt` renewed. A workout deleted elsewhere can linger up to 24 h in older years; acceptable for a chart (no data is lost, the next daily walk fixes it). |
| D5 Minor | FIXED | Resume/Retry: focus to title. Unit switch with a range button focused: focus stays on that button and the Data table stays open. Language switch with summary focused: focus stays on summary, table open. |
| D6 Minor | FIXED | Link is primary colour, underlined, chevron 18 px; 44 px high at 320 px (and on coarse pointers), 32 px on desktop mouse widths (above the WCAG 2.2 minimum). |
| D7 Minor | FIXED | `docs/exercise-progress-impl-notes.md` committed; flags, contract and decisions match what was observed (all-time summary, saturated state, daily full walk, retry, focus). It still says "45 keys per pack"; cosmetic. |
| D8 Trivial | FIXED | One session: change tile shows "—", aria summary "change since first —". |
| D9 Trivial | FIXED | `.exp-tablewrap` has `tabindex=0`, `role=region`, accessible name (translated), focus ring. |
| D10 Trivial | PARTLY | Paused banner now uses a translated generic message; the error banner still prints the raw server text ("injected failure"); tile dates now use `Intl` (fr "20 oct. 2026", ja "2026/10/20"); tooltip and table keep ISO (documented). |
| D11 Trivial | NOT DONE (declared) | German "3 Mon." wrap at 320 not re-checked; unchanged by the diff. |
| D12 Trivial | NOT DONE (declared) | Documented as harmless. |
| D13 Trivial | WON'T FIX (declared intentional) | Accepted. |

## Regression hunt, new code paths
- Daily full-walk purge: purge only runs after a listing that threw nothing (a failed window rejects the whole enumeration, so nothing is purged) and not when `saturated`. Verified purge scope = `coveredFrom`. Hazard found, see N2.
- "Saturated" state: renders, blocks `complete`, blocks purge, details are still fetched. False positive found, see N1.
- New "n in this range" tile line: correct per range, hidden on All.
- i18n: the 5 new keys exist and differ from English in all 7 packs (script); translated, no raw keys visible in fr and ja screens.
- Layout: 768 px checked for the first time in ja (and fr): 4 stat tiles in a row, no horizontal overflow (scrollWidth = 768), table and chart fine. fr at 768 correct. 320 px: link 44 px, no overflow.
- Console: no JS errors (only injected network failures).
- Observed once and not a defect: the chart animates for about 300 ms after a language/unit re-render, so an immediate screenshot shows a half-grown line.

## New defects
### N1 (Minor) False "Some history may be missing" for tiny histories
`isFull(count, size, maxSeen)` treats any window with at least 2 rows and as many rows as the fullest answer so far as cut. For an account whose busiest window holds exactly 2 workouts that are on the same day (e.g. a new user who trained twice on one day), the walk bisects down to that single day, finds it "full" and flags `saturated`: a wrong warning is shown, the sync is never marked complete (full re-walk every open, 20 list calls) and purge is disabled. Reproduced in node with a two-record same-day listing (saturated true, 21 calls); a third record on another day in the same year makes it disappear (maxSeen 3). Cheap fix: do not flag saturation for a one-day window unless its count equals `size` or the generic cap seen on windows spanning several days.

### N2 (Minor) An empty (HTTP 200, `[]`) listing purges the whole cache
`diffIds([], cache, {coveredFrom})` returns every cached id as stale, and the daily full walk now covers all years, so a single glitchy answer where every window returns `[]` (the plan notes the real API returns `[]` for a bad date or a dismissed account) deletes the cache; it self-heals on the next open (everything is listed and refetched) but the chart is empty meanwhile. Suggested guard: never purge when the whole listing is empty while the cache is not, or when more than half of the cache would be purged.

### N3 (Trivial) "1 sessions"
The summary and aria text use "{n} sessions" with no singular form.

## Updated acceptance table
| AC | Round 2 |
|---|---|
| 1 | PASS |
| 2 | PASS (D1 fixed) |
| 3 | PASS |
| 4 | PASS (D2, D8, D9 fixed) |
| 5 | PASS |
| 6 | PASS (D3 fixed; N1 caveat) |
| 7 | PASS (D4 fixed, 24 h lingering accepted; N2 caveat) |
| 8 | PASS (fr, ja, es, de visually or by DOM; 768 checked; D11 left) |
| 9 | PASS (236 tests) |
| 10 | PASS |

## Still not verified
Real API (`size`, true cap, rate limit, 500-workout first-sync time); reload while offline; IndexedDB-unavailable fallback; browsers other than Chromium; real screen readers; ko, zh, it screens visually (keys verified); ember, tide, graphite screenshots; 500-point chart performance; de at 320 after the round 2 CSS change (not re-shot).

---

# Round 3 final sign-off (commit 7e7d6b2)

Automated: `node --test static/*.test.js` 238 pass / 0 fail (3 runs); external-hosts ok (51 files); theme contrast all pairs pass.

## Verdict: READY. No open Blocker, Major or Minor defect. Open items are Trivial or accepted risks (below).

## Verification
| Item | Result | Evidence |
|---|---|---|
| N1 tiny history | FIXED | Two same-day workouts as the whole history: `saturated` false, `complete` set, purge eligible (node; 21 list calls, a little wasteful but harmless). A genuine 25-row day with `size=25` is still flagged. Browser `cap=2` (the fixture's real same-day pair): 86/86, no warning, banner hidden, `complete=true`. |
| N2 empty/failed listing never purges | FIXED | With `meta.fullAt` aged and a fake stale cached workout: (a) every list answer `200 []` -> cache untouched (87 kept, fake kept); (b) first window OK then HTTP 500 on later windows -> enumeration rejects, fake kept, "Could not refresh. Showing the data saved on this device."; (c) normal full walk -> fake purged, `fullAt` renewed. `diffIds([], cache, {coveredFrom})` returns no stale. |
| N3 singular | FIXED | "1 session / 5 sessions" in en; es 1 sesión; de 1 Einheit; fr 1 séance; it 1 sessione; ja 1回; ko 1회; zh "1 次训练". Used in tile aria summary. |
| D10 | FIXED | Error and paused banners use the translated generic text in all 7 languages (raw server text "raw server text" no longer shown). Tooltip and table dates stay ISO (documented, accepted). |
| D11 | FIXED | German ranges "3 M / 6 M / 1 J. / Alle" on one line, 44 px high, no overflow at 320 px (scrollWidth 320); de at 768 also fine. |
| D12 | Not done, accepted | At most 3 discarded detail responses per leave. |
| D1-D9 regression | PASS | Push-up on 3M/6M/1Y/All: same Latest/Personal best (Feb 5, 2025)/Sessions 44/Change; "n in this range" 8/13/25; table rows follow range. Range button keeps focus after unit switch; table region focusable; D2/D3/D8 states unchanged from round 2. |
| Visual pass ko, zh, it at 768 | PASS | No overflow, labels translated, chart and tiles correct. |
| Themes ember, tide, graphite at 768 | PASS | Chart, tiles, tooltip colours follow tokens; readable (a first ember frame was captured mid theme cross-fade only). |

## Judgement on the SATURATION_FLOOR (20) residual risk: ACCEPTABLE
With a server cap below 20, caps are discovered across days by bisecting, so history is complete as long as no single day exceeds the cap. A day with more workouts than a sub-20 cap would be truncated silently (no warning) and, on a full walk, the cached workouts of that day that the truncated answer omitted would be purged and not refetched until the next listing returns them. That needs both an unusually low upstream cap and more workouts in one day than the cap; real users rarely do more than a handful of workouts a day and the real cap (50 or `size`) is far above 20. Not a defect; revisit once the real API cap is probed.

## Remaining open items (none blocking)
- Trivial: D12 (discarded late detail responses); tooltip/table dates are ISO.
- Trivial: for tiny same-day histories the walk makes ~21 list calls (efficiency only).
- Accepted: SATURATION_FLOOR residual risk above; stale workouts can linger up to 24 h (round 2).

## Final acceptance table
AC1-AC10: PASS.

## Still not verified
Real API (`size`, true cap, rate limit, 500-workout first-sync time); reload while offline; IndexedDB-unavailable fallback; browsers other than Chromium; real screen readers; 500-point chart performance; touch hover.

---

# Round 4 final re-verification (commits d021494, 53628b9: one wide list call)

Automated: `node --test static/*.test.js` 233 pass / 0 fail (3 runs; fewer tests than round 3 because the windowing tests were removed with the code), external-hosts ok, theme contrast all pairs pass.

## Verdict: READY, with 1 Minor risk accepted on the basis of the measured API (N4), 1 Minor (N5) and 1 Trivial (N6) the owner can fix or defer
No Blocker or Major.

## Verified in the browser (fixture :8821, stub :8822)
| Scenario | Result |
|---|---|
| First sync | Exactly one list call `startTime=1990-01-01 00:00:00&endTime=2100-12-31 23:59:59&size=5000`, then 86 detail calls; progress "9 of 86" at 300 ms; `meta {complete:true}` |
| Second open | Stats render within 80 ms from cache; exactly 1 list call, 0 detail calls |
| Pause (503 on details) and Resume | Paused with generic translated message, Resume completes 86 |
| Leave mid-sync and resume | 30 cached at leave, no requests after leaving, resume fetched exactly the missing 56 |
| 429 with `Retry-After: 2` on the list call | Waited 2 s per retry (2 injected 429), message shown, synced afterwards |
| Offline with cache | Banner and chart from cache |
| Single list call failing (HTTP 500 every attempt, cache present) | 5 attempts, status "stale", "Could not refresh. Showing the data saved on this device.", cache (86) and chart intact, recovers on the next open. Empty cache: error banner + Retry (round 2/3 behaviour, unchanged) |
| Logout wipe | All `myinnox1-progress-*` DBs and the registry key removed (21 DBs to 0) |
| Fallback `#size=7&cap=7` | 47 list calls, 86/86, not saturated, no warning, `complete:true` |
| Fallback `#size=2&cap=2` | Same-day pair is a full single day: `saturated`, warning "Some history may be missing", `complete:false`, 86 loaded; a fake cached workout is NOT purged |
| Purge | Fake cached workouts dated 2026-03 (recent), 2024-01 and 2012-06 (old, far outside any window) are all purged on the next normal sync |
| Empty listing (200 `[]`, and `data:null`) with a cache | Nothing purged, status done. With an empty cache and `#emptylist`: "No history for this exercise yet" |
| Failed listing | Throws before the diff: nothing purged (above) |
| Regression D1-D13, N1-N3 that still apply | D1 identical Latest/Personal best/Sessions/Change on 3M/1Y/All with "n in this range"; D2, D5, D8, D9, D10, N3 unchanged (tests + spot checks); the earlier windowing items (D3/D4/N1/SATURATION_FLOOR) no longer exist |

The old `#cap=N` alone no longer triggers any fallback (the client asks for 5000 and a cap of 7 is not detected). By design and consistent with the measured API (no cap); acceptable, but see N4 for the consequence.

## Defects
### N4 (Minor, accepted given the measurement; a guard is advisable) An undetected server cap now silently purges the cache
Repro: sync fully (86 cached), then make the server cap list answers at 7 without the client knowing (`/ep/_config?cap=7`, default size 5000) and reopen: the listing has 7 rows (not "full"), is treated as complete, `diffIds` marks the other 79 cached workouts as deleted and purges them; the chart shows 7 sessions with no warning. It self-heals as soon as the server answers fully again (next open refetches all 86), so nothing is permanently lost, but the user would see the history shrink and re-download. Before round 4 an unknown cap only truncated new data; now it also deletes old data. Given the live measurement (size honoured up to 5000+, no cap) this is a hypothetical upstream regression, so acceptable; a cheap guard would be to skip the purge when the listing is smaller than, say, half the cache (or smaller than the cache by more than N rows) and show the warning.

### N5 (Minor) More than 3 requests in flight at the start of a first sync
`/ep/_stats.maxInFlight` is 4 on a first sync: the fire-and-forget `fetchLibrary` (second call, `?custom=true`) overlaps the first three detail calls now that the listing takes a single quick call. Acceptance 6 and the plan say never above 3. Impact is one extra light request once per 24 h, so it cannot trigger the WAF, but it breaks the literal rule; await the library fetch before the pool or count it in the gate.

### N6 (Trivial) Implementation notes still describe the removed windowing API
`docs/exercise-progress-impl-notes.md` line 24 lists `isFull(count,size,maxSeen)` and `enumerateRecords -> {rows, coveredFrom, windows, calls, saturated, maxSeen}`; the code now has `isFull(count,size)` and `{rows, coveredFrom, calls, saturated}`. The Sync/Purge paragraphs, deviations, stub flags and the plan answers 3-4 are accurate and match the code. Plan answer 5 (first-sync cost) is unchanged and still correct. No dead i18n keys (all 48 keys are used; "View progress of {name}" is used by the report), no dead CSS classes, no leftover references to windows, `SATURATION_FLOOR`, `fullAt`, `KNOWN_CAPS`, `MIN_YEAR`.

## One-big-call risk assessment
- Size: a 542-row answer took about 1.4 s live (per the plan notes). Rows in the list carry no `extData`, roughly 0.5 KB each, so even 5000 rows is a few MB of JSON; parsing and the `Map` are trivial compared with the detail fetches.
- Time: extrapolating linearly 5000 rows could approach the 20 s proxy timeout (`functions/api/[[path]].js`, `TIMEOUT_MS = 20000`), but 5000 workouts is more than 13 years of daily training; with a realistic 500-2000 rows the call is 1.5-6 s. If it did time out the proxy answers an error status, which `withRetry` treats as retryable (5 attempts, with waits), then the UI falls back to the cached data ("Could not refresh...") or, with an empty cache, to the error banner with Retry (verified with HTTP 500). A user with >5000 workouts would hit the exactly-`size` bisect fallback (day windows), which stays correct, only slower.
- Failure: verified above; a failed or timed-out single call never purges and never blanks the chart.

## Updated acceptance table
AC1-AC10: PASS (AC6 with the N5 caveat; AC7 purge now immediate and verified for recent and old workouts).

## Still not verified
Real-API behaviour of the final client (a live 5000-row call and the real proxy timeout), the WAF 429 threshold; reload while offline; IndexedDB-unavailable fallback; browsers other than Chromium; real screen readers; 500-point chart performance; touch hover.

---

# Round 5 re-verification (commits 8d0d0d0, 0fc5d5f, 075e27d, a8cefed: WAF pacing, N4-N6)

Automated: `node --test static/*.test.js` 241 pass / 0 fail (3 runs), external-hosts ok, theme contrast all pairs pass.

## Verdict: READY. No Blocker or Major. One new Minor (N7) and some Trivial items, none blocking.

## Pacer core review (ad-hoc node runs with an injected clock, sleep and random)
- Rolling window: with 40 entries at t=0, `waitMs` is 10000 at 0, 1 at 9999, 0 at 10000 (entries exactly 10 s old drop out). Correct at the boundary.
- 200 paced acquires interleaved with 1 unpaced UI record per 5: sync never above 4 per 1 s. Sync plus UI peaked at 41 per 10 s: UI calls are counted but never held back, so they can push the total 1 over the 40 budget. That is by design and far under 60.
- Block: cooldown = max(Retry-After, 10 s) + jitter. Measured 11.0 s with random=0, 13.0 s with random~1, and 32 s with `Retry-After` 30 s, so jitter stays within 1-3 s. After the block: half rate, at most 2/s and 20 per 10 s. The first acquire after the block comes exactly when the cooldown ends.
- A 429 from a request that started before the current block is treated as a `repeat` and does not count as a second block. A real second block returns `second: true` and halts the pacer.
- Memory: the shared log trims entries older than 60 s on every record. At 1000 records per second the log holds 60,000 entries. At realistic rates it is under 100.
- HTML 429: `api()` already wraps `res.json()` in try/catch. A forced block makes an HTML 429 reject with `HTTP 429`, `status 429`, `body null`, on both a forwarded and a stub-answered route. Every other screen goes through `api()`, which is the only `fetch("/api…")` in `static/`, so no screen can crash on JSON parsing.

## Browser with the fixture limiter on (`#waf=60:10:10`, HTML 429, no Retry-After)
| Scenario | Result |
|---|---|
| Full first sync (86 workouts, latency 60 ms) | 14 s, no block, limiter peak 42 per 10 s (sync 40 + 2 other calls), progress 4/s, max in flight 3 |
| Page load + History + report + switching Fitness/Plans/Programs/History while a sync starts | Peak 46 per 10 s, no block. Leaving the History screen stops the sync by design, so other screens cannot run alongside it in the same tab. |
| Forced block mid-sync (`/ep/_waf?block=10`) | Countdown "Waiting 12 s (rate limit)" ticking 12, 11 … 1. The request log shows NO request between the 429 and the end of the cooldown (next request exactly 12.0 s later). Then half rate (2 per second), sync completes. |
| Second block in the same sync | Paused within 1 s, countdown also shown in the paused banner, no request sent while paused. Resume during the cooldown waits it out ("listing, Waiting 6 s…"), then completes. |
| Two tabs, same account | Second tab shows "Syncing in another tab" with its cached chart; when the first finishes it re-reads the cache and runs one list call, 0 details. Limiter peak 46 per 10 s with no block. The second tab had no `#waf` flag, so its stub-answered page-load calls were not counted; the true peak is a few higher, still under 60. |
| Syncing tab closed mid-sync (9 of 86 cached) | The waiting tab took the lock within 1 s and completed the sync (86), at the pacer rate. |
| `navigator.locks` undefined | Syncs normally (86). |
| N4: server cap 7 against 86 cached | No purge (86 kept), `meta.purgeSkipped {stale:79, cached:86, listed:7}`. Real deletions: 3 stale (recent, 2013, 2025) purged. 18 stale of 104 purged (under the 20 % limit). |
| N5 | `maxInFlight` 3 on every first sync (library awaited through the pacer) |
| Regression | First sync, second open (1 list, 0 details), pause/Resume, offline banner, clearAll wipes all DBs, D1 summary identical on 3M/All with "8 in this range". No console errors other than injected 429s. |
| i18n | "Waiting {s} s (rate limit)" and "Syncing in another tab" translated in es, de, fr, it, ja, ko, zh |
| Countdown at 320 px (de) | "Warte 11 s (Anfragelimit)" fits on one line with the progress bar, no overflow (scrollWidth 320) |
| N6 docs | Impl notes and plan answer 4 match the code (PACE values, cooldown formula, half rate, second-block pause, Web Locks, purge guard, fixture limiter flags). |

## Judgements
- **Two-tab peak 46 per 10 s (over the 40 budget, under 60): acceptable.** The 40 budget is per tab by design (the log is in memory), and Web Locks lets only one tab sync, so the excess is the other tab's own UI calls, which are rare bursts. Another device behind the same IP can still push the total over 60. That case is handled: the 429 cooldown, then half rate, then a pause on the second block. A tab-wide budget cannot see other devices anyway.
- **Resume restarts at full rate** (new pacer per sync) while honouring any remaining cooldown. Acceptable: at worst it is blocked again and pauses again after two blocks.

## New defects
### N7 (Minor) A genuine bulk deletion elsewhere is never purged
The N4 guard skips any purge above max(5, 20 %) of the cache, and every later sync sees the same ratio. If a user deletes, say, 30 of 100 workouts in the official app, those 30 stay in the charts until logout, with no UI hint (only `meta.purgeSkipped`). Suggest: allow the purge when two consecutive full listings (minutes apart, or on the next day) agree on the same stale set, or when the listing is not suspiciously round (not 50/100/size).

### N8 (Trivial) Rate-limit UX details
- A pause caused by the second block says "The server is busy or unreachable", not "rate limit".
- A 429 received by another screen (e.g. dashboard Refresh) does not start the tab cooldown. The sync learns of the block only from its own next 429, which costs one blocked request.
- The "Syncing in another tab" view does not update progressively.
- The countdown text is not in a live region.

## Updated acceptance table
AC1-AC10: PASS. AC6 is now met strictly: max in flight 3 and no request during a block.

## Still not verified
- The real Cloudflare behaviour: the exact counting (sliding or fixed window), whether requests during a block extend it, the body and headers of a real block, and clock skew between the client log and Cloudflare.
- Two devices behind one IP.
- Background tabs where browsers throttle timers (the pacer may run slower there, never faster).
- A real 5000-row listing.
- Reload while offline, the IndexedDB fallback, browsers other than Chromium, screen readers.

---

# Round 6 final check (commits c10910e, 6d4e43b: N7, N8)

Automated: `node --test static/*.test.js` 246 pass / 0 fail (3 runs), external-hosts ok, theme contrast all pairs pass.

## Verdict: READY. No Blocker, Major or Minor open; two Trivial items (N9, N10).

## N7: large purge needs confirmation. FIXED
Core review (`decidePurge`, ad-hoc node with explicit times, 30 stale out of 100 cached):
- First sighting: nothing purged, pending set stored with `seenAt`.
- At +5 min: still pending, same `seenAt`. At +10 min: all 30 purged and the pending set cleared.
- Partial overlap where one id is listed again: the pending set is dropped. The remaining 29 become a new pending set with a new `seenAt`, so the 10-minute clock restarts.
- Pending set plus 2 new stale ids at +11 min: 32 purged (30 confirmed plus 2 small).
- Pending set plus 30 new stale ids at +11 min: the confirmed 30 are purged and the new 30 become pending.
- No ids missing: pending cleared.
- A small subset still missing (3): purged at once.
- Clock moved backwards: nothing is purged, pending is kept and waits until the clock passes `seenAt` + 10 min. Safe.
- Garbage ids are filtered out.
- A non-numeric `seenAt` in meta is treated as old and purges at once (N10, Trivial: only the app writes this meta).

Wiring: `decidePurge` runs only for a non-saturated, non-empty listing that did not fail (a failure throws earlier). The pending set lives in the per-account IndexedDB `meta` store. A second account had no pending set while the first had 30, and the logout `clearAll` removed every DB.

Browser (limiter on):
| Case | Result |
|---|---|
| Upstream cap 7 seen once (86 cached) | Nothing purged, 79 pending. The next normal listing brings them back and the pending set is cleared (86 kept). |
| Real bulk delete (30 cached workouts no longer listed, 116 cached) | First sync: pending 30, nothing purged. Immediate second sync: same `seenAt`, nothing purged. With `seenAt` aged 11 min: purged (86). |
| Small deletion (3) | Purged at once |
| Empty listing (200 `[]`) with a matured pending set | Nothing purged, pending kept (116 / 30) |

## N8: rate-limit UX. FIXED
- A 429 seen by a non-sync `api()` call (`/app/getInfo` during a forced block, progress screen closed) starts the tab cooldown (11.4 s). Opening the screen then shows "Waiting 12 s … 1 s (rate limit)". The first sync request goes out 11.4 s after the UI 429, so none was sent during the cooldown.
- Second block: the banner reads "Sync paused: the server's rate limit was reached. Resume when the countdown ends." together with the countdown and Resume. The new key is translated in all 7 packs.
- Live region: a separate `aria-live=polite` node (`.exp-sync-live`); the visual banner has no live attribute. During one full cooldown it changed only 3 times (start, "Waiting 5 s", resume), and the paused and "Syncing in another tab" states were each announced once. Not spammy.
- Waiting tab: re-read the cache every 5 s. Cached workouts went 5, 25, 45, 65 while the other tab synced.

## Quick regression (limiter on)
- First sync 86 workouts: 24.6 s, limiter peak 40 per 10 s, no block, max in flight 2-3.
- Second open: exactly 1 list call.
- Small-deletion purge works.
- `clearAll` (logout) removed all DBs.

## New trivial items
- **N9 (Trivial):** when a cooldown ends during the listing phase, the live region announces "Syncing your history… 0 of 0". It should say "Looking up your workouts…".
- **N10 (Trivial):** a corrupted non-numeric `purgePending.seenAt` confirms a pending purge at once instead of restarting the wait.

## Final acceptance table
| AC | Final |
|---|---|
| 1 Tap an exercise, Back to the same report | PASS |
| 2 Chart, ranges, tooltip, all-time summary | PASS |
| 3 Combined / Per side / weightless labels | PASS |
| 4 Empty, single, table alternative, announcements | PASS |
| 5 First sync, cache, leave/resume, offline | PASS |
| 6 Pagination fallback, retry/backoff, concurrency ≤ 3, WAF pacing | PASS |
| 7 Logout wipe, per-account isolation, deleted workouts leave the index (with confirmation for large purges) | PASS |
| 8 7 languages, kg/lb, themes, 320/768/1280 | PASS |
| 9 Tests, external hosts, contrast | PASS |
| 10 Fixtures, routes, stub | PASS |

## Still not verified
- Real Cloudflare counting and block behaviour.
- Two devices behind one IP.
- A real 5000-row listing.
- Background-tab timer throttling.
- Reload while offline and the IndexedDB fallback.
- Browsers other than Chromium; real screen readers.
