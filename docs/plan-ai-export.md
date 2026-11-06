# Plan: AI-assisted routines (library export for LLMs + simple import format)

Source: community feedback. Users want to ask ChatGPT/Claude/etc. "make me a weekly routine for strength / fat loss that I can import in MyInnoX1". Two blockers were reported:

1. The AI does not know the **movement library IDs**, so any file it writes is not recognised on import.
2. The AI does not know **our file format**, and today's `myinnox1-program` format is too heavy for it (see below). Plans cannot be imported at all.

## Findings from the current code

- Program import/export already exists (`docs/plan-export-clone.md`, `static/program-io-core.js`). Format `myinnox1-program` v1 is the raw `course/custom/detail` object minus identity fields. Each step carries ~20 fields (`actionName`, `actionNo`, `actionType`, `countType`, `sideNum`, `stage`, `mode`, `modeParam`, `duration`, `muscleGroups`, `trainingPoint`, ...), and `sideWeight` is in **tenths of a kg**. An LLM cannot be expected to produce that reliably, and should not have to.
- Everything except the user's choices can be derived from the library action: `addStepFromAction()` in `static/app.js` shows the mapping. The server also overrides `sideNum` and `countType` from the library on save (`docs/plan-sideweight.md`).
- The library (`GET /action/list`, cached by `getActionLibrary()`) has 268 actions with `id`, `name`, `actionType` (1 stretch, 2 warm-up, 3 strength), `level` (1-3), `muscleParts` (ids 1-8), `sideNum` (0 none, 1 per side, 2 combined), `countType` (1 reps, 2 seconds). Custom actions come from `?custom=true` and have account-specific ids.
- Plans exist upstream (`docs/plan-api.md`): `plan/save` takes `planItemMap { "yyyy-MM-dd": [{courseId}] }`. A plan only references **programs by id**, so plan import must come after program import.

## Decisions

1. **Do not ask the AI for the existing format.** Add a second, deliberately small input format, `myinnox1-routines`, and hydrate the heavy fields from the library on import. The old `myinnox1-program` format stays untouched and keeps working.
2. **The AI kit is self-contained text.** One button produces a prompt that contains the instructions, the format, the rules and the whole library, so the user pastes one thing into any chat and then states their goal. No account, API or file attachment needed. A file download is offered for tools that prefer attachments.
3. **Weights in the AI format are plain kg** (decimals allowed), whatever the account unit. Conversion to stored tenths happens on import.
4. **A "weekly routine" = several programs.** A program is one session. The AI generates one routine per *distinct* session (for example Push / Pull / Legs), not one per calendar day, and the file also says on which weekdays to do them. Repeating weeks reuse the same routines.
5. **Plans: v1 imports programs only; v2 adds plan creation** from the same file (section D). The user's question "can the AI generate a plan?" is answered by the optional `schedule` field, which is written in v1 but only acted on in v2.

## Scope

### A. Library export for AI (Actions screen -> Library)

New menu button **"Use with AI"** in the Library header with:

- **Copy AI prompt** (primary): copies the full prompt (section C) to the clipboard, shows "Copied. Paste it in your AI chat and add your goal."
- **Download library (.json)**: `myinnox1-library-<lang>-<date>.json`.
- **Download format guide (.md)**: the instructions without the library, for people who attach files.
- Include-custom-actions checkbox, default on, with a note that custom ids only work in this account.

Library file shape (compact, human-readable names instead of numeric codes so the AI needs no legend):

```json
{
  "format": "myinnox1-library",
  "formatVersion": 1,
  "language": "en",
  "exportedAt": "2026-11-06T10:00:00Z",
  "actions": [
    { "id": 501, "name": "Pull-Up", "type": "strength", "level": "advanced",
      "bodyParts": ["back", "arm"], "load": "per_side", "measure": "reps", "custom": false }
  ]
}
```

- `type`: stretch | warmup | strength. `level`: beginner | intermediate | advanced. `bodyParts`: names from `MUSCLE_GROUPS` (chest, shoulder, back, arm, hips, legs, abdomen, full-body). `load`: none | per_side | combined. `measure`: reps | seconds.
- `name` is in the current UI language; `id` is language independent. The `language` field says which.
- Left out on purpose to save tokens: video/picture URLs, `trainingPoint`, `breathTip`, default weight. Estimated size for 268 actions: about 8-10k tokens as JSON, about 5-6k as the table form used in the prompt.
- Inside the prompt the library is rendered as a pipe table (`id | name | type | level | parts | load | measure`) rather than JSON, because it is cheaper and just as parseable. The downloadable file stays JSON.

### B. Routine format `myinnox1-routines` v1 (what the AI writes)

```json
{
  "format": "myinnox1-routines",
  "formatVersion": 1,
  "routines": [
    {
      "name": "Push A",
      "description": "Chest, shoulders, triceps. About 45 min.",
      "level": "intermediate",
      "warmUp":   [ { "actionId": 210, "sets": 1, "seconds": 30 } ],
      "main":     [ { "actionId": 305, "sets": 4, "reps": 8, "restSeconds": 90, "weightKg": 20 },
                    { "actionId": 311, "sets": 3, "reps": 12, "restSeconds": 60 } ],
      "cooldown": [ { "actionId": 402, "sets": 1, "seconds": 30 } ]
    }
  ],
  "schedule": [
    { "weekday": "mon", "routine": "Push A" },
    { "weekday": "wed", "routine": "Pull A" }
  ]
}
```

Rules (these are also the validation rules, and are copied into the prompt):

| Field | Rule |
|---|---|
| `routines` | 1-7 items. Names unique inside the file. |
| `main` | Required, at least 1 step. `warmUp` and `cooldown` optional. |
| `actionId` | Integer taken from the library. Anything else is an error. |
| `sets` | Integer 1-10 (maps to `groupNum`). |
| `reps` | Integer 1-100. Required when the action's `measure` is `reps`, forbidden when `seconds`. |
| `seconds` | Integer 5-600. Required when `measure` is `seconds`, forbidden when `reps`. |
| `restSeconds` | Integer 0-300, optional, default 30 (the editor default). |
| `weightKg` | Number >= 0 with at most 1 decimal, optional. Omitted -> library default. Ignored (warning) when `load` is `none`. For `combined` actions it is the load **per cable**, same as the editor field. |
| `level` | beginner / intermediate / advanced, optional, default beginner. |
| `schedule` | Optional. `weekday` is mon..sun, `routine` must match a routine name. Informational in v1. |

Hydration on import (new `hydrateStep(step, action)`), producing the same step object `addStepFromAction()` builds today: `actionLibraryId`, `actionName`, `actionNo`, `actionType`, `picUrl`, `videoUrl`, `stage`, `count`, `countType`, `sideNum`, `sideWeight` (kg x 10, rounded), `restTime`, `groupNum`, `consume`, `muscleGroups`, `muscleParts`, `trainingPoint`, `breathTip`, `mode: 0`, `modeParam: "{}"`, `custom`, `duration`. The program then goes through the existing `toSaveBody()` and the existing import preview/save path.

Error handling reuses the import preview. Additions:

- Errors name the routine, list, step number and the reason ("Push A / main / step 3: actionId 999 is not in your library").
- A **Copy errors for AI** button copies a short plain-text list so the user can paste it back in the chat and get a corrected file. Unknown ids are *not* silently dropped for this format (the AI meant them); the program is blocked until fixed, with an option to skip the bad steps.
- Rejects, never guesses, same as `parseImport`: wrong `format`, newer `formatVersion`, empty `routines`, wrong types, out-of-range numbers.

### C. The prompt (always English; routine names in the user's language)

Sections, in order:

1. Role and context: you design strength routines for the Innodigym / MyInnoX1 digital cable resistance machine; the user will import your output.
2. What to ask first if missing: goal, days per week, minutes per session, experience, injuries or limits, preferred body-part focus. Ask at most one round of questions, then answer.
3. How routines map to sessions: one routine per distinct session; usually 2-4 routines for a week; do not duplicate a routine per day; say which weekdays in `schedule`.
4. Design guidance: warm-up and cooldown from `warmup` / `stretch` actions, main from `strength`; 5-8 main exercises per routine; match level to the user's experience; start loads conservative, because the AI cannot know the user's strength and the user adjusts after import.
5. The format and rules of section B, with one complete example.
6. Output contract: reply with **one JSON code block and nothing else after the questions are answered**; use only ids from the library; never invent an id; if no suitable action exists, pick another.
7. The library table.
8. Placeholder line at the end: `My goal: ` (cursor lands there when pasted).

Prompt text lives in one constant in `ai-kit-core.js` so it can be reviewed and versioned (`promptVersion` is added to the downloaded guide).

### D. Plans (v2, same file)

After a successful import of a file that has `schedule`, offer **Create a plan from this**: dialog asks start date (default next Monday) and number of weeks (default 4), previews the generated `planItemMap` (each `schedule` weekday repeated weekly, mapped to the id of the newly saved program), then calls `plan/save` as documented in `docs/plan-api.md` (`curTime`, `name`, `weeks`, `preferDays`, `trainDays`, `startDate`, `planItemMap`). Because `plan/save` returns no id and the app limits editing, show the plan in the existing planner afterwards. Not in v1 because it needs real-API QA and the program ids returned by save.

### E. Import UX changes

- The Import dialog gets a **Paste JSON** tab next to the file picker, since AI output is copied from a chat, not saved as a file. Tolerate a surrounding Markdown code fence and text before/after it (extract the first balanced JSON object).
- `parseImport` detects `format` and routes `myinnox1-routines` to the new parser; `myinnox1-program` behaves exactly as today.
- Import button text unchanged; the dialog subtitle mentions "Programs or AI routines".

## Files

- `static/ai-kit-core.js` (new, pure, tested): `libraryForAI(actions, {lang, includeCustom})`, `libraryTable(actions)`, `buildPrompt(actions, opts)`, `parseRoutines(text, library)` -> `{programs, schedule, errors}`, `hydrateStep`, `extractJson(text)`, `errorsForAI(errors)`.
- `static/ai-kit-core.test.js` (new).
- `static/ai-kit.js` (new): "Use with AI" menu, clipboard and downloads.
- `static/program-io.js` / `program-io-core.js`: format dispatch, paste tab, "Copy errors for AI". No change to the v1 program format.
- `static/index.html`, `static/style.css`, `static/i18n*.js` (all packs): new strings.
- `README.md`: a short "Using an AI to build routines" section with the three steps and a link to this plan.
- Optional: `docs/ai-routines-format.md`, the public format reference (same content as sections B and C).

## Out of scope

- Calling an LLM from the app (no keys, no backend).
- Per-set weights or reps (the server model has one `count` and one `sideWeight` per step), supersets, tempo.
- Feeding the user's history to the AI (last weights, volume). Good follow-up: an optional "include my last used loads" section in the prompt, from the fitness records.
- Exporting existing plans.

## Tests

- Library export: counts, name language, custom filter, no secrets or URLs, stable ordering by id.
- Prompt: contains every library id exactly once, the format example parses with `parseRoutines` against the fixture library (guards drift between prompt and parser).
- `parseRoutines`: valid file; each rule in the section B table (positive and negative); reps vs seconds mismatch; unknown id; `load: none` with a weight; duplicate routine names; fenced or chatty input; newer version; schedule pointing to a missing routine.
- Hydration equals what `addStepFromAction()` would build for the same action (unit test comparing the two), with kg -> tenths rounding (12.5 kg -> 125, 0.1 kg -> 1).
- Fixture-server QA: copy prompt, paste a valid and a broken response, fix via "Copy errors for AI", import several routines at once, unknown id, language switch re-exports the right names, 320 px layout.
- Manual with real ChatGPT and Claude on three goals (strength, fat loss, beginner full body): record how often the output imports without edits; the target is below.

## Acceptance criteria

- A user with no technical background can: press **Use with AI** -> **Copy AI prompt**, paste it in a chat, type a goal, paste the answer into **Import -> Paste JSON**, and see the routines saved as programs.
- At least 9 of 10 first attempts across the manual test imports without edits; failures show an actionable message that, pasted back to the AI, gets fixed on the next reply.
- Weights typed in kg land in the program as the same kg whether the account is in kg or lb.
- Existing `myinnox1-program` export/import/clone behaves exactly as before.
- Unit tests pass with `node static/ai-kit-core.test.js`.

## Open items (resolve before or during build)

1. Confirm `stage` values for warm-up and cooldown steps from a real program `detail` (the editor only creates `stage: 2` main steps today), and how warm-up/relax steps differ in `save`.
2. Machine limits: maximum steps per program and sets per step, to set the caps in section B instead of guessing.
3. Do custom action ids work on other accounts? Assumed no, hence the checkbox and the "ids only valid in this account" note.
4. Prompt size across languages and whether to drop `level` / `bodyParts` columns for models with small context. Decide after measuring token counts.
5. Whether the library should also be reachable without opening the app (a static `library-en.json`)? Probably no: it needs the user's account for custom actions and the language setting.
6. Plan v2: does `plan/save` accept course ids immediately after `course/custom/save`, and how to obtain the new program id (the same diff-the-list approach as plans, per `docs/plan-api.md`).
