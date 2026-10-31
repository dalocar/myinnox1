# Plan: Activity summary + explorer (History tab redesign)

Reference: official app **Summary / My Activity** flow (`~/Downloads/WhatsApp Video 2026-10-29 at 22.04.06.mp4`, 35 s).

## Today
`loadHistory()` (`static/app.js`) calls `GET /sport/record/list` (last 180 days, size 50) and renders a flat list: name, `startTime · duration s · kcal`, Delete. `#tab-history` = `h2` + refresh button + `#history-list`. `sport/record/detail`, `sport/record/statistics/list`, `app/statistics` and `sport/record/badge/list` are unused.

## Decisions (validated with the user)
- Feature list below is final.
- **Placement:** the existing **History** tab becomes the Summary dashboard. No new top-level tab.
- Dashboard "Today" ring opens the Activity explorer. **Profile** gets a direct link to it.
- **Charts:** use a library: **Chart.js 4.4.x UMD, vendored** in `static/vendor/` (no CDN at runtime, no build step; the app is plain static files served by `server.py`). Colours are read from theme CSS variables at render time and charts are re-rendered on theme/language change.
- **Letter grade (S/B on the week strip):** approximate heuristic, one constant, documented as unconfirmed (see below).

## Real data (probed read-only 2026-10-29, old bearer)
Account is dismissed: `app/getInfo` and `app/getSetting` return `data:null`, but stats/records/badges still work.

### `GET sport/record/statistics/list?statisticsType=N[&startTime=YYYY-MM-DD&endTime=YYYY-MM-DD]`
`statisticsType` is a Java enum: **only 1 (daily) and 2 (monthly) are valid**; 0/3/4 give a conversion error; omitting it gives "type required". Without dates it returns everything.
- `1` -> `data.dailyList[]`: `{sportDate:"2026-10-27", targetDuration:1800, targetConsume:500, realDuration:1200, realConsume:362, realCapacity:70342, realDistance:0.0}`. `monthList:null`. Days without workouts are **absent** (client fills gaps with 0). Empty range -> zeros, `dailyList:null`.
- `2` -> `data.monthList[]`: `{yearMonth:"202610", totalDuration, totalConsume, totalCapacity, totalDistance}`. `dailyList:null`. Month rows only for months with data.
- Both: top-level `totalDuration` (s), `totalConsume` (kcal), `totalCapacity` (tenths of kg), `totalDistance`.
- `GET app/statistics` -> `{totalDuration,totalConsume,totalCapacity,totalDistance,coins}` all-time (the "Total" card).
- **Server stats != record list**: October stats 726 kcal vs 712 summed from `record/list` (stats include a 10-24 workout the list does not return). Use the stats endpoints for every number except the Recent Activity list, so we match the official app.
- Per-day **goals** (`targetConsume` 500 kcal; `targetDuration` 1800 s, 3600 s on 10-28) drive the rings: red = consume/target, cyan = duration/target. Today has no row -> use latest known target, fallback 500 kcal / 1800 s.

### Units
- Volume: `coreData` / `realCapacity` / `totalCapacity` are **tenths of kg** (70320 -> 7032.0 kg).
- Duration is seconds everywhere (video: `00:18:06`, charts in minutes).

### `GET sport/record/badge/list`
`data.latestBadges[]` and `data.allBadges[9]`: `{id,type,target,activePic,inactivePic,receiveTime:"2026/10/27"|null,received}`. `type` 1 = Consume (1000/3000/10000 kcal), 2 = Duration (100/300/1000 min), 3 = Volume (5000/20000/50000 kg). Images at `https://power.renhesports.com/filestore/power/badge/{consume|duration|capacity}_{active|inactive}_{1..3}.png`. The dashboard card shows `latestBadges`; the Medals page shows `allBadges` (earned = `activePic`, locked = `inactivePic`).

### `GET sport/record/detail?recordId=`
Record fields plus `extData[]`: `{actionId, actionName, actionNo, picUrl, sort, weight (tenths kg), count, duration}` one row per set. The video shows the Movements list empty, but the data exists; we render it grouped by exercise.

### Letter grade (S/B) - UNCONFIRMED
No endpoint returns it. Observed: 10-27 (consume 81 %, duration 59 % of goal) = **S**; 10-28 (79 %, 27 %) = **B**. Thresholds can't be recovered from two points. Implement `gradeFor(day)` with a single `GRADE_THRESHOLDS` constant (provisional: S if both ratios >= 0.5, otherwise B if consume ratio >= 0.5 else none) and say so in the impl notes. No grade on days without a workout. Easy to drop if the user prefers.

## What the official app does (video)
1. **Dashboard** ("My Activity"): today's double ring + Consume kcal / Duration min; cards Latest Record (kcal, min, date), This Week (Sun-Sat mini bars), This Month (1-31 mini bars), Total (mini bars by month 1-12, shown 1-10 here); Medal card with the 3 latest medals and a chevron.
2. **Medal page**: 3x3 grid, locked greyed, earned in colour.
3. **Activity explorer**: segmented Day / Week / Month / Year, ◀ date ▶.
   - Day: Sun-Sat strip, one ring per day (+ grade letter), selected day highlighted, Consume / Duration for the day with big ring, Recent Activity list (empty state illustration when none).
   - Week (`10.25-10.31`): two bar charts, Consume (kcal, orange) and Duration (min, cyan), x = days; Recent Activity list below.
   - Month (`2026-10`): same charts x = 1..31; below, fun equivalents: kcal as servings of French fries, volume as cars lifted.
   - Year (`2026`): charts x = months 1..12; equivalents switch to hamburgers and Eiffel towers.
4. **Training Report** (tap a record): hero image, avatar + nickname, volume (kg), kcal, duration, "Movements" list.

## Our version

### Entry points
- History tab = dashboard (rings, cards, medal preview, Recent Activity = the existing record list, now showing volume/kcal/duration, with Delete kept).
- Today ring / "Today" -> explorer (Day view, today). Profile -> "Activity" link -> explorer. Medal card -> Medals page. Any record row -> Training Report.
- These are sub-views inside the History panel (like Programs / Movements segments), with a back button; no router change beyond what `switchTab` already does. Browser back is not required.

### Code structure (match courses/fitness pattern)
- `static/activity-core.js` (pure, UMD): `fmtDuration`, `kgFromTenths`, `periodRange(view, anchorDate)` (week = Sun-Sat), `shiftPeriod`, `fillDaily(range, dailyList)`, `fillMonths`, `ratios(day)`, `gradeFor`, `ringProgress`, `equivalents(view, kcal, kg)` (fries / hamburgers, cars / Eiffel towers with documented constants), `groupSets(extData)`, `normalizeBadges`.
- `static/activity-core.test.js` (`node --test`): period maths across month/year/DST edges, gap filling, empty/null lists, unit conversions, grade, equivalents, badge grouping, set grouping.
- `static/activity.js`: DOM + API + Chart.js wiring; all API text via `escapeHtml` / `textContent`.
- `static/vendor/chart.umd.min.js` (Chart.js 4.4.x, vendored, MIT licence file alongside); `index.html` script tags before `activity.js`.
- `style.css`: new `.act-*` block at the end; theme tokens only (a test forbids hex literals). Add chart/ring tokens to `themes.css` for **all** themes.
- `i18n.js`: EN keys + ES strings for every new label; key-coverage scan stays green. Equivalent texts use pluralless forms.
- `docs/activity-impl-notes.md`; update `README.md` History and Profile bullets; append the stats/badge response notes to `docs/innodigym-power.postman_collection.json` (statisticsType values).
- Reuse hosted medal images; if one fails to load, fall back to a text badge (target + unit).

### Acceptance criteria
1. With the real payloads: Oct week 10.25-10.31 shows bars on 27 and 28 (362/351 kcal, 20/18 min), Year 2026 shows one bar at month 10 (726 kcal), Total card matches `app/statistics`.
2. Rings use per-day targets; days with no data render empty rings; today with no row uses the fallback target.
3. Medals: 3 earned (Volume 5000/20000/50000) in colour, 6 locked greyed; dashboard preview shows `latestBadges` order.
4. Training Report for record 22401: 7032.0 kg, 351 kcal, 00:18:06, sets grouped by exercise.
5. Period arrows never go past an unreasonable range (no future past today + 0; bounded back at the earliest data or 5 years) and update both the charts and the Recent Activity list.
6. Empty, loading and error (+Retry) states for every sub-view; no raw JSON.
7. All 5 themes + Auto legible (contrast >= 4.5:1 text, 3:1 graphics); charts re-colour on theme change; ES complete and re-renders on language switch.
8. a11y: charts have a text alternative (table or `aria-label` summary), ring/strip controls keyboard operable, reduced motion disables animation.
9. 320 / 375 / 768 / 1280 px with no horizontal overflow.
10. `node --check static/*.js && node --test static/*.test.js` green; XSS-safe.

### Out of scope
Distance stats (always 0 for this device), coins display, sharing the report (the "⋮" menu in the video), the grade being exact.

## Work breakdown for agents
1. **Core** (blocking): `activity-core.js` + tests + fixtures in `qa/fixtures/` (stats daily/monthly/empty, badge list, record detail from `old-account-backup/`), extend `qa/fixture-server.js`, vendor Chart.js. Output: API + function contract in `docs/activity-impl-notes.md`.
2. **Dashboard + Medals** (after 1): History tab rewrite, cards, medal preview + page, i18n.
3. **Explorer** (after 1, parallel with 2): segmented control, week strip rings, charts, equivalents, Recent Activity, Today/Profile entry points.
4. **Training Report** (after 1, parallel): detail view from record rows, grouped sets.
5. **QA** (after 2-4): test plan + report in `qa/` following `fitness-test-plan` / `qa-report` pattern; screenshots at 4 widths x 6 themes, both languages.
