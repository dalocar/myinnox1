# Step training modes (Eccentric, Spring, Isokinetic)

Feature request: add eccentric and other modes. Today a program is built in normal mode and each exercise is changed on the machine.

## How the official app does it

In the program editor, every step has a mode dropdown under its name (default "Standard"). The options are Standard, Eccentric, Spring and Isokinetic. Picking one replaces the step's weight field with the mode's own fields. Tested on 2026-11-18 by building a program in the native app and reading it back from `course/custom/detail`.

## API: `mode` and `modeParam` on each step

Both are plain step fields, saved through `course/custom/save` like everything else. `modeParam` is a JSON string. Force values are kg x 10 (like `sideWeight`), length and speed are in millimetres.

| `mode` | App label | UI fields | `modeParam` keys |
|---|---|---|---|
| 0 | Standard | Weight (kg), the usual `sideWeight` | `{}` |
| 1 | Eccentric | Eccentric (kg) 15.0, Concentric (kg) 10.0 | `kgLX1` = eccentric x10 (150), `kgLX2` = concentric x10 (100) |
| 2 | Spring | Initial Force (kg) 10.0, Max Force (kg) 15.0, Length (m) 0.50 | `kgTL1` = initial x10 (100), `kgTL2` = max x10 (150), `kgTL3` = length in mm (500) |
| 3 | Isokinetic (dropdown shows "Constant" once chosen) | Speed (m/s) 0.50 | `kgSD1` = speed in mm/s (500) |

Behaviour of the mode, from the app's own descriptions: Standard pulls out and returns with equal force. Eccentric pulls out with less force than the return force, which trains the lengthening phase. Spring raises the resistance with the distance pulled. Isokinetic raises the resistance with pull speed.

Other facts:

- `sideWeight` keeps its old value (50) when a non-standard mode is chosen. It is simply not used for that step.
- The app may keep stale keys from modes the user toggled through (one step saved with all of `kgLX1/2`, `kgTL1/2/3`, `kgSD1`). Only the keys of the active `mode` matter.
- The app's translation files also name Isometric, Assisted Pull-Up and Gear modes, but the program editor does not offer them.
- Official library courses use `mode` 6 on 444 steps. Its meaning is unknown and it is not selectable in the editor.
- Defaults the app applies when switching to a mode: Eccentric 15.0 / 10.0 kg, Spring 10.0 / 15.0 kg / 0.50 m, Isokinetic 0.50 m/s.

## Units and limits

Measured in the official app's program editor on 2026-11-18 (typing extreme values into each field), plus programs it saved:

| Field | Range (kg) | Step |
|---|---|---|
| Eccentric (`kgLX1`) | 3 to 60 | 0.5 |
| Concentric (`kgLX2`) | 2 to 59 | 0.5 |
| Spring initial force (`kgTL1`) | 2 to 59 | 0.5 |
| Spring max force (`kgTL2`) | 3 to 60 | 0.5 |
| Spring length (`kgTL3`) | about 0.02 to 2.5 m | 0.01 m |
| Isokinetic speed (`kgSD1`) | 0.1 to 2.5 m/s | 0.01 m/s |

Typed values are clamped when the field is left or Enter is pressed (a value like 12.37 becomes 12.5). The app keeps Concentric at least 1 kg below Eccentric, and Spring max at least 0.5 kg above initial, but only when the first field of the pair is edited: Concentric 40 next to Eccentric 3 was accepted when typed last. The webapp enforces both pairs in both directions. The server enforces none of this: values like 1000 kg or `mode` 9 were stored as sent. The 60 kg top force also matches the OMNI X1 Pro's published 120 kg over two cables. Not pinned down: the exact minimum Spring length (typing 0 gave 0.02 m, but 0.10 m showed up once after other fields changed).

Units, from programs saved by the official app on an imperial account (profile `unit` 1):

- **Stored values are kg tenths, plus lb keys.** Imperial accounts also write the force fields in pounds, after the kg keys: `lbLX1/2` (Eccentric) and `lbTL1/2` (Spring), in tenths of a lb. A typed 61.0 lb is stored as `lbTL1: 610` and `kgTL1: 277` (27.7 kg, 0.1 kg granularity); a typed 15.0 / 14.0 lb as `lbLX1: 150, lbLX2: 140` and `kgLX1: 68, kgLX2: 64`. Metric accounts write kg only. The binary also names `kgYT1/2` and `lbYT1/2` (assisted pull-up), which the editor does not offer. Length and speed have no lb key.
- **Reported, not reproduced:** the official editor shows the kg defaults (15.0 / 10.0) with a "lbs" label on imperial accounts, instead of 33.1 / 22.0 lb. The account was switched to metric before this could be checked; it also shows a mixed picture (its detail view labels the same values in kg, and Standard weight stays labelled kg).
- **The webapp** shows and edits force fields in the account unit, converts to tenths of a kg, keeps the lb key exactly as typed (so 100.0 lb reads back 100.0, not 100.1), and writes or refreshes lb keys on imperial accounts and on any step that already has them. Programs saved here show the right numbers here; the official app may label them differently.

## Setting it from the webapp

`course/custom/save` accepts `mode` and `modeParam` directly: a step changed to mode 1 with `{"kgLX1":200,"kgLX2":120}` was stored as sent, and the official app then showed it correctly (a Spring step written through the API showed Initial 8.0, Max 20.0, Length 0.60). The server does not validate: mode 9 and an empty `modeParam` for mode 1 were both stored without error. The webapp must therefore validate itself.

So a program can be prepared ahead of time with modes, without touching the machine. Not verified: whether the machine applies the modes when it runs the program. The official app writes the same fields, so it should.

## Implementation (done)

`static/step-mode-core.js` (+ test) holds the mode table, parsing, serializing and validation. The step editor shows a mode select under each weighted step's name and the mode's fields in the load column, plus a "Set mode for all steps" select above the table. Steps with no weight (`sideNum` 0) and unknown modes (such as 6) get no select and are saved untouched. Saving is blocked with a message when an active mode has a zero value. The original plan, for reference:

## Original plan

- Pure logic in a new `step-mode-core.js` (+ tests): mode table above, `defaultParam(mode)`, `parse(step)` to form values, `serialize(mode, values)` to the JSON string, clamping and validation.
- In the step editor, a mode select per step. For Standard keep the weight input. Otherwise show the mode's fields in kg/m using the existing unit conversion (`Units.fmtTenths`, tenths of a kg). Write only the active mode's keys.
- Keep `custom`, other fields and unknown modes (such as 6) untouched on save. Show an unknown mode as read-only.
- New steps keep `mode: 0`, `modeParam: "{}"`. Import and export already carry both fields.
- Weight-mode badge and combined total apply to Standard only.
- New strings in all language packs. English labels: Standard, Eccentric, Spring, Isokinetic.
- Optional: a "set mode for all steps" shortcut, since the requester uses eccentric on about 60% of exercises.
