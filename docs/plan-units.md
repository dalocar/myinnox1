# Plan: honor the account unit preference (Imperial / Metric)

Source: community feedback ("Could you allow imperial units?") plus official-app screenshots of 2026-10-31 and live API probes.

## Findings (confirmed)

- The account has a unit setting: profile field `unit` (0 = Metric, 1 = Imperial). The web app already reads and writes it (`static/app.js` profile form, `#p-unit`), but nothing else uses it, so every weight is shown in kg.
- The server always stores **kg** (weights in tenths of a kg). The official app converts only for display and on save. Same program, same stored value:
  - Calf Raise: stored `sideWeight` 100 -> Imperial "22.0 lbs", Metric "10.0 kg".
  - Rear Extension (R): stored 68 -> Imperial "15.0 lbs", Metric "6.8 kg".
- Factor is about 2.20462. Inputs entered in lb are converted and rounded to 0.1 kg on save (15 lb -> 6.8 kg, which displays back as 15.0 lb). Displayed lb use one decimal.
- Official-app labels: "Weight(lbs)" in the editor, "22.0lbs" in the detail view, "Unit of Measure" in the profile.
- The upstream still has the known problem that height and weight updates 500, so body measurements stay read-only (see CLAUDE.md).

## Scope

1. **`static/units-core.js` (new, pure, tested)**:
   - `LB_PER_KG = 2.20462`.
   - `tenthsToDisplay(tenthsKg, unit)` -> number in kg or lb, 1 decimal.
   - `displayToTenths(value, unit)` -> integer tenths of kg (round to 0.1 kg, matching the app).
   - `unitLabel(unit)` -> "kg" or "lb". The official app writes "lbs"; we use "lb" in UI and may revisit.
   - `fmtWeight(tenthsKg, unit)` -> "22.0 lb" / "10.0 kg".
   - `unitFromProfile(profile)`, tolerant of missing or null (defaults to Metric).
2. **Unit state**: load `profile.unit` once after login and keep it in a small shared module so every screen reads the same value. Refresh when the profile form saves a new unit. Cache nothing across logins.
3. **Apply to every weight in the UI**:
   - Programs editor step table (the `sideWeight` column; see the side-weight plan for label changes), program detail/preview, picker modal if it shows weights.
   - Activity screens: `kgFromTenths` / `fmtKg` call sites in `activity-core.js`, `activity-dashboard.js` and `activity-explorer.js` (set weights, volume).
   - Fitness screen (Upper-limb kg value, badge targets with unit `kg`).
   - Planner/courses screens if they show weight; grep for `kg` in `static/*.js` and i18n keys.
4. **Profile screen**: keep the Units dropdown. Target weight and body weight labels follow the unit (display only; edits stay disabled where upstream 500s).
5. **i18n**: new strings ("lb", "Weight (lb)", labels with unit) in `i18n.js` and every `i18n-<code>.js`. Reuse the existing "Units" / "Metric" / "Imperial" keys.
6. **Docs**: README feature list line and a short `docs/units-impl-notes.md` after implementation.

## Out of scope

- Height in ft/in (confirm separately; the upstream rejects height updates).
- Distance or speed units (none are shown today).
- Changing what the server stores. It stays kg.

## Tests

`static/units-core.test.js` with `node --test`:
- Round trips: 100 <-> 22.0 lb, 68 <-> 15.0 lb, 50 <-> 11.0 lb (5 kg).
- Rounding to 0.1 kg on save for awkward inputs (e.g. 22 lb -> 10.0 kg, 11 lb -> 5.0 kg).
- Null, undefined and NaN inputs.
- Metric is a no-op beyond one-decimal formatting.
- Activity/fitness formatters honor the unit.

Manual QA with the fixture server (`qa/fixture-server.js`): switch profile unit, check each screen, then save a program edited in lb and compare stored tenths with the table above.

## Order and dependencies

- Do this **after** the side-weight plan's `sideNum` handling lands, or together with it, because both change the editor's weight input. The pure core module can be built first.
- Independent of the export/clone plan, except that exports must stay in kg (see that plan).

## Open items

- Confirm whether the official app rounds the displayed lb to one decimal everywhere (screenshots show "11.0", "22.0", "15.0").
- Decide "lb" vs "lbs" for the label.
