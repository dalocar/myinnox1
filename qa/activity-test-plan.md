# Activity (Summary dashboard + explorer + medals + training report): QA test plan

Source of truth: docs/plan-activity.md (acceptance criteria 1-10 authoritative). Written before the implementation; it tests the contract, not the code. Official-app reference: video frames `scratchpad/sheets/s0..s5.png` ("V" below).
Environment: `node qa/fixture-server.js` (:8799, CORS) + app on http://localhost:8788; Chrome DevTools MCP isolated context "stub" with dummy `innodigym_token`/`innodigym_email` in localStorage and a `fetch` stub init script (`qa/activity-stub-init.js`, QA-owned, pattern of fitness-stub-init.js; variant from `location.hash`). Real-account context "real" is READ-ONLY, GET only, old bearer (see memory api-probe-env).
Widths: 320, 375, 768, 1280. Themes: default, dark, ember, tide, graphite + pref auto. Languages: EN, ES.
Screenshots: `qa/screens/activity-<view>-<theme>-<lang>-<width>.png`.
Reference "today" for all stub runs is fixed: the stub overrides `Date` (init script) to **2026-10-29 (Thu) 12:00 local** unless a case says otherwise (V date header "October29th, Thu").

## 0. Verification methods
- **U** = node unit test (`node --test static/activity-core.test.js`) or a QA-written ad-hoc `node -e` against `activity-core.js` (UMD). QA does not edit source; ad-hoc scripts live in the scratchpad.
- **B** = browser check via Chrome DevTools MCP (snapshot, evaluate_script, emulate, resize_page, console, network).
- **V** = visual compare against the video frames.
- **S** = static grep/script.

## 1. Test data matrix

Fixtures the Core agent creates (names assumed; QA adapts to actual names and records them in the report):

| Fixture | Content | Used by |
|---|---|---|
| `stats-daily.json` | statisticsType=1, real: dailyList 2026-10-27 (362 kcal, 1200 s, cap 70342, targets 500/1800) and 2026-10-28 (351 kcal, 1086 s, 70320, targets 500/3600); top totals | A1, dashboard, week/day/month |
| `stats-monthly.json` | statisticsType=2, real: monthList `202610`; totalConsume 726 | Year view, Total card |
| `stats-empty.json` | zeros, `dailyList:null`, `monthList:null` | empty states |
| `badges.json` | real: 3 earned Volume, 6 locked, `latestBadges` order 50000, 20000, 5000 (V shows that order) | Medals, preview |
| `record-detail-22401.json` | Sample Routine B, 351 kcal, 1086 s, coreData 70320 (7032.0 kg), extData sets | Training Report |
| `totals.json` (`app/statistics`) | all-time totals | Total card |
| `record-list` (existing or new) | last-180-day list incl. 10-28 Sample Routine B, three "New Routine" on 10-27 (120.0 kg/7 kcal/30 s; 2854.0/171/498 s; 3600.0/229/534 s) per V | Recent Activity |

Note on V vs plan: video shows 843 kcal for week/month/total while the plan's probe says 726 (stats) vs 712 (list). Different capture time; QA asserts against the **fixture**, not the video, and verifies the displayed sum equals the fixture field (no client-side re-summing of the list).

### Extra fixtures QA needs (QA will author these in qa/fixtures/ after Core finishes, unless Core adds them)
1. `stats-daily.week-cross-month.json`: week 10.25-10.31 is single-month, so the month-crossing week is Sun 2026-11-29..Sat 2026-12-05 and the year-crossing week is Sun 2026-12-27..Sat 2027-01-02. One file with rows 2026-11-29, 11-30, 12-01, 12-05, 12-27, 12-31, 2027-01-01, 2027-01-02.
2. `stats-daily.today-no-row.json`: rows only up to 10-28 (today 10-29 absent), targets 500/3600 on the last row (checks "latest known target"); and `stats-daily.today-with-row.json` (10-29 row, target 600/2400, partial progress).
3. `stats-daily.no-targets.json`: rows with `targetConsume:0`/null, `targetDuration:0`/null (division by zero, fallback 500/1800).
4. `stats-daily.grade-boundary.json`: days engineered to ratios (consume, duration): (0.5,0.5), (0.4999,0.5), (0.5,0.4999), (0.4999,0.4999), (1.0,1.0), (2.0,2.0 overachieve > 100 %), (0,0 but row present), (0.5,0). With target 500/1800: consume 250/249, duration 900/899.
5. `stats-monthly.multi.json`: months 202510..202610 plus 202412 (year-bound), and a year with 12 months.
6. `stats-daily.big-volume.json`: realCapacity 0, 1, 5, 9, 15, 10000000 (tenths: 0.0, 0.1, 0.5, 0.9, 1.5, 1,000,000.0 kg) and realConsume fractional (362.5).
7. `badges.no-medals.json` (all 9 `received:false`, `latestBadges:[]`), `badges.all-medals.json` (9 received, latestBadges 3 most recent), `badges.partial-order.json` (latestBadges order differs from id order), `badges.null-receivetime.json`, `badges.imgfail.json` (activePic/inactivePic pointing to `http://localhost:8799/404.png` so images fail).
8. `record-list.empty.json`, `record-list.many.json` (50 records, spanning > 5 years of dates, plus one record with name `<img src=x onerror=window.__xss=1>"'&`).
9. `record-detail-xss.json` (actionName/name/nickname with `<script>`, `<img onerror>`, quotes), `record-detail-no-sets.json` (`extData:[]`/null), `record-detail-unknown-picurl.json` (picUrl null / 404), `record-detail-multi-sets.json` (same exercise non-contiguous sets: A,B,A to test grouping by exercise vs order, sets with weight 0, count 0, duration only), `record-detail-404.json` (`success:false` deleted record).
10. `error.json` (`{success:false,msg:"Boom <b>x</b>"}` HTTP 500) and `malformed.json` (HTML body / truncated JSON) for every endpoint via hash variants.
11. Slow response: stub variant `#slow` = 4000 ms delay on stats and detail (loading state, race when navigating periods quickly, out-of-order resolve: stub variant `#race` resolves period N after N+1).
12. `stats-daily.dst-eu.json` and `stats-daily.dst-us.json`: rows on 2026-03-28/29/30 (EU DST start 03-29) and 2026-10-24/25/26 (EU end 10-25), 2026-11-01 (US end), 2026-03-08 (US start).
13. `totals.zero.json` and `totals.big.json` (999999 kcal, 2^31 s).

Stub variant selector (hash): `#real` (default), `#empty`, `#error`, `#slow`, `#race`, `#nomedals`, `#allmedals`, `#imgfail`, `#xss`, `#todayrow`, `#notarget`, `#grades`, `#bigvol`, `#dst`, plus `&tz=Europe/Paris|America/New_York|Pacific/Kiritimati|Pacific/Pago_Pago` (QA uses emulate timezone).

## 2. Gate 0: static/unit (every Phase B step, run first)
| ID | Case | Pass |
|---|---|---|
| G0.1 | `cd webapp && node --check static/*.js` | exit 0 (AC10) |
| G0.2 | `node --test static/*.test.js` | all pass, count not lower than baseline + new tests |
| G0.3 | Colour literals: `grep -nE '#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(' static/style.css static/activity.js` (act block only; `.act-*` rules) | none (tokens only). Chart colours obtained from `getComputedStyle` |
| G0.4 | `themes.css` contains the new chart/ring tokens in all 5 blocks (script parse: set of `--act-*`/chart token names identical across 5 themes; none missing) | diff-free |
| G0.5 | i18n scan: every `t("...")`/`data-i18n` key used in activity*.js/index.html exists in EN and ES; no ES value identical to EN except proper nouns/units | 0 missing |
| G0.6 | `static/vendor/chart.umd.min.js` exists, Chart.js 4.4.x banner, licence file alongside; `index.html` script order: vendor chart, activity-core, activity (before app init if app.js calls it) | ok |
| G0.7 | No CDN/external script/style at runtime: `grep -n 'https\?://' static/index.html static/activity*.js` only API/hosted medal image URL | ok |
| G0.8 | `activity-core.js` is pure: no `document`/`window`/`fetch` reference; loads in node via `require` | ok |
| G0.9 | `innerHTML` audit: every interpolation of API data in activity.js passes `escapeHtml` or uses `textContent`; list each `innerHTML` site in the report | none unescaped (AC10) |
| G0.10 | Impl notes `docs/activity-impl-notes.md` exist, README History/Profile bullets updated, postman collection notes mention statisticsType 1/2 and valid JSON (`node -e JSON.parse`) | ok |
| G0.11 | Console clean on every sub-view in every theme: no errors/warnings, no 404 (vendor chart, medal images excepted only in imgfail variant) | 0 |
| G0.12 | Request audit: only GETs to `sport/record/statistics/list`, `app/statistics`, `sport/record/badge/list`, `sport/record/list`, `sport/record/detail`; DELETE only from the Delete button (stub-captured). `statisticsType` is only 1 or 2. Dates are `YYYY-MM-DD` | ok |

## 3. Unit tests for `activity-core.js` (U)
QA reviews the dev's test file for gaps and adds missing cases to a scratchpad script (reports gaps, does not edit source). Function names per plan; adapt to the contract in impl notes.

| ID | Function | Case | Expected |
|---|---|---|---|
| U1 | `fmtDuration` | 0, 1, 59, 60, 1086, 3599, 3600, 3661, 86399, 100000 s; null/undefined/NaN/negative/"1086"/1086.7 | `00:00:00`, `00:00:01`, `00:00:59`, `00:01:00`, `00:18:06` (V), `00:59:59`, `01:00:00`, `01:01:01`, `23:59:59`, `27:46:40`; bad input -> `00:00:00`, never "NaN" |
| U2 | `kgFromTenths` | 70320 -> `7032.0`; 120 -> `120.0`; 0, 1, 5, 9, 10, 15 ; null; 10000000; 2854 ; negative | `7032.0`, `120.0`, `0.0`, `0.1`, `0.5`, `0.9`, `1.0`, `1.5`; null -> `0.0`; `1000000.0` (no exponent); `285.4`; no float artefacts like `0.30000000000000004` (try 3, 7, 29, 57 tenths) |
| U3 | `periodRange('week', d)` | anchor Sun 2026-10-25, Wed 10-28, Sat 10-31, Thu 10-29 | start 2026-10-25, end 2026-10-31 (Sun-Sat) for all four; label `10.25-10.31` (V); 7 day keys |
| U4 | `periodRange('week')` | crossing month 2026-11-29..12-05; crossing year 2026-12-27..2027-01-02; 2027-01-01 (Fri) anchor | correct start/end, keys cross boundary, label shows both months (`11.29-12.05`) and year-cross label unambiguous (document what impl chooses) |
| U5 | `periodRange('month')` | 2026-10, 2026-02, 2028-02 (leap), 2026-12, 2026-04 | 31, 28, 29, 31, 30 day keys; start day 1, end last day; label `2026-10` (V) |
| U6 | `periodRange('year')` | 2026, 2028 | 12 month keys `202601..202612`; start 2026-01-01, end 2026-12-31; label `2026` |
| U7 | `periodRange('day')` | any | start == end == anchor |
| U8 | Date parsing | anchor given as `Date` at 23:59:59 local, 00:00:00 local, in TZ Europe/Paris, America/New_York, Pacific/Kiritimati (+14), Pacific/Pago_Pago (-11), UTC | same calendar day output as local date; never off by one (no `toISOString().slice(0,10)` UTC shift). Run the same suite under `TZ=` env for each |
| U9 | `shiftPeriod` | day +/-1 across month end (10-31 -> 11-01), year end (12-31 -> 01-01), Feb 28/29/Mar 1; week +/-1 across DST dates 2026-03-29, 2026-10-25 (EU), 2026-03-08, 2026-11-01 (US) | exact 7 calendar days (no 6/8-day drift, no repeated or skipped days), still Sun-Sat aligned |
| U10 | `shiftPeriod` month | 2026-03 -1 -> 2026-02, 2026-01 -1 -> 2025-12, 2026-12 +1 -> 2027-01; anchor 31st shifted to 30-day month and Feb (31 Mar -1 month) | lands in the previous month, not "Mar 3"; no overflow |
| U11 | `shiftPeriod` year | +/-1, leap day anchor 2028-02-29 +1 year | 2029 in range, no 2029-03-01 spill |
| U12 | `fillDaily` | range 7 days, dailyList with 2 rows (27, 28), `null`, `[]`, `undefined`, rows outside range, duplicate date rows, row with missing fields | length == range days; absent days all zeros (`realConsume/realDuration/realCapacity=0`); outside rows ignored; duplicates: defined behaviour (last wins or summed, documented); missing fields -> 0, never NaN/undefined |
| U13 | `fillMonths` | monthList null/[]/real; yearMonth `"202610"` string vs number; months outside year | 12 entries, month 10 = 726 kcal; others 0 |
| U14 | `ratios(day)` | (362/500, 1200/1800), targets 0/null/undefined, real > target (2.0), negative | ratios 0.814, 0.59 (V plan values 81 %/59 %); zero target -> uses fallback or 0, never Infinity/NaN; clamp behaviour documented (ring progress clamp 0..1, ratio itself may exceed 1) |
| U15 | `gradeFor(day)` | table below | per `GRADE_THRESHOLDS` constant (see section 8, grade boundaries) |
| U16 | `ringProgress` | 0, 0.5, 1, 1.7, -1, NaN, Infinity | 0, 0.5, 1 (clamped), 1, 0, 0, 1 or documented; always finite |
| U17 | `equivalents('month', 843, 15666)` | V anchor: 843 kcal -> "3.2 servings of French fries", 15666.0 kg -> "8 cars" | fries = kcal/constant to 1 decimal (constant ~296 kcal, derive: 843/3.2); cars = floor/round(kg/constant) giving 8 (constant ~1958 kg; both constants documented in code). 0/0 -> 0.0 and 0 (no "NaN", no negative) |
| U18 | `equivalents('year', ...)` | same inputs | hamburgers + Eiffel towers (kg / 10100 t scale gives 0 towers for small input: must show a sensible value or "0", not "NaN"/"0.0000") ; unit switch month vs year; pluralless forms |
| U19 | `groupSets(extData)` | record-detail-22401; multi-sets A,B,A; null/[]; sets missing weight/count/duration; same actionName different actionId; sort field out of order | one group per exercise (keyed by actionId), ordered by first appearance by `sort`/`actionNo`; per-set rows retained in order; group totals (sets count, total reps, volume = sum(weight*count) tenths) consistent with record volume where data allows; null -> `[]` |
| U20 | `normalizeBadges` | badges.json, no-medals, all-medals, null receiveTime, unknown `type` (4), more than 9 | 9 entries ordered type 1,2,3 then target asc (matches V grid: Consume row, Duration row, Volume row); `received` boolean; unit per type (kcal/min/kg); earned -> activePic, locked -> inactivePic; preview = `latestBadges` in server order (V: 50000, 20000, 5000); unknown type does not throw |
| U21 | Purity | calling each function twice with the same input; input objects not mutated (`Object.freeze` deep) | same output, no throw |

## 4. Functional cases per acceptance criterion

Common stub steps: open `http://localhost:8788/#real`, login stub active, click History tab.

### AC1: real payload numbers
| ID | Steps | Expected | How |
|---|---|---|---|
| 1.1 | Open explorer -> Week, navigate to 10.25-10.31 | Consume chart has bars at 27 and 28 with 362 and 351 kcal; Duration chart bars at 27 and 28 with 18 and 16 min (1200 s = 17.7 -> 18, 1086 s = 16.0 -> 16; rounding rule documented); no bars on 25, 26, 29, 30, 31; label `10.25-10.31`; matches V s3 | B: read chart data via `Chart.getChart(canvas).data.datasets[0].data` through evaluate_script; screenshot vs V |
| 1.2 | Year -> 2026 | Single non-zero bar at month 10 = 726 kcal (fixture `stats-monthly`); other 11 months 0; x labels 1..12 | B |
| 1.3 | Month -> 2026-10 | bars at 27, 28; x ticks 1..31 (V shows 1, 5, 10, ...); fun-equivalents block shows Consume `726`kcal and Volume = sum realCapacity / 10 (70342+70320 tenths = 13146.0 kg) with fries + cars lines | B |
| 1.4 | Dashboard Total card | Number equals `app/statistics` `totalConsume` fixture exactly; mini bars by month 1-12, only month 10 filled; This Week card = week sum from stats (not from record list); This Month card = monthly stat (726) | B: compare DOM text to fixtures |
| 1.5 | Dashboard "Latest Record" | kcal 351, 18 min, date 2026-10-28 (V s0) | B + V |
| 1.6 | Cross-check no list-summing | Change record-list stub to different values; dashboard/chart numbers unchanged | B |
| 1.7 | Mini-bar charts | Week: 7 bars Sun..Sat labelled Sun/Tue/Thu/Sat; Month: 1..31 labels 1,7,14,21,28 (V); Total: 12 months labelled 1,4,7,10 | V |

### AC2: rings and targets
| ID | Steps | Expected | How |
|---|---|---|---|
| 2.1 | Day view, select 10-27 | Outer (consume, red) arc 81.4 %, inner (duration, cyan) arc 59 % of 1800 s; 10-28: 78.8 %, 26.7 % of 3600 s (target differs per day) | B: ring `aria-valuenow`/SVG dash values; V |
| 2.2 | Days without rows (25, 26, 29, 30, 31) | Empty track rings, no grade letter, no NaN, label 0 | B |
| 2.3 | Today without row (`#real`, today 10-29) | Dashboard ring shows 0 kcal / 0 min, empty ring (V s0); target for the ring = latest known (10-28: 500/3600) per plan "latest known target"; assert displayed target in aria text | B |
| 2.4 | `#notarget` | fallback 500 kcal / 1800 s, no division by zero, no Infinity% | B + U14 |
| 2.5 | `#todayrow` today with row, partial | ring proportional to the new target 600/2400 | B |
| 2.6 | Overachieve 200 % | ring clamps visually at full, label shows true number | B |
| 2.7 | Today at 00:00 local and 23:59 local (Date override) | "today" key correct; date header `October 29th, Thu` (EN) / ES equivalent | B |
| 2.8 | Today-with-no-row when there is no row at all (`#empty`) | fallback target 500/1800, empty ring, no error | B |

### AC3: medals
| ID | Steps | Expected | How |
|---|---|---|---|
| 3.1 | Dashboard Medal card (`#real`) | 3 medal images in order of `latestBadges` (50000, 20000, 5000), in colour (`activePic`); chevron/whole card opens Medals page (V s0) | B + V |
| 3.2 | Medals page | 3x3 grid; row 1 Consume 1000/3000/10000 kcal, row 2 Duration 100/300/1000 min, row 3 Volume 5000/20000/50000 kg; Volume row in colour (3 earned), 6 locked using `inactivePic` greyed; caption "Consume 1000kcal" style (V s0 frames 5-6); earned count 3 | B + V |
| 3.3 | `#nomedals` | Preview card shows empty state (text, not blank card), Medals page shows 9 locked, no error | B |
| 3.4 | `#allmedals` | 9 coloured; preview 3 latest | B |
| 3.5 | `receiveTime` shown for earned (e.g. `2026/10/27`) in tooltip/aria or text | present, localized or raw per spec; null never rendered as "null"/"Invalid Date" | B |
| 3.6 | `#imgfail` | each failed image replaced by a text badge (target + unit, e.g. "50000 kg"), no broken-image icon, layout unchanged, still distinguishes earned vs locked (not colour only) | B: `img.onerror` fallback; network shows 404 |
| 3.7 | Medal a11y | each medal has accessible name e.g. "Volume 5000 kg, earned" / "locked"; images have alt or are aria-hidden with text sibling | B snapshot |
| 3.8 | Back button from Medals returns to dashboard with state intact (no refetch flicker needed) | ok | B |
| 3.9 | Earned vs locked distinguishable without colour/greyscale (text "locked"/lock/opacity+label) | ok | B |

### AC4: training report
| ID | Steps | Expected | How |
|---|---|---|---|
| 4.1 | Dashboard Recent Activity -> click "Sample Routine B" (record 22401) | Hero image, avatar + nickname, volume `7032.0` kg, `351` kcal, `00:18:06`, date `2026-10-28 08:49:29` in header (V s3), Movements list grouped by exercise, back returns to origin view | B + V |
| 4.2 | Group correctness | Each exercise shown once with its sets (set no., kg, reps, duration); total sets across groups == extData length; group order == first appearance | B: compare DOM to fixture via script |
| 4.3 | Other record: 10-27 "New Routine" | 120.0 kg / 7 kcal / 00:00:30 (V s3 right) | B + V |
| 4.4 | Record with no sets | Movements empty state (V shows illustration + text), no JS error | B |
| 4.5 | Deleted/404 record (`record-detail-404`) | error state with Retry/Back, no raw JSON | B |
| 4.6 | Hero/avatar/exercise image fails | placeholder or hidden, layout intact, alt text present | B |
| 4.7 | Opened from Day list, Week list, Month list, dashboard: back returns to the originating view and period | ok | B |
| 4.8 | Name = `<img src=x onerror=window.__xss=1>` | rendered literally; `window.__xss` undefined | B |
| 4.9 | Delete button in Recent Activity kept (plan); clicking it must not open the report (stopPropagation); confirm dialog behaviour same as before; after delete the list and stats refresh | ok | B (stub captures DELETE) |
| 4.10 | Loading state while detail fetch (`#slow`), no stale previous report content flash | spinner/skeleton then data | B |

### AC5: period navigation and bounds
| ID | Steps | Expected | How |
|---|---|---|---|
| 5.1 | Day/Week/Month/Year with today 10-29: press next | next arrow disabled (`disabled` attr + `aria-disabled`) when the period contains today or is later; cannot navigate to a future period; Week containing today is the last week (10.25-10.31) although 10-30/31 are future days (those render empty, not selectable or inert) | B |
| 5.2 | Press previous repeatedly | stops at the lower bound: earliest data month/week or 5 years back, whichever is later; prev arrow disabled at bound; document which bound the dev picks and verify it with `stats-monthly.multi` (earliest 202412) and with real data (earliest 202610) | B |
| 5.3 | Each arrow press | charts AND Recent Activity list both update to the new range (list filtered to period; week shows records of the 7 days, month the month, year the year, day the day) | B |
| 5.4 | Switch segment keeps anchor date (Day 10-27 -> Week shows week containing 10-27 -> Month 2026-10 -> Year 2026); switching back to Day returns to a sane date | ok | B |
| 5.5 | Period at bounds via shift from other segments (Month at the earliest bound -> Day) | no date before the bound | B |
| 5.6 | Rapid clicking x20 on prev/next | no duplicate requests flood (debounce or abort), final render corresponds to final period; no race (`#race`: late response for older period never overwrites) | B network + data check |
| 5.7 | Date label | Day: `2026-10-29` (or localized), Week `10.25-10.31`, Month `2026-10`, Year `2026` (V s3/s4) | V |
| 5.8 | Today ring entry opens Day view with today selected; Profile entry opens at today | ok | B |
| 5.9 | Stats request params | Week/Day/Month: `statisticsType=1&startTime=..&endTime=..` with the exact range; Year: type 2 with Jan..Dec (or full year range) | B network |

### AC6: states
For each of: dashboard, Medals, explorer Day, Week, Month, Year, Training Report, Recent Activity list:
| ID | Variant | Expected |
|---|---|---|
| 6.1 | `#slow` | visible loading state (spinner/skeleton + `aria-busy`), previous data not shown as current for the new period |
| 6.2 | `#empty` | empty state with text (and illustration like V s3 box icon for the list); charts show axes with zeros or an empty message; never blank card |
| 6.3 | `#error` (HTTP 500, `{success:false,msg}`) | error message in plain language (msg escaped or generic, never raw JSON, never `<b>` rendered), **Retry** button; Retry refetches, success replaces error; focus management reasonable |
| 6.4 | `malformed` (HTML/truncated JSON), network offline (emulate offline) | same error state, no uncaught promise rejection in console |
| 6.5 | Partial failure: stats OK, badge list fails | dashboard still shows rings/cards; only Medal card shows its error/Retry |
| 6.6 | Partial failure: stats fail, record-list OK | Recent Activity still shows; chart area error |
| 6.7 | HTTP 401 | follows app's existing auth handling (logout/login screen) as in other tabs |
| 6.8 | Retry while a request is pending | no double render |

### AC7: themes and language
| ID | Steps | Expected | How |
|---|---|---|---|
| 7.1 | For each of 5 themes + auto(light, dark emulate) x each view (dashboard, medals, day, week, month, year, report, empty, error) | all text legible: contrast >= 4.5:1 for text (kcal/min numbers, labels, dates, axis labels, captions), >= 3:1 for graphics (bars, ring arcs, track vs card, axis lines, medal outline); compute with evaluate_script (getComputedStyle + luminance) for every `.act-*` text node and for chart colours read from the chart instance | B script; report table like fitness report |
| 7.2 | Switch theme while on explorer Week | charts re-render with new colours without reload (Chart dataset colours equal new token values; axis/grid/tick colours too); no stale colours; no flash; animation not replayed excessively | B: read `chart.data.datasets[0].backgroundColor` before/after |
| 7.3 | Auto theme + OS scheme change (emulate prefers-color-scheme) | charts re-colour | B |
| 7.4 | Consume (red/orange) and Duration (cyan) series distinguishable from each other and from background in every theme; colour not the sole carrier (legend text + icon "Consume"/"Duration" per V) | ok | B + V |
| 7.5 | Language ES complete: every visible string on every sub-view translated incl. aria-labels, chart axis titles (Kcal/Min), segment labels (Day/Week/Month/Year), weekday initials, month labels, date header, empty/error/loading, equivalents sentences, medal captions, report labels (Volume, Calories, Duration, Movements) | no EN residue; verified by switching and scanning text nodes against a list of EN words | B + G0.5 |
| 7.6 | Switch EN<->ES while viewing each sub-view | re-renders immediately without losing period/selection/scroll, charts' tick labels and aria-label summaries update | B |
| 7.7 | Weekday/month names localized via locale-aware formatting or tables; week still starts Sunday in ES (spec: Sun-Sat) | ok | B |
| 7.8 | Number formatting consistent (decimal point `.` in kg as in V, per impl notes) in both languages; documented | ok | B |
| 7.9 | Dark-theme medal images: locked greyed ones still visible (>= 3:1 vs card or outline) | ok | B + V |

### AC8: accessibility
| ID | Steps | Expected | How |
|---|---|---|---|
| 8.1 | Each Chart.js canvas has `role="img"` + `aria-label` summary (e.g. "Consume per day, 10.25 to 10.31: 27th 362 kcal, 28th 351 kcal, total 712") or an adjacent visually-hidden/toggleable data table; label updates on period/language change | present, accurate to data | B snapshot |
| 8.2 | Rings: `role="img"` or progressbar with name + value text ("Oct 28: Consume 351 of 500 kcal, Duration 18 of 60 min, grade B"), not colour only | ok | B |
| 8.3 | Week strip days are buttons (or radio/tab pattern), keyboard: Tab reaches strip, Enter/Space selects, arrows optionally move; selected has `aria-pressed`/`aria-current`/`aria-selected`; visible focus ring (>= 3:1) | ok | B press_key |
| 8.4 | Segmented control Day/Week/Month/Year: one tab stop (roving) or all buttons with `aria-pressed`; arrows prev/next have accessible names ("Previous period"), disabled state announced; period label in `aria-live="polite"` | ok | B |
| 8.5 | Full keyboard run: History -> dashboard cards (cards that navigate are buttons/links, not div onclick) -> Medals -> Back -> explorer -> record -> report -> Back; focus restored to the invoker after Back; Escape not required | ok | B |
| 8.6 | Tab order follows visual order; no focus traps; no `tabindex>0` | ok | B |
| 8.7 | Reduced motion: emulate `prefers-reduced-motion: reduce`; Chart.js `animation:false` (or duration 0), ring CSS transitions/keyframes off, no animated count-ups | `chart.options.animation === false` or duration 0; computed `transition-duration:0s`/`animation-name:none` on `.act-*`; verify both at first render and on theme re-render | B emulate + script |
| 8.8 | Reduced motion NOT set: animation is allowed but does not block interaction | ok | B |
| 8.9 | Heading structure: h2 for section, h3 for sub-sections; sub-view has a title (document title/`h2`) announced on navigation; `lang` attribute follows language | ok | B |
| 8.10 | Touch targets >= 44x44 (arrows, segment buttons, strip days, medal tiles, record rows) at 375 | ok (warn if 40+) | B script: getBoundingClientRect |
| 8.11 | Lighthouse accessibility audit per sub-view (dashboard, explorer Week) | score >= 95, no contrast failures | B lighthouse_audit |
| 8.12 | Zoom 200 % / text size 200 %: no clipped numbers | ok | B |

### AC9: responsive
| ID | Steps | Expected | How |
|---|---|---|---|
| 9.1 | For each of 320, 375, 768, 1280 and each view (dashboard, medals, Day, Week, Month, Year, report, empty, error): `document.documentElement.scrollWidth <= clientWidth` and no element with `getBoundingClientRect().right > innerWidth` (script lists offenders) | 0 offenders | B resize_page + script |
| 9.2 | Charts resize with the container (Chart.js `responsive:true`, `maintainAspectRatio` set); resize 1280 -> 320 live, canvas width follows, no stale blur | ok | B |
| 9.3 | 320: week strip 7 rings fit without horizontal scroll (ring min size >= 32 px) or scrolls inside its own container intentionally; dashboard 2x2 cards remain readable (numbers not clipped; large numbers like `1234567` kcal and `12345.6 kg` fit) | ok | B + V |
| 9.4 | 768/1280: layout uses width sensibly (cards grid, max-width container), not a stretched 375 layout; tab bar unchanged | ok | B screenshots |
| 9.5 | Long Spanish strings (e.g. "consumido 3,2 raciones de patatas fritas") wrap, do not overflow at 320 | ok | B |
| 9.6 | Long record names (80 chars, no spaces) in Recent Activity: ellipsis/wrap, no overflow | ok | B |
| 9.7 | Landscape 667x375 spot check | ok | B |

### AC10: gates
Covered by G0.1-G0.12 and the XSS cases (X1-X6 below).

## 5. Sub-view cases

### 5A. Dashboard (History tab)
| ID | Case | Expected |
|---|---|---|
| D1 | Header "My Activity" with date `October 29th, Thu` (V), localized ES | ok |
| D2 | Today ring card: double ring (outer consume red, inner duration cyan), Consume `0 kcal`, Duration `0 min` when no row (V s0) | ok |
| D3 | Cards: Latest Record, This Week, This Month, Total, Medal (order V s0) | all present |
| D4 | Numbers colour-coded per series with units (kcal / min); latest record date `2026-10-28` | V |
| D5 | Card tap targets: Today ring -> explorer Day today; This Week -> explorer Week; This Month -> Month; Total -> Year; Latest Record -> its Training Report (or per notes; if not specified, report as a question, not a defect); Medal -> Medals | each navigates correctly |
| D6 | Recent Activity list below cards uses the existing record list data, rows show name, date, Volume(kg) / Calories(kcal) / Duration (V s3), Delete button kept | ok |
| D7 | Refresh button (existing) still works and refetches all dashboard data | ok |
| D8 | First load, tab switch away and back: no duplicate listeners/charts (Chart instances destroyed; `Chart.instances` count constant after 10 round trips) | no leak |
| D9 | `#empty` dashboard (no stats, no records) | zeros, empty list state, medal empty state, no error |
| D10 | A single stat endpoint slow while others fast | each card independent loading |
| D11 | Dashboard when `app/getInfo` returns `data:null` (dismissed account) | no crash (nickname fallback) |

### 5B. Medals
Covered by 3.1-3.9; plus M1: grid 3 columns at 320 without overflow; M2: captions "Consume 1000kcal", "Duration 100min", "Volume 5000kg" (V) localized ES; M3: back button focus.

### 5C. Explorer Day
| ID | Case | Expected |
|---|---|---|
| E1 | Strip Sun..Sat for week containing selected day, one ring per day, selected highlighted (V s4/s5 where visible), today marked | ok |
| E2 | Select 10-28 | big ring + Consume `351 kcal`, Duration `18 min`; list shows only that day's records (Sample Routine B) |
| E3 | Select 10-27 | list shows the three "New Routine" records (V s3) while stats row shows 362 kcal (stats vs list differ by design: no reconciliation, no error) |
| E4 | Select a day without data | empty-state illustration/text in list, ring empty |
| E5 | Grade letter on 10-27 = S, 10-28 = B (plan observed values); no letter on empty days | ok per section 8 |
| E6 | Prev/next in Day view moves one day and the strip follows (week changes when crossing Sat/Sun) | ok |
| E7 | Future days in strip disabled/non-selectable | ok |

### 5D. Explorer Week / Month / Year
| ID | Case | Expected |
|---|---|---|
| E8 | Week: two charts (Consume kcal orange/red gradient, Duration min cyan), legend with icon + name, y-axis label `(Kcal)`/`(Min)`, y max auto (V shows 554 / 28), x = day numbers 25..31 | V |
| E9 | Week list below: records in the week, newest first | ok |
| E10 | Month 2026-10: x ticks 1..31 with sparse labels (1, 5, 10, ... V), bars thin but visible at 320 (min bar width >= 2 px) | V |
| E11 | Month equivalents: `Consume 843kcal consumed 3.2 servings of French fries` and `Volume 15666.0kg Equivalent to lifting 8 cars` layout (V s3 right) using our fixture numbers; ES sentences complete; singular/pluralless forms | V + U17 |
| E12 | Year: x = 1..12, equivalents hamburgers / Eiffel towers; values computed from year totals | ok |
| E13 | Month with 0 data: equivalents show 0 with sensible text (no "NaN servings") | ok |
| E14 | Y-axis: integer ticks, `beginAtZero`, suggestedMax so that a single bar of 0 does not produce 0..1 weird scale; all-zero week still shows a 0 baseline and ticks | ok |
| E15 | Tooltips/hover/focus on a bar show date + value with unit; touch tap works; tooltip text escaped | ok |
| E16 | Segment switch rebuilds charts without leaking canvases (`Chart.instances` count == number of visible charts) | ok |

### 5E. Entry points
| ID | Case | Expected |
|---|---|---|
| N1 | History tab -> Today ring -> explorer Day (today); Back goes to the dashboard | ok |
| N2 | Profile tab shows "Activity" link (ES: Actividad), opens explorer Day today; Back returns to Profile (not History) or per impl notes (document; defect only if it strands the user) | ok |
| N3 | Medal card -> Medals; Back -> dashboard | ok |
| N4 | Record row (dashboard, Day, Week, Month lists) -> Training Report; Back -> origin | ok |
| N5 | Switch tab (Home/Programs/...) while inside a sub-view and come back to History: shows dashboard or the previous sub-view consistently (document), no stuck loading, no stale sub-view with wrong header | ok |
| N6 | `switchTab` called repeatedly; no error; existing tabs (Programs/Movements/Fitness/Profile) unaffected (regression smoke: open each) | ok |
| N7 | Language/theme switch from Profile then enter Activity from Profile | correct language/theme at once |
| N8 | Page reload while in a sub-view | returns to dashboard; no exception (browser back not required) |

## 6. Edge cases
| ID | Case | Expected |
|---|---|---|
| X1 | XSS in record name in Recent Activity, Day/Week/Month lists, Training Report title, tooltip, `aria-label`, chart label (`#xss`) | literal text; `window.__xss` stays undefined; no `<img>` element created inside `.act-*` from data (querySelectorAll check) |
| X2 | XSS in `msg` of error response (`Boom <b>x</b>`) | literal or generic |
| X3 | XSS in exercise name / nickname / picUrl `javascript:` and `"onerror=` | literal; picUrl only used as `img.src` set via property, `javascript:` not executed |
| X4 | Names with quotes/ampersands/emoji/RTL/very long | intact, no layout break |
| X5 | Hosted image URLs: only https, no referrer leaks concerns noted; `img` has `loading="lazy"`/`alt` | ok |
| X6 | `innerHTML` grep result reviewed (G0.9) | no unescaped data |
| T1 | DST: browser TZ Europe/Paris, navigate weeks over 2026-03-29 and 2026-10-25; America/New_York over 2026-03-08 and 2026-11-01 | each week exactly 7 distinct days Sun..Sat; no duplicated/missing day labels; bars land on the right dates (rows 03-28/29/30) |
| T2 | TZ Pacific/Kiritimati (+14) and Pacific/Pago_Pago (-11) | "today" equals local date; date keys not shifted |
| T3 | Midnight rollover: with the tab open across 23:59 -> 00:00 | after refresh/visibility change today updates; at minimum no crash (report as advisory if stale) |
| T4 | Year boundary: today override 2027-01-01; Week 2026-12-27..2027-01-02 | year-cross label and both years' data (needs two stats ranges or one wide range) correct |
| T5 | Leap: 2028-02-29 as today; Month 2028-02 shows 29 x ticks; prev month from 2028-03-31 -> 2028-02 | ok |
| G1 | Gap days: week with data only Mon and Sat; month with 1 row; chart shows zeros for missing days, strip shows empty rings | ok |
| G2 | Day with row but all zeros | ring empty, no grade, counted as existing target (target still used) |
| G3 | Month list missing months in the middle | zeros filled |
| P1 | Pagination: record list returns 50 (size cap) while period has more | shows what was returned, no crash; document limitation in report as advisory if period lists look truncated |
| P2 | Records outside the stats window or list items with malformed `startTime` (null, "2026/10/28", ISO with T) | row still renders; date parsed safely or shown raw, never "Invalid Date" |
| V1 | Volume tenths: 0, 1, 5, 9, 10, 15, 70320, 10000000 (`#bigvol`) | `0.0`, `0.1`, `0.5`, `0.9`, `1.0`, `1.5`, `7032.0`, `1000000.0` (thousands separator only if impl chooses and documents); Month equivalents use kg not tenths (15666.0 not 156660) |
| V2 | Fractional kcal 362.5 / seconds 1086.4 | kcal rounded for display consistently (`408` or `362.5` per notes) in cards, charts, list, report; same number in every place for the same value |
| V3 | Huge numbers (999999 kcal, 2^31 s) | no overflow of card at 320, no scientific notation |
| V4 | Negative or NaN values from API | rendered as 0 |
| GR | Grade boundaries: see section 8 | per constant |
| R1 | Deleted record: open report, then record removed server side (`record-detail-404`), or delete from list then Back | list refreshes, report shows error not stale data |
| R2 | Double delete / delete fails (HTTP 500) | error toast/message, row stays |
| I1 | Image load failure: medals (3.6), hero, avatar, exercise pic | fallback, no layout shift > 8 px |
| I2 | Chart.js missing (block `vendor/chart.umd.min.js` via 404 stub) | dashboard still renders text numbers; charts area shows fallback message/table, no uncaught exception |
| L1 | Slow network (throttle Slow 3G) on first dashboard load | skeletons, no layout jump of the cards on arrival (CLS < 0.1 via performance trace on one run) |
| L2 | Double rendering: switch History -> Home -> History 10x | no duplicate rings/cards, requests count per visit constant |
| K1 | Keyboard: see 8.3-8.6 | ok |
| M1 | Reduced motion: see 8.7 | ok |

## 7. Visual compare with the official app (V)
Capture stub screenshots at 375 in the default (dark-ish equivalent: `dark`) theme and compare element by element with the frames; differences allowed only where plan says so (our theme tokens, Recent Activity includes Delete).
| ID | Frame | Compare |
|---|---|---|
| V1 | s0 dashboard | header + date, ring card, 4 stat cards (value colours purple/blue/orange/red, units), medal card with 3 medals + chevron, bar mini-charts with sparse x labels |
| V2 | s0 bottom Medals | 3x3 grid, locked greyed, captions |
| V3 | s3 Training Report | hero, avatar overlay, big volume, two stats, Movements heading; ours additionally lists grouped sets (V shows an empty illustration) |
| V4 | s3 Week/Month charts | segmented control Day/Week/Month/Year with selected highlighted, arrows and label, chart legend, y-axis titles, bars, equivalents |
| V5a | s1/s2 Day view | Segmented Day/Week/Month/Year (selected = filled accent pill) + arrows with label `10.29` (MM.DD in Day view; official has no year); strip Sun/Mon/Tues/Wed/Thur/Fri/Sat with selected day as a white pill; one ring per day: empty = dim double track, Tue 10-27 ring + letter S, Wed 10-28 ring + letter B (letter centred inside ring), today (Thu) empty; below: Consume `0 kcal` (red drop icon) / Duration `0 min` (blue clock icon) and a larger double ring; `Recent Activity` heading + box illustration empty state when the day has no records |
| V5b | s4/s5 Year view | Year `2026` label; Consume y-axis ticks `0, 500, 843` (axis max = data max, not a round number) and Duration `0..44` (ticks 0,10,20,30,40,44); x labels 1..12 all shown, one bar at 10; equivalents block: `Consume 843kcal`, `Consumed 1.2 servings of Hamburgers`, `Volume 15666.0kg`, `Equivalent to lifting 0.0 towers` (Eiffel 0.0 is accepted, not hidden). Month view (s4 top): x ticks 1,5,10,...,30, fries `3.2`, cars `8`. NOTE the frames show a transient glitch (Year selected but Month chart with 1..31 labels): ours must never show a stale chart of the previous segment (case E16/6.1) |
| V5c | s2 Week | `10.25-10.31` label, Consume y max 554 / Duration 28 (axis max = data max); Recent Activity list below, 4 cards `Volume(kg) / Calories(kcal) / Duration` |
Intentional differences allowed: weekday abbreviations (we may use Tue/Thu), tokens/themes, Delete button, grouped sets in the report.
Record in the report per frame: match / intentional difference / defect.

## 8. Letter grade (unconfirmed heuristic) test table
Provisional rule (plan): both ratios >= 0.5 -> `S`; else consume ratio >= 0.5 -> `B`; else none; no workout (no row) -> none. QA verifies the implementation against the **constant `GRADE_THRESHOLDS`** and the plan's observations; the exact rule is out of scope as "not exact".
| ID | consume ratio, duration ratio | Expected |
|---|---|---|
| GR1 | 0.8140, 0.5900 (10-27) | S |
| GR2 | 0.7880, 0.2667 (10-28) | B |
| GR3 | 0.5, 0.5 | S (>= inclusive) |
| GR4 | 0.4999, 0.5 | none |
| GR5 | 0.5, 0.4999 | B |
| GR6 | 0.4999, 0.4999 | none |
| GR7 | 0, 0 with row | none |
| GR8 | 2.0, 2.0 | S, ring clamps |
| GR9 | 0.5 with target 0/null (fallback applies) | computed against fallback, no NaN |
| GR10 | Floating: 249.999/500, 899.99/1800 | decided by constant comparison without rounding up (no `Math.round` before compare) |
| GR11 | The grade is documented as unconfirmed in impl notes and in a code comment next to the constant; thresholds live in one place | yes |
| GR12 | Grade letter not conveyed by colour alone and included in ring aria text (8.2) | yes |

## 9. Execution order
1. G0 gates. 2. Unit (section 3). 3. Per sub-view in `dark` + `default` at 375 (smoke; D, M, E, 4). 4. AC cases 1-6 with stubs. 5. Matrix sweep: 6 themes x 2 languages x 4 widths on dashboard, Week and Training Report; remaining views at 375 x 5 themes. 7.1 contrast script on every combination. 6. Edge cases. 7. Lighthouse a11y. 8. Real-account read-only smoke (`#real` context, GET only): dashboard loads real data, no console errors; compare numbers to a curl of the same endpoints.

## 10. Exit criteria
- 0 open Blocker/Critical; 0 open Major in AC 1-6 and 10; <= 3 open Major elsewhere with owner and workaround; Minor/Trivial listed as advisories.
- G0.1-G0.12 green on the final commit; test count not reduced.
- Every AC 1-10 row PASS (or ADVISORY with justification as in the fitness report, e.g. decorative tracks below 3:1 allowed only if state is also conveyed by text/ARIA).
- Contrast table complete for 6 themes x all views; screenshots present at 4 widths x 6 themes x 2 languages for the matrix views.
- Report `qa/activity-qa-report.md` follows the fitness report layout: verdict, AC table, defects fixed/open, advisories, assumptions (grade heuristic, bound choice, equivalents constants).

## 11. Defect severity scale
| Sev | Definition | Examples |
|---|---|---|
| Blocker | Unusable feature, data loss, security | XSS executes; uncaught exception blanks History tab; Delete deletes wrong record; app unusable at 320 |
| Critical | Wrong numbers or navigation dead end on the main path | week bars on wrong dates (UTC shift/DST); volume not divided by 10; Total != `app/statistics`; entry point does nothing |
| Major | AC violated with workaround, or broken in one theme/language/width | text < 4.5:1 in one theme; ES string missing; horizontal overflow at 320; charts not re-coloured on theme switch; no Retry; race shows stale period |
| Minor | Cosmetic/functional nit not violating an AC | 4 px misalignment; focus ring faint; tooltip wording; layout differs from V without reason |
| Trivial | Polish | spacing, naming |
Retest rule: every fixed Major+ gets a regression case added to this plan's table.

## 12. Phase B gate checklist (QA agent runs on each implementation step)
Run in order; stop and report on the first Blocker. Record PASS/FAIL/N-A per line.

Common (every step)
- [ ] G0.1 `node --check static/*.js`; G0.2 `node --test static/*.test.js` (note counts)
- [ ] G0.3 no colour literals in new CSS; G0.5 i18n keys EN+ES; G0.9 innerHTML audit
- [ ] Console clean on the touched views (G0.11); G0.12 request audit
- [ ] Regression smoke: Home, Programs (Courses + My programs), Movements, Fitness, Profile open without errors; theme picker and language switch still work

Step 1: Core (core + tests + fixtures + vendor)
- [ ] U1-U21 reviewed; gaps reported; TZ matrix run `TZ=Europe/Paris`, `America/New_York`, `Pacific/Kiritimati`, `UTC` for node --test
- [ ] Fixtures valid JSON, match real shapes (field names `sportDate`, `yearMonth`, `latestBadges`, `allBadges`, `extData`); fixture-server serves them; list which of the extra fixtures from section 1 are missing and QA adds them
- [ ] Chart.js 4.4.x vendored with licence; G0.6, G0.8; impl notes contract matches function behaviour

Step 2: Dashboard + Medals
- [ ] AC 1.4, 1.5, 1.7, 2.2-2.4, 3.1-3.9, 6 (dashboard, medals), D1-D11, N1 (Today ring entry may be a stub until step 3), N3
- [ ] AC 7 (all themes, ES, switch), 8.2, 8.10, 9 (dashboard, medals) with contrast and overflow scripts
- [ ] V1, V2 visual compare; X1-X3 on Recent Activity; 4.9 Delete kept

Step 3: Explorer
- [ ] AC 1.1-1.3, 2.1, 5.1-5.9, 6, E1-E16, T1-T5, G1-G3, GR1-GR12, V1-V4
- [ ] AC 7.2-7.3 chart re-colour, 8.1, 8.3-8.4, 8.7 reduced motion, 9.1-9.3
- [ ] N1, N2, N5; chart instance leak check (D8, E16, L2)

Step 4: Training Report
- [ ] AC 4.1-4.10, R1-R2, I1, X1/X3 on report, U19, V3, 9, 8.5 focus return, 7 (themes/ES)

Final (after steps 2-4 merged)
- [ ] Full sweep section 9 steps 1-8; Lighthouse; real-account read-only smoke; I2 chart-missing fallback; L1 CLS
- [ ] `docs/activity-impl-notes.md`, README, postman notes present (G0.10)
- [ ] Write `qa/activity-qa-report.md`; screenshots in `qa/screens/`; verdict against section 10

## 13. Open questions for the Core/UI agents (answer in impl notes; QA treats silence as "use the plan's text")
1. Lower navigation bound: earliest data or 5 years? Which wins when both apply?
2. Week label for year-crossing weeks.
3. Duplicate daily rows for the same date: last wins or sum?
4. Rounding of minutes (1200 s -> 20 min per plan acceptance 1) and kcal (362.5).
5. Constants for equivalents (fries kcal/serving, car kg, hamburger kcal, Eiffel tower kg).
6. Does Back from the explorer return to the entry point (Profile vs History)?
7. What does the Latest Record card open?
