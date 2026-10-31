# Activity: core implementation notes (step 1)

Spec: `docs/plan-activity.md`. This step delivers only the pure core, tests, fixtures, fixture server routes, vendored Chart.js and Postman notes. No UI, no `index.html` change (the Explorer agent adds `<script src="vendor/chart.umd.min.js">` then `activity-core.js` before `activity.js`).

## Files
- `static/activity-core.js` (UMD, `window.ActivityCore`), `static/activity-core.test.js` (24 tests; whole suite 78 green).
- `static/vendor/chart.umd.min.js` (Chart.js **4.4.1** from cdnjs, loads in node, `version` = 4.4.1; minified file carries no banner) + `static/vendor/LICENSE-chartjs.txt` (MIT).
- Fixtures + `qa/fixture-server.js` routes (below). Postman: descriptions added to Statistics list, Badge list, app/statistics, record detail.

## Conventions
- Dates are `"YYYY-MM-DD"` strings (local calendar dates); functions accept a `Date` (local y/m/d are read) or a string (`2026/10/27`, `20261027` also parse). All maths via `Date.UTC(y,m,d)`: DST- and timezone-safe. `localISO(new Date())` gives today. Never use `toISOString()` for dates.
- Units: duration = seconds, kcal, **volume = tenths of kg** everywhere (`realCapacity`, `totalCapacity`, `coreData`, set `weight`). Convert only at display with `kgFromTenths`/`fmtKg`.
- Every function tolerates null/NaN/garbage and returns zeros/empty arrays.

## Contract
```
VIEWS = ["day","week","month","year"]
DEFAULT_TARGET = {targetConsume:500, targetDuration:1800}
GRADE_THRESHOLDS = {bothForS:0.5, consumeForB:0.5}      // PROVISIONAL, see plan
EQUIV = {KCAL_PER_FRIES:296, KCAL_PER_HAMBURGER:790, KG_PER_CAR:1958, KG_PER_EIFFEL:10100000}  // calibrated against the official app video, not public figures

localISO(date) -> "2026-10-29"
addDays(iso, n) -> iso | null ; dayOfWeek(iso) -> 0..6 (0 = Sunday) ; parseDate(x) -> {y,m,d} | null

fmtDuration(sec) -> "HH:MM:SS"            1086 -> "00:18:06"; bad -> "00:00:00"
minutesFromSeconds(sec, decimals=0) -> number   1200 -> 20 ; (1200,1) -> 20.0   // chart y values / display
fmtKcal(k) -> "362" (rounded whole)
kgFromTenths(t) -> number                  70320 -> 7032
fmtKg(t) -> "7032.0"
fmtServings(n) -> "3.2" / "0.0"           always one decimal (servings, towers)
fmtCount(n) -> "8" | "7.6"                 cars: whole if whole else one decimal; >=100 integer

periodRange(view, anchor) -> {view, anchor, start, end, days:[iso], months:[yyyymm]|null, label, key}
   week: Sun..Sat, label "10.25-10.31" (MM.DD-MM.DD, e.g. "12.27-01.02") and ariaLabel "2026-10-25 to 2026-10-31"; month: days 1..N, label "2026-10"; year: days [] and months 202601..202612, label "2026"; day: 1 day.
   unknown view -> day. For the API call use range.start/range.end as startTime/endTime (year: start/end = Jan 1/Dec 31).
shiftPeriod(view, anchor, delta) -> new anchor iso   (month/year clamp the day: Jan 31 +1m = Feb 28/29; Feb 29 +1y = Feb 28)
canShift(view, anchor, delta, {today, maxYearsBack=5}) -> bool
   +: next period must start <= today. -: next period must end >= today-5y (earliest data ignored). Use for disabling the arrows.

pickTarget(dailyList, fallback?) -> {targetConsume, targetDuration}   latest known (by sportDate) with fallback 500/1800
fillDaily(range, dailyList, target?) -> [{date, targetConsume, targetDuration, realConsume, realDuration, realCapacity, realDistance, hasData}]  one per range.days
   missing days: zeros + target (arg, else pickTarget(list)); rows outside range ignored. Works for day/week/month.
fillMonths(yearOrRange, monthList) -> 12 x {yearMonth:"202610", month:1..12, totalConsume, totalDuration, totalCapacity, totalDistance, hasData}

ratios(day) -> {consume, duration}          raw (may exceed 1); takes fillDaily rows or raw API rows; missing/null/<=0 targets fall back to DEFAULT_TARGET (500 kcal / 1800 s), so gradeFor/ringProgress also work on raw rows
ringProgress(day) -> {consume, duration}    clamped 0..1 (draw this)
gradeFor(day) -> "S" | "B" | null           null when no workout that day

equivalents(view, kcal, tenthsKg) -> null (day/week)
   month -> {food:"fries", foodCount, heavy:"cars", heavyCount}
   year  -> {food:"hamburgers", foodCount, heavy:"eiffel", heavyCount}      counts are raw numbers; format with fmtCount.
   Note the 2nd arg is KCAL and the 3rd arg is volume in TENTHS of kg (pass totalCapacity as is).

groupSets(extData) -> [{actionId, actionName, actionNo, picUrl, sets:[{sort, weight, weightKg, count, duration}],
                        totalSets, totalReps, totalDuration, volume (tenths kg), volumeKg}]
   grouped by actionId in order of first set; sets sorted by `sort`; supersets (A,B,A,B) merge per action.
normalizeBadges(data /* response.data */) -> {latest:[badge], all:[badge], groups:[{type,key,unit,badges,received,locked}], receivedCount, total}
   badge = {id,type,key:"consume"|"duration"|"capacity"|"other",unit:"kcal"|"min"|"kg"|"",target,level(1..3 within type),received(strict boolean),
            receiveDate:"2026-10-27"|null, activePic, inactivePic, pic (active if received else inactive), fallbackText:"5000 kg"}
   `latest` keeps server order (9,8,7); `all`/groups sorted by type then target. Use fallbackText when the <img> errors.
```
Typical wiring: `r = periodRange(view, anchor)`; fetch `statisticsType=1` (day/week/month) or `2` (year) with `r.start/r.end`; `rows = fillDaily(r, data.dailyList)` (or `fillMonths(r, data.monthList)`); chart values `minutesFromSeconds(row.realDuration)` / `row.realConsume`; `equivalents(view, data.totalConsume, data.totalCapacity)`.

## Fixtures (`qa/fixtures/`)
`stats-daily-week.json` (25-31 Oct: days 27, 28), `stats-daily-month.json` and `stats-daily-all.json` (Oct incl. 10-24; totals 726 kcal / 2423 s / 143337), `stats-monthly.json` (one row 202610), `stats-empty.json`, `badges.json`, `record-detail-22401.json`, `records-list.json`, `totals.json`. All from real payloads except the days list: 10-27 and 10-28 rows are real; the **10-24 row is derived** (month total minus the two real days: 15 kcal, 121 s, 2500 tenths-kg, default targets) because the real daily payload was never saved.

`node qa/fixture-server.js` (:8799, CORS). Dynamic routes, with or without `/api` prefix: `sport/record/statistics/list` (statisticsType missing -> code 500, not 1/2 -> code 500; type 1 filters dailyList by startTime/endTime and recomputes totals; type 2 filters monthList by month; no rows -> stats-empty), `app/statistics`, `sport/record/badge/list`, `sport/record/list`, `sport/record/detail?recordId=22401` (other id -> code 500). Everything else still `GET /<file>.json`. Stub-init scripts should fetch these from `http://localhost:8799/<api path>`.

## Deviations / notes
- Chart.js 4.4.1 (plan said 4.4.x). License saved as `LICENSE-chartjs.txt`.
- Extra helpers beyond the plan: `canShift` (acceptance 5), `pickTarget`, `minutesFromSeconds`, `fmtKg`, `fmtCount`, date helpers.
- `equivalents` returns null for day/week (the video shows them only in month/year). Constants are rough public figures, documented in the code.
- Grade is provisional (S if both ratios >= 0.5, B if consume ratio >= 0.5, else none) and matches the two observed days.
- Observed oddity: for record 22401 the sum of weight*count over sets is 4463 kg while `coreData` is 7032 kg. Headline volume must use `coreData`; per-exercise `volumeKg` from `groupSets` is a derived approximation and will not add up to the headline. Consider not showing it.
- Week stats total (712 kcal) differs from the October total (726) because of the 10-24 workout; that is expected.

## Decisions (from coordinator)
- Navigation bounds: back limit is 5 years before today (no dependency on earliest data); forward limit is the current period (`canShift`).
- Week label across a year boundary uses the official format MM.DD-MM.DD (`12.27-01.02`), year implied. `periodRange(...).ariaLabel` is the full "YYYY-MM-DD to YYYY-MM-DD" for aria-label.
- Duplicate daily (or monthly) rows for one date are summed by `fillDaily`/`fillMonths` (targets: the larger).
- Rounding: minutes whole number for display (1200 s = 20 min, `minutesFromSeconds`), kcal whole (`fmtKcal`), volume one decimal (`fmtKg`).
- Equivalents constants were recalibrated to the official app (843 kcal = 3.2 fries = 1.2 hamburgers; 15666 kg = 8 cars = 0.0 Eiffel); a test reproduces the video values. Servings/towers: `fmtServings` (one decimal), cars: `fmtCount`.
- UI (for the UI agents): Back from the explorer returns to its entry point (History or Profile). The Latest Record card opens that record's Training Report.

## UI layer (History tab = Summary dashboard)

Files: `static/activity-dashboard.{js,css}` (Dashboard + Medals), `static/activity-explorer.{js,css}` (Day/Week/Month/Year), `static/activity-report.{js,css}` (Training Report). Each exposes one global and owns one sub-view container inside `#tab-history`:

| Global | Container | API |
|---|---|---|
| `DashboardUI` | `#act-dashboard`, `#act-medals` | `show()` (called by `switchTab("history")` in `app.js`) |
| `ExplorerUI` | `#act-explorer` | `open({view, date, onBack})`, `openFromProfile()` (wired to `#profile-activity-btn`) |
| `ReportUI` | `#act-report` | `open(recordId, {row, onBack})`, `close()` |

Rules shared by all three:
- Only one sub-view is visible; Back calls the opener's `onBack`, so Back returns to the entry point (History, Profile, or the explorer in the same view/date).
- Spanish strings are added with `Object.assign(I18N.es, {...})` at the top of each file. A language change re-renders in place (`app.js` no longer calls `switchTab` for History).
- Colours come from theme tokens only; `--act-duration` / `--act-duration-2` (cyan pair) were added to every theme in `themes.css` for the duration bars and rings. Consume uses `--danger` / `--warn`. A test scans `activity-*.css` for colour literals.
- Every fetch has a request-token guard; errors are non-2xx OR HTTP 200 with `success:false` / `code != 200`.
- Chart.js (vendored, 4.4.1) instances are destroyed and recreated on each render and on theme/language change; each chart has a hidden data table as text alternative (visible if Chart.js is missing).
- The Dashboard no longer uses `loadHistory`/`deleteRecord` in `app.js` (kept only as a fallback if `DashboardUI` is absent).

Known, non-blocking items (QA regression report, `qa/activity-qa-report.md`):
- L1 Minor: `aria-label` on the Today ring and the Latest Record card does not start with the visible text (Lighthouse label-content-name-mismatch).
- P1 Minor: Back from the Profile entry leaves focus on `<body>` instead of `#profile-activity-btn`.
- A3 Trivial: "1 workouts without a valid date" has no singular form (EN/ES).
- A1/A2/A4 Advisory: report opened from an explorer row returns focus to the explorer heading, not the row; dashboard skeleton is shorter than the loaded page; the report's "Details:" server message is untranslated.
- Grade letter (S/B) thresholds remain a provisional heuristic (`GRADE_THRESHOLDS` in `activity-core.js`).
- DST was verified in node only (browser host timezone is Europe/Paris); a live OS colour-scheme switch with a view open was not exercised.
