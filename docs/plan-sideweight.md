# Plan: weight mode (`sideNum`) in the program editor and custom actions

Source: community feedback (5 kg per side showed as 11 lb on the machine's template preview and 22 lb on its workout screen with "Combined" selected), official-app screenshots and live API probes of 2026-10-31 and 2026-11-01.

## Findings (confirmed)

- **`sideNum` is the weight mode.** `1` = Per Side, `2` = Combined, `0` = no weight (warm-ups, stretches, some bodyweight strength moves).
  - The official "Create Action" screen has a **Weight mode: Per Side / Combined** choice. Two custom actions created with it, read via `GET /action/list?custom=true`: "Custom - Per side" -> `sideNum` 1, "Custon - Combined" -> `sideNum` 2.
  - Library counts (268 actions): `sideNum` 2 = 80 (e.g. Weighted Calf Raise, Bench Press, Seated Chest Fly), 1 = 94 (e.g. Single Arm Rear Extension L/R, Single-Arm Row, Hammer Curl), 0 = 94.
  - The server overrides a step's `sideNum` and `countType` from the action library on save.
- **A step stores exactly what the official editor shows**, in tenths of a kg, with no halving or doubling in the API or in the official detail view:
  - Weighted Calf Raise (`sideNum` 2): stored `sideWeight` 50 -> detail shows 5.0 kg.
  - Single Arm Rear Extension (L) (`sideNum` 1): stored 100 -> detail shows 10.0 kg.
  - Earlier probes agree: stored 100 -> 10.0 kg / 22.0 lb, stored 68 -> 6.8 kg / 15.0 lb.
- Library `sideWeight` is a default of "5" (kg) for every action. It says nothing about the mode.
- **Our "My actions" list was empty for a different reason than the old on-screen hint claimed.** The default `GET /action/list` never contains custom actions; `GET /action/list?custom=true` returns them (with `sideNum`, `countType`, `actionType` 3, `custom: true`). It is not an upstream delay.

## Corrections to earlier notes (these claims were wrong)

- "The stored value is the combined total for `sideNum` 2" - wrong. The stored value is exactly the number shown in the editor.
- "Our 'Kg / side' column writes the per-side value straight into `sideWeight`, so it halves the load on `sideNum` 2 exercises" - wrong. There is no conversion between what is typed and what is stored. Only the column's label ("per side") was misleading for Combined exercises.

## Resistance model (inferred, pending a machine check)

Source: the community report plus the project owner's reading of the machine. Not yet verified on the machine.

- `sideWeight` is the resistance **per cable**, exactly the number the official app shows and the API stores (Calf Raise `sideNum` 2, stored 50 = 5.0 kg on each side).
- For Combined (`sideNum` 2, both cables work at once) the machine's workout screen shows the **total**, 2 x `sideWeight`: 5.0 kg per cable -> 10.0 kg / 22 lb total. The template preview shows the per-cable value (11 lb). This matches the Reddit numbers (11 lb preview, 22 lb workout screen).
- For Per side (`sideNum` 1, one cable) the displayed value is just `sideWeight`. `sideNum` 0: no weight.
- The API multiplies nothing: the server `capacity` of a course is the sum of count x groups x `sideWeight` (program "Nuevo": 12 x 50 + 12 x 100 = 1800 tenths), with no `sideNum` factor. Stored values never change because of this readout.
- **Machine check to confirm:** run program "Nuevo" (id 2423: Per side stored 50, Combined stored 100) and read the workout screen. Expected: 5 kg for the Per side exercise and 20 kg total for the Combined one. If the machine shows 10 kg for the Combined step, remove the readout (the code is isolated in `WeightModeCore.totalTenths`).

## Scope of this change

1. `static/weight-mode-core.js` (pure, tested): `modeFor(sideNum)` -> `{key, label, hasWeight}`. 1 -> "Per side", 2 -> "Combined", 0 -> "No weight" (input disabled, stored value untouched), unknown or missing -> no label and the input stays editable.
2. Program editor: the weight column header is "Load (kg|lb)", and each step shows a read-only badge with its weight mode next to the input. For Combined steps the input is labelled "Load per cable" (tooltip and aria-label) and a live readout under it shows the total ("x2 cables = 10.0 kg total"), computed from the stored tenths and then converted to the account unit (so 3.7 kg per cable reads 8.2 lb each and 16.3 lb total, not a doubled rounded value). Per side steps show no readout. Conversion goes through the units module.
3. "My actions" list: use `GET /action/list?custom=true`, drop the obsolete "upstream quirk" hint, and show the weight mode in each card.
4. No other screen shows a step's weight read-only (courses, planner and the program cards show none), so nothing else changes.

## Not in this change

- The add-custom-action form. It sends only `name`, `countType`, `consume`, `actionType: 3`. The official form also sends body part, difficulty, type, equipment/bodyweight, timer/repetition and the weight mode. The request field names are unknown (a capture of the official "Create Action" request would give them, or probe candidates on a throwaway action). Once known, add a Per Side / Combined choice that writes `sideNum` 1 / 2.
- The action picker still lists the library only (`getActionLibrary()` uses the default list, which excludes custom actions). Whether custom actions should be offered in the picker is a separate decision; a program that uses a custom action can still be loaded and edited.
- The "Seconds" label for time-based exercises (`countType` 2), which the editor still labels "Reps". Verify before changing.

## Tests

- `static/weight-mode-core.test.js`: mapping for 0/1/2, numeric strings, unknown or missing values never locking the field, `totalTenths` / `breakdown` (Combined doubles, others as stored, bad input gives 0) and lb rounding (total converted from stored tenths, not doubled from a rounded lb value).
- Browser check against the fixture server at 320/768/1280 in English and Spanish, with steps of sideNum 0/1/2 and a custom-actions stub.
- Real API, read-only: `GET /action/list?custom=true` returns the two custom actions; program 2420 loads with Calf Raise "Combined" and Rear Extension (L) "Per side".
