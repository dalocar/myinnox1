# MyInnoX1 — unofficial X1 Pro web client (for INNODIGYM Power)

> **Unofficial.** Not affiliated with or endorsed by INNODIGYM or its vendor. It uses a
> private, reverse-engineered API that can change without notice. Your login passes through
> this project's proxy to the vendor; see [SECURITY.md](SECURITY.md) and self-host if you'd rather not trust a hosted instance.

A local tool for managing INNODIGYM Power custom programs, actions, and
profile settings that the official app's UI doesn't expose — full editing,
not just viewing — even though the server fully supports it.

Talks to `power.renhesports.com` using the real (reverse-engineered) API.
See [`docs/innodigym-power.postman_collection.json`](docs/innodigym-power.postman_collection.json)
for the full endpoint list, confirmed request/response shapes, and notes on
quirks found while reverse-engineering it (import into Postman to explore).

## Run

```
docker compose up --build
```

Open http://localhost:8787 and log in with your INNODIGYM account.

## Features

- **Languages** — header dropdown with the same eight languages as the official
  app: English, Español, Deutsch, Français, Italiano, 한국어, 中文, 日本語. Every
  screen, dialog and message is translated, and the choice is sent to the API as
  `languageId` (`en es de fr it ko zh ja`), so exercise and course names come
  back translated too. The choice is remembered in the browser (first visit
  follows the browser language). English text is the key; Spanish lives in
  `static/i18n.js`, the other languages in `static/i18n-<code>.js` packs.
- **Courses** — the Programs tab opens on "My programs" when you have custom
  programs, otherwise on a browser of the official courses
  (accent-insensitive search, topic chips, Difficulty / Duration / Accessory
  filters, card grid, read-only detail with the exercise list). "My programs"
  is the existing custom-program editor.
- **Themes** — Profile → Appearance: Auto (follows the OS), Teal Classic
  (default look), Midnight (dark), Brasa (warm), Marea (cool blue) and Grafito
  (high-contrast neutral). Client-side only (`localStorage`), applied before
  first paint so there is no flash. Tokens live in `static/themes.css`; design
  rationale, contrast table and QA checklist in
  [`docs/plan-themes.md`](docs/plan-themes.md) (preview: `docs/theme-preview.html`).
- **Programs** — create, edit, delete custom programs. Add/remove exercises
  via a searchable picker over the full action library, with muscle-group
  filter chips (Chest/Shoulder/Back/Arm/Hips/Legs/Abdomen/Full-Body). Edit
  reps, weight (shown correctly in kg — the server stores tenths of a kg
  internally), rest, and sets per exercise. Pick a cover image. Rows reorder by drag handle;
  Move up/down, Duplicate and Remove live in each row's "⋯" menu. Number
  fields are quiet underlines until hovered or focused.
  Click a program row (not its buttons) for a read-only summary card with each
  exercise's sets × reps. **Clone** copies a program under a new name
  (prefilled "Name (copy)"); **Export** / **Export all** save programs as plain
  JSON files and **Import** restores or shares them (preview, rename, per-program
  result). Files keep the server's stored values, so they do not depend on the
  unit setting. See `docs/export-clone-impl-notes.md`.
- **Movements** — the Actions tab opens on a searchable library browser of the
  full exercise catalog (accent-insensitive search; body-part, type
  (stretching / warm-up / strength) and difficulty filters; Reset; card grid
  with "Show more"; tap a card for the picture/video). "My actions" keeps the
  custom-action list.
- **Plans** — build a multi-week training plan with different routines per
  day (the official app only lets you pick courses for the first day). Three
  steps: Basics (name, start date, 1-4 weeks, weekdays, cover), Routines
  (pick your own templates and/or official courses, then either apply them to
  all days or rotate through them: Mon A, Wed B, Fri A, next Mon B...), and
  Review (week-by-week grid; tap a day to add/remove/replace/reorder its
  routines, multi-select days to apply a routine, re-apply the distribution
  without losing hand edits). Only one plan can be ongoing: saving a new one
  offers to stop the current one. Ongoing plans can be edited and stopped;
  stopped/ended plans are view-only (server restriction). API details:
  [`docs/plan-api.md`](docs/plan-api.md).
- **Actions** — view/add/delete your custom actions (listed with `action/list?custom=true`, since the default list omits them; each shows its weight mode, Per side or Combined). In the program editor every step shows the same weight mode next to its weight, taken from the exercise's `sideNum` (1 = Per side, 2 = Combined, 0 = no weight). For Combined exercises (both cables) the entered weight is per cable and a readout shows the total (x2).
- **History** — a Summary dashboard: today's goal rings (consume / duration),
  Latest Record, This Week, This Month and Total cards, the three latest Medals
  and the Recent Activity list (volume, kcal, duration; delete kept). Numbers
  come from the server's own statistics, so they match the official app.
  - **Activity explorer** — click the Today ring (or use Profile → "Open
    activity explorer"). Day / Week / Month / Year with ◀ ▶ navigation: a Sun–Sat
    ring strip with an approximate S/B goal grade, Consume and Duration bar
    charts (Chart.js, vendored in `static/vendor/`), fun equivalents (fries,
    cars, hamburgers, Eiffel towers) and the period's workouts.
  - **Medals** — all 9 medals (consume, duration, volume); earned in colour.
  - **Training Report** — click any workout: volume, kcal, duration and the sets
    grouped by exercise.
  Spec: [`docs/plan-activity.md`](docs/plan-activity.md); implementation
  notes: [`docs/activity-impl-notes.md`](docs/activity-impl-notes.md); QA:
  [`qa/activity-test-plan.md`](qa/activity-test-plan.md) and
  [`qa/activity-qa-report.md`](qa/activity-qa-report.md).
- **Fitness** — gamified "Fitness Level" screen: a 3-axis radar plus one card per
  ability (upper-limb strength, lower-limb strength, endurance) with value, last
  test date, 5-segment progress bar and a rank badge. Read-only. Test ids: 3 = upper-limb,
  4 = lower-limb, 2 = endurance; untested abilities show "Not tested yet". Notes:
  [`docs/fitness-impl-notes.md`](docs/fitness-impl-notes.md).
- **Profile** — a link to the Activity explorer; edit nickname, birthday, sex, units, training goal, target
  weight. Height/weight editing is disabled with an explanation — the
  server 500s on those two fields no matter what's sent, a confirmed
  upstream bug, not something fixable client-side.
- **Units (kg / lb)** — every weight follows the account's Profile → Units setting (Metric / Imperial):
  program editor, activity volume and set weights, fitness results and the profile weights. The
  server always stores kg, so conversion is display-only. Notes:
  [`docs/units-impl-notes.md`](docs/units-impl-notes.md).
- **Lightbox** — click any thumbnail (program covers, exercise images, the
  picker) for a full-size popup; exercises with a demo video get a playable
  video player instead of a static image.

## Tests

The plan logic (dates, distribution, validation, API payloads) is pure code in
`static/planner-core.js` with unit tests in `static/planner-core.test.js`:

```
node --test static/            # Node 18-22
node --test static/*.test.js   # newer Node versions treat a directory as a module
```

The Movements search/filter logic is pure code in `static/movements-core.js`
(tests in `static/movements-core.test.js`). QA artifacts (test plan, report,
fixtures) are in `qa/`.

## How it works

- `server.py` is a dependency-free Python HTTP server. It serves the static
  frontend and proxies anything under `/api/*` straight to
  `power.renhesports.com/api/*`, forwarding the `Authorization` header
  untouched. This exists only to dodge the browser's CORS restriction —
  power.renhesports.com doesn't send CORS headers, so the page can't call it
  directly from the browser.
- The frontend is plain HTML/CSS/JS (`static/`), no build step, no framework.
- Your session token is kept in the browser's `localStorage`, scoped to
  `localhost:8787`. The server process itself stores nothing — it doesn't
  even see your password beyond relaying the one login request.

## Notes on the API's quirks

- `course/custom/save` is an upsert (omit `id` to create). It needs the
  *entire* program object sent back, not a partial diff — a trimmed body
  returns a 500. Always re-fetch `detail` right before editing; resending
  an older cached copy after the program changed elsewhere can also 500.
- `app/updateInfo` is the opposite: send *one* changed field per request,
  not the full profile object — some field combinations 500.
- Several "delete" endpoints are `POST`, not `DELETE`
  (`action/delete/{id}`, `course/custom/delete/{id}`).
- Auth header is `Authorization: Bearer <token>` (not the `token` header
  name you'd guess from the app's own debug logs — that was a red herring
  from an internal log string, not the real header).

Full details and confirmed example payloads are in the Postman collection
linked above.

## Caveats

- This is an unofficial client against a private, undocumented API. It could
  break on any server-side change, with no notice.
- Only use it with your own account.
