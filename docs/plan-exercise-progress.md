# Plan: Exercise Progress (max weight per exercise over time)

Issue: dalocar/myinnox1#9. Target repo: this one (myinnox1, public). Phase 1 only in the first pass.

## Answers to the open questions

Evidence: live API probes of 2026-11-07 with the old bearer (read-only), saved record details in `old-account-backup/`, `weight-mode-core.js`, `docs/plan-sideweight.md`. The native INNODIGYM app was NOT inspected (the user declined access), so machine-readout claims stay unverified.

1. **Per side or combined?** The stored `weight` in a set is the number the official editor shows. For `sideNum` 1 (Per side) it is the load of one cable. For `sideNum` 2 (Combined) it is the load PER CABLE; the machine's workout screen shows the total (2x). This second part is inferred, not machine-verified (see `plan-sideweight.md`). Decision: chart the stored value and label it by mode through `WeightModeCore` ("Load per cable" for Combined, "Weight" for Per side), reuse `breakdown()` to show the total in the tooltip for Combined only. If the machine check later disproves the 2x, the total line disappears in one place. **`/sport/record/detail` set rows carry no `sideNum`**, so the mode must be joined from the action library (`/action/list` plus `/action/list?custom=true`), cached next to the index. Unknown action: no label, chart the stored value.
2. **Warm-ups and deloads.** Chart the heaviest set of each workout, no threshold (a deload is real data; hiding it would mislead). Sets with `count <= 0` or `weight <= 0` are ignored. `sideNum` 0 exercises are NOT charted by weight: probes show they still carry a stale default `weight` of 50 (5 kg) with `countType` 2 (timed). Chart best `count` (reps, or seconds when `countType` is 2) instead. Left/Right variants are separate `actionId`s (e.g. Seated Single-Arm Row (L)/(R)); keep them as separate exercises in Phase 1.
3. **Is `size` honoured, how far back?** MEASURED on the real API (2026-11-07, 542 inserted workouts, since deleted): `size` is honoured with no cap (500 -> 500, 501 -> 501, 1000 and 5000 -> all 542; omitting `size` also returns everything); results are newest first; no paging parameter works (page, pageNum, current, offset are ignored); history depth is unlimited (a 2010 record came back from a 1990..2100 range); a 542-row list call takes about 1.4 s. The format `yyyy-MM-dd HH:mm:ss` works, and date-only `startTime`/`endTime` also work (the earlier note that a bare date returns nothing was wrong). Decision: ONE wide list call per sync (1990-01-01 00:00:00 to 2100-12-31 23:59:59, `size=5000`). Safety net only: if the answer has exactly `size` rows, bisect the window by day (older plan: 12-month windows); a one-day window that is still full is reported as possibly incomplete.
4. **Rate limit.** MEASURED: upstream did not throttle detail calls at 3, 6 or 10 concurrency (up to about 12.5 req/s); earlier gentle tests agreed (~0.8 s per call). The WAF rule on the owner's Cloudflare zone is still unreadable from here. Decision unchanged: concurrency 3, HTTP 429/5xx and `code != 200` retryable with exponential backoff (1, 2, 4, 8 s, `Retry-After` honoured), then pause and let the user resume. No background warm-up until the owner confirms the WAF threshold (Phase 3).
5. **First-sync cost.** 500 workouts at ~0.8 s and concurrency 3 is about 2.5 minutes. Acceptable if: newest workouts first, the chart renders as data arrives, progress is visible, the user can leave and the sync resumes next time, and nothing blocks other screens.

## Corrections to the issue

- `scripts/check-external-hosts.js` exists in this repo (not in the private `webapp` repo) and passes today. It has no rule against `indexedDB`, so IndexedDB is accepted; keep it passing.
- The Training Report lives in `static/activity-report.js` (exercise rows rendered from `ActivityCore.groupSets`).

## Architecture

- `static/exercise-progress-core.js` (pure, UMD `ExerciseProgressCore`, no DOM, no IndexedDB): 
  - `summarizeWorkout(detail, modeLookup)` -> `{recordId, date (local YYYY-MM-DD from startTime), startTime, exercises: {[actionId]: {actionName, kind: "weight"|"reps"|"seconds", best: {weight (tenths) , count}, sets, reps}}}`.
  - `buildSeries(index, actionId, {range, today})` -> points, summary (latest, personal best + date, sessions, change since first), `isEmpty`, `isSingle`.
  - `listWindows(now, earliest)` / `bisectWindow(...)`, `diffIds(listRows, cachedIds)`, `retryDelay(attempt, retryAfter)`, `exerciseOptions(index)` for the later list.
  - Everything tolerant to null/garbage like `activity-core.js`. Dates via `ActivityCore`-style UTC maths, never `toISOString()`.
- `static/exercise-progress.js` (DOM + API + IndexedDB): store `myinnox1-progress-<accountKey>` with stores `workouts` (key `recordId`) and `meta`; scheduler with concurrency 3; progress UI; chart (Chart.js, vendored) plus a visible data table as text alternative; offline works from the cache. `ExerciseProgressUI.open(actionId, {name, onBack})`.
- Wire-up: each exercise heading in the Training Report (`activity-report.js`) becomes a tappable control calling `ExerciseProgressUI.open`; new container in `index.html`; scripts added next to the activity scripts.
- Cache lifecycle: scoped by account (hash of the profile id/email, not stored raw), wiped on logout (`app.js` logout handler), a workout is removed from the index when deleted in the app. Finished workouts are immutable, so no invalidation.
- i18n: English keys, entries in `i18n.js` (es) and `i18n-{de,fr,it,ja,ko,zh}.js`. Theme tokens only (`themes.css` additions if needed, `exercise-progress.css` has no colour literals; extend the existing literal-scanning test if needed).
- Units: tenths of kg stored, shown through `UnitsCore.fromTenths` with the account unit.

## Phase 1 acceptance criteria

1. Tapping an exercise in a Training Report opens Exercise Progress for that `actionId`; Back returns to the same report.
2. Line chart of max weight per workout, ranges 3M / 6M / 1Y / All (default All), tooltip with date, weight (unit-aware), reps and sets, summary: latest, personal best with date, sessions, change since first (absolute and %).
3. Combined exercises are labelled "per cable" and the tooltip shows the total; Per side labelled plainly; `sideNum` 0 charts reps/seconds with correct labels and no weight axis.
4. Empty state (no data), single-point state, and a table alternative for the chart (accessible, keyboard reachable); chart announces a text summary.
5. First open syncs history newest first with progress bar; cached data renders immediately on the next open; leaving mid-sync is safe and resumes; airplane mode after the first sync still shows the chart.
6. Pagination safe (window bisect when a window returns `size` rows); retry/backoff on 429/5xx; concurrency never above 3.
7. Cache cleared on logout; per-account isolation; deleted workout leaves the index.
8. All seven languages complete; kg/lb switch updates the chart; light/dark and every theme use tokens only; works at 320 / 768 / 1280.
9. `node --test static/*.test.js` green (new `exercise-progress-core.test.js`), `node scripts/check-external-hosts.js` ok, `node scripts/check-theme-contrast.js` ok.
10. Fixtures in `qa/fixtures/` (several workouts with the same exercise over months, Combined / Per side / weightless, an L/R pair, a deload dip, a custom action, a duplicate-date pair), fixture-server routes and a stub-init script so QA runs without the real API.

## Phases (unchanged from the issue)

Phase 2: History-tab exercise list with search. Phase 3: Program editor icon, background warm-up (blocked on the WAF threshold).

## Orchestration

1. Implementation agent: builds Phase 1 in this worktree (branch `feat/exercise-progress`), writes `docs/exercise-progress-impl-notes.md`, commits.
2. QA agent: independent, writes `qa/exercise-progress-test-plan.md`, runs unit tests and drives the app in a browser against the fixture server (320/768/1280, en/es, kg/lb, dark theme, offline, interrupted sync, 429 injection), writes `qa/exercise-progress-qa-report.md` with numbered defects by severity. Does not edit product code.
3. Loop: implementation agent fixes all Major+ and agreed Minor defects, QA re-verifies, until no open Major/Minor. Cap 4 rounds, then escalate to the user.
