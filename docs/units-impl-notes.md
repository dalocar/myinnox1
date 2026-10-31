# Units (kg / lb) - implementation notes

Plan: `plan-units.md` (task 1). Branch `feat/units`.

## Facts (confirmed from the official app and API probes, 2026-10-31)
- Account setting: profile `unit` (0 Metric, 1 Imperial). The server stores kg only; the official app converts for display and on save.
- Same program, same stored value: Calf Raise `sideWeight` 100 -> "22.0 lbs" / "10.0 kg"; Rear Extension (R) 68 -> "15.0 lbs" / "6.8 kg".
- Factor 2.20462. lb typed by the user is rounded to 0.1 kg (15 lb -> 68, 22 lb -> 100, 11 lb -> 50).

## Design
- `static/units-core.js` (pure, `UnitsCore`): `fromTenths/toTenths` (tenths of kg <-> display number), `kgToDisplay/displayToKg` (plain-kg profile fields), `fmtTenths/fmtWeight`, `label`, `normalizeUnit` (only 1 is Imperial), `unitText` (relabel a translated string that embeds "kg"/"Kg", e.g. "Weight (kg)", "kg/Seite", "（kg）", so no per-language entries are needed). Tests: `static/units-core.test.js` (round trip is stable for every stored value 0..2000, so opening and saving a program in lb never changes untouched weights).
- `static/units.js` (`Units`): the one shared current-unit state. `Units.load(api)` fetches `/app/getInfo` at start and after login; `loadProfile()` also calls `Units.set` (so the Profile tab, after saving a unit change, switches every screen). `Units.onChange(fn)`.
- Static labels that embed "kg" are `<span data-unit-src="English source">`; `Units.relabel()` rebuilds them from the source string on a unit change and after a language switch (it runs after `I18N.applyStatic`).
- `lb` key added to `i18n.js` next to `kg` (language-invariant symbol; other packs fall back to the key exactly as they do for `kg`).

## Where it applies
- Programs editor `sideWeight` column (shows lb when Imperial, typed value -> tenths of kg via `Units.toTenths`). Header/aria labels follow the unit. The column is now headed "Load (kg|lb)" with a read-only weight-mode badge per step (see `docs/plan-sideweight.md`); the typed value is still stored as-is in tenths of kg.
- Activity: dashboard record meta, explorer record rows, report volume and per-set weight (`ActivityCore.fmtWeight`).
- Medals: Volume medal captions convert to whole lb when Imperial (`ActivityCore.badgeCaption`: 5000 / 20000 / 50000 kg -> 11023 / 44092 / 110231 lb, as in the official Medal screen; its medal artwork still says "KG", ours is the hosted image). Consume/Duration medals are untouched.
- Fitness: kg results convert to lb (`FitnessCore.formatValue(slot, unit)`); reps untouched.
- Profile: target weight and (read-only) weight display in the loaded unit. Untouched target weight is sent back as the stored kg value (no conversion noise). A unit change saved in the same submit does not reinterpret the number (inputs use the unit the profile was loaded with).

## Known gaps / open items
- Height stays cm (read-only anyway, upstream 500s).
- Label is "lb" (official app writes "lbs").
- A hidden editor keeps its old (language-stale) labels until re-rendered: pre-existing behaviour.

## QA
`qa/units-stub-init.js` (init script; `#metric` / `#imperial`; needs `node qa/fixture-server.js` on :8799 and any static server). Verified at 320/768/1280: no horizontal overflow, editor 50/85/170 -> 11.0/18.7/37.5 lb, typing 22/15 lb stores 100/68, live Imperial<->Metric switch re-renders the editor, ES/DE/EN labels, fitness 54.7 kg -> 120.6 lb, history/explorer/report in lb, profile save payloads (`[]` untouched, `72.6` for 160 lb, `{unit:0}` + `68` for a mixed save). No console errors.
