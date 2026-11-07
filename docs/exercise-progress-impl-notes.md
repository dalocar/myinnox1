# Exercise Progress: implementation notes (Phase 1)

Spec: `docs/plan-exercise-progress.md` (issue #9). Phase 1 only: Training Report -> Exercise Progress screen. QA findings: `qa/exercise-progress-qa-report.md`.

## Files
| File | Role |
|---|---|
| `static/exercise-progress-core.js` (+ `.test.js`) | Pure logic, UMD `ExerciseProgressCore`. No DOM, no IndexedDB. |
| `static/exercise-progress.js` | DOM, API calls (through the app's `api()`), IndexedDB cache, Chart.js. Global `ExerciseProgressUI`. |
| `static/exercise-progress.css` | Theme tokens only (`theme-core.test.js` scans it for colour literals). |
| `static/activity-report.js` | Each exercise name is a link-button (`.rp-group-link`: primary colour, underline, chevron, 44 px high on narrow/touch) calling `ExerciseProgressUI.open`; Back returns to the same report (state, scroll, focus kept). |
| `static/app.js` | `api()` errors carry `err.status` and `err.retryAfterRaw` (non-2xx only). Logout wipes the progress cache first (max 2 s wait). `deleteRecord` calls `forgetWorkout`. |
| `static/activity-dashboard.js`, `activity-explorer.js` | Delete calls `forgetWorkout`; sibling lists include `#ex-progress`. |
| `static/index.html` | `#ex-progress`, CSS link, the two scripts. |
| `static/i18n.js` (es, via `Object.assign` in the UI file), `i18n-{de,fr,it,ja,ko,zh}.js` | 45 keys per pack; a test checks every `t()` key exists everywhere. |
| `qa/fixtures/exercise-progress/*.json`, `qa/make-exercise-progress-fixtures.js` | 86 deterministic workouts (2025-01-08 .. 2026-10-21) and action lists. |
| `qa/exercise-progress-routes.js`, `qa/fixture-server.js` | Fixture routes under `/ep/`, failure injection, stats. `PORT` env (default 8799). |
| `qa/exercise-progress-stub-init.js`, `qa/serve-with-stub.js` | Stub fetch + fixed clock; tiny server injecting the stub. |

## Core contract (`ExerciseProgressCore`)
- `summarizeWorkout(detail)` -> `{v, recordId, startTime, date, exercises:{[actionId]:{actionName, maxWeight (tenths), repsAtMax, bestCount, sets, wsets, reps}}}` or `null`. Sets with `count <= 0` ignored; `weight <= 0` never counts as weight. Heaviest set wins, ties go to more reps.
- `buildSeries(index, actionId, {range, today, mode})` -> `{name, kind: weight|reps|seconds, modeKey, showTotal, hasAny, isEmpty, isSingle, points[...], summary}`. **`summary` is all-time** (`latest`, `best` with earliest date on ties, `first`, `sessions`, `change{abs,pct}` from the first ever session) and carries `rangeSessions`; only `points` follow the range (3M/6M/1Y/All, calendar-month cutoffs). `summary` is null only when the exercise has no data at all.
- `kindFor(mode, hasWeight)`: sideNum 0 -> reps (seconds if countType 2); 1/2 -> weight; unknown -> weight only if a weighted set exists.
- Sync helpers: `makeWindow/allWindow/bisectWindow/isFull(count,size)`, `enumerateRecords({fetchWindow,size})` -> `{rows, coveredFrom, calls, saturated}`, `diffIds`, `purgeAllowed(stale,cached)`, `retryDelay`, `parseRetryAfter`, `isRetryable`, `isTransport`, `withRetry(fn,{..., isRetryable, delayFor})`, `makeGate`, `runPool`, pacing: `PACE`, `makeRequestLog(now)`, `requestLog` (shared singleton), `makePacer({log, now, sleep, random})` -> `{acquire, block, waitMs, halt, isHalf, blocks, cooldownLeft}`; `accountKey/dbName`, `exerciseOptions` (Phase 2).

## Behaviour and decisions
- **Mode join**: `/action/list` + `?custom=true` -> `{sideNum, countType}`, cached 24 h in the `meta` store. Unknown action: no label, stored value charted. Combined: charted value per cable ("Load per cable"), tooltip adds Total via `WeightModeCore`; Per side: "Weight".
- **Kind is decided at view time**, not at sync time (plan had `summarizeWorkout(detail, modeLookup)`).
- **Summary stats are all-time** (QA D1): Latest, Personal best, Change since first and Sessions ignore the range; the Sessions tile adds "{n} in this range" for 3M/6M/1Y. With one session the change tile shows an em dash. The change is computed from tenths of kg and then converted, so in lb it can differ by 0.1 from the difference of the two displayed values (QA D13, intentional).
- **Sync**: ONE wide list call per sync (`startTime` 1990-01-01 00:00:00, `endTime` 2100-12-31 23:59:59, `size=5000`; format `yyyy-MM-dd HH:mm:ss`), based on live measurements: `size` honoured without cap, newest first, unlimited depth, no paging. Diff against the cache, fetch missing details newest first at concurrency 3, save each immediately (resumable), render progressively. **Safety net only**: if the answer has exactly `size` rows the window is bisected by day (newest half first); a single day that is still full sets `saturated`: the sync is not marked complete, nothing is purged and the screen warns "Some history may be missing". (The earlier year-by-year windows, the "fullest answer seen" cap heuristic, `SATURATION_FLOOR`, empty-year stop and the daily full walk are gone.)
- **Purge**: every successful, non-empty, non-saturated listing removes cached workouts that are no longer listed (deleted elsewhere), so there is no 24 h lag. An empty listing (a 200 with `[]`) or a failed one never purges. **Guard (N4)**: a purge that would remove more than max(5, 20 %) of the cached workouts in one sync is skipped and logged in the `meta` store (`purgeSkipped: {at, stale, cached, listed}`), e.g. an upstream cap of 7 against 86 cached; deleting 1-3 workouts elsewhere still purges.
- **WAF pacing** (owner-confirmed Cloudflare rule: per IP, 60 requests per 10 s, Block for 10 s; covers every /api call of every screen, tab and device behind the IP; a block is HTTP 429, likely an HTML body, likely no Retry-After). Every sync request (library, listing, details) goes through a pacer: at most 4 sync requests in any 1 s and at most 40 requests in any rolling 10 s, counted against a shared in-memory log that `api()` in `app.js` feeds with EVERY request of the tab (UI calls are counted, never throttled), leaving 20 per 10 s for the rest of the app and other devices. Concurrency stays 3; the library fetch is awaited through the same pacer before the listing, so in-flight never exceeds 3 (N5). Any HTTP 429, whatever its body, is a block: tab-wide cooldown of max(Retry-After, 10 s) + 1-3 s random jitter with no sync request sent, shown as "Waiting N s (rate limit)" (countdown in the progress and paused banners); then half rate (2/s, 20 per 10 s) for the rest of that sync; a second 429 in the same sync (from a request started after the first block) pauses the sync (Resume). Measured with the fixture limiter: a full first sync of 86 workouts peaks at 40 requests per 10 s (about 22 s), no block.
- **Multi-tab**: one tab syncs at a time (`navigator.locks.request("myinnox1-ep-sync", {ifAvailable: true})`). Other tabs read the cache, show "Syncing in another tab", wait for the lock, then re-read the cache and run their own (normally one list call, no details) sync. Without Web Locks every tab syncs on its own. The request log is per tab: two tabs share the 20/10 s headroom (measured peak 46 per 10 s with two tabs, no block).
- **Retry** (non-429): HTTP 408/5xx, network errors and envelope `code != 200`: first attempt plus 4 retries (1, 2, 4, 8 s, `Retry-After` wins, cap 120 s) with a shared cooldown. After that transport trouble pauses the sync (Resume); an envelope error skips the record; 5 failures in a row also pause.
- **Empty-cache states** (D2): error, offline and paused replace "Loading…" in the chart card; offline with nothing saved says so; paused never claims "no history".
- **Focus** (D5): after Resume/Retry focus moves to the title; unit and language switches keep the open data table and refocus the same range button.
- Leaving the screen stops the sync; in-flight results are dropped. Offline (`navigator.onLine === false`) skips the sync and shows the cache.
- Storage: IndexedDB `myinnox1-progress-<hash of email>` (stores `workouts`, `meta`), in-memory fallback; DB names tracked in localStorage `myinnox1_progress_dbs` so logout deletes all.
- Chart: Chart.js 4.4.1 line chart on a linear x axis, recreated on data/theme/language/unit change. Text alternative: canvas `aria-label` with the all-time summary, a polite live region, and a `<details>` data table (scroll container is focusable, `role=region`, named). Dates in tiles use `Intl` for the UI language; tooltip/table keep ISO. Server text is no longer shown in the paused banner.
- QA hooks: `window.__EP_LIST_SIZE`, `window.__EP_RETRY_SCALE`. Fixture limiter: env `EP_WAF=60:10:10`, `/ep/_config?waf=60:10:10|off`, `/ep/_waf?block=10` (force a block), stub flag `#waf=60:10:10`; `/ep/_stats.waf` reports `peak` (most requests in any rolling window), `blocked`, `blocks`. Requests the stub answers itself are counted via `/ep/_hit`; calls from another tab without `#waf` are counted only when forwarded.

## Deviations from the plan
1. `summarizeWorkout(detail)` has no `modeLookup`; kind is resolved in `buildSeries`.
2. One wide call (plan said 12-month windows) after the live API measurements; bisect is only a fallback when the answer is exactly `size` rows.
3. "Max 4 tries" implemented as first attempt plus 4 retries.
4. `api()` in `app.js` attaches status and Retry-After to errors.
5. `PORT` env in `qa/fixture-server.js`.
6. Summary stats are all-time rather than range-scoped (QA D1).
7. Client-side WAF pacing and single-tab sync (owner-confirmed WAF rule, not in the original plan).

## Known gaps
- Measured live: `size` honoured, no cap, no paging, unlimited depth, no throttling of detail calls up to ~12.5 req/s. Still unverified: the WAF 429 threshold on the owner's zone and the Combined x2 total on the machine.
- Cached exercise names keep the language of the sync; the title uses the name passed from the report.
- Report -> progress -> Back does not reload the report.
- Not done: late detail results are discarded after leaving (harmless); tooltip/table keep ISO dates.
- No automated browser tests; verification was manual in the Browser pane.

## Running it (QA)
```
PORT=8831 node qa/fixture-server.js
PORT=8832 node qa/serve-with-stub.js
open http://localhost:8832/#fxport=8831
```
History -> "Upper A" -> tap an exercise. Exercises: 512 Chest Fly (Combined), 530/531 Row R/L and 570 Hammer Curl (Per side), 561 Push-up (reps), 560 Plank (seconds), 9001 custom (Combined), 777 in no library. Same-day pair on 2026-10-20. Stub flags (hash, `&`-separated): `imperial`, `now=`, `email=`, `size=7&cap=7` (bisect fallback; `size=2&cap=2` for a saturated day), `latency=`, `fail=429:5[:route[:retryAfter]]`, `retryscale=0.05`, `nolibrary`, `offline`, `fxport=`. Server: `/ep/_stats`, `/ep/_reset`, `/ep/_config?latency=&cap=`, `/ep/_fail?...`; env `EP_FAIL`, `EP_LATENCY_MS`, `EP_LIST_CAP`. Clear the cache with `await ExerciseProgressUI.clearAll()` before a first-sync scenario. Injected `route=detail` failures also hit the report's own detail call.
