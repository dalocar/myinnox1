# AI routines V1: implementation notes

Issue #10, branch `ai-routines-v1`. Design: `docs/plan-ai-export.md`.

## Files
- `static/ai-kit-core.js` + `.test.js`: pure logic (library export, prompt text, `parseRoutines`, `hydrateStep`, `extractJson`, `errorsForAI`).
- `static/ai-kit.js`: "Use with AI" menu in Actions -> Library (copy, two downloads, include-custom checkbox, manual-copy textarea when the clipboard is blocked).
- `static/program-io-core.js`: `parseImport(text, {library, tolerant, skipBad})` dispatches by `format`; the `myinnox1-program` branch is unchanged.
- `static/program-io.js`: Import button now opens a dialog with File / Paste JSON tabs; preview extras for routines (suggested days, schedule problems, skip bad steps, Copy errors for AI).
- QA: `qa/ai-kit-stub-init.js` (stateful stub, real 268-action library + 2 custom actions).

## Decisions on the open items
1. **`stage`**: warm-up steps `stage: 1`, main `2`, cooldown `3`. Evidence: `courses-core.js` documents official programs as warm-up = stage 1, stretch = stage 3 (lists `warmUpStepList` / `relaxStepList`); the only fixture `detail` (`course-detail-41.json`) only has main steps (stage 2). Not verified against a real saved warm-up step: check in real-API QA that the server accepts and round-trips them.
2. **Caps** (provisional, `LIMITS` in the core): routines 1-7, sets 1-10, reps 1-100, seconds 5-600, rest 0-300, weightKg 0-300 (the weight bound is a sanity check, not a machine limit). No cap on steps per program.
3. **Custom ids**: assumed account-specific; the checkbox and note say so. On import they are checked against the importing account's library (`getPickableActions`).
4. **Prompt size**: full real library = about 25k characters (roughly 7k tokens); columns kept. Not measured per language.

## Behaviour worth knowing
- `null` is treated as "absent" for optional fields (AIs often write `"weightKg": null`). Unknown fields are ignored. Wrong types/ranges are errors; nothing is guessed.
- The prompt's example is generated from the actual library so it always parses (test guards it).
- `duration` of a hydrated step is 12 like `addStepFromAction()` (test compares both against the real function in `app.js`). `muscleParts`/`partsList` of the program are left at the blank-template defaults, as the editor does.
- Weight on a `load: none` action: warning, library default used.
- Schedule problems (unknown routine, bad weekday) are listed and included in "Copy errors for AI" but do not block importing the routines.
- Skip option re-parses with `skipBad`: step problems become "Skipped step" warnings; a routine with no steps left stays blocked; routine-level problems (name, duplicate, level) are never skipped.
- Paste tab accepts fences and chatter (`extractJson` = first parseable `{...}`, preferring one with a `format` key). File import stays strict.
- Fatal errors in the paste tab are shown inline (text is kept) with Copy errors for AI.
- Pre-existing quirk noticed: `getActionLibrary()` caches an empty list if the first fetch returns no data.

## Round-1 QA changes
- Malformed JSON: `findJson` reports "JSON found but invalid" (`invalid-json`, with the parser message and a hint) instead of "no JSON" or a misleading wrong-format. A format-less object is only returned when nothing else in the text failed to parse or close, so inner fragments of a truncated reply, or a stray valid object before a broken answer, give `invalid-json` ("cut off") rather than wrong-format; objects with a `format` key always win. Still rejects, never repairs (trailing commas, comments, curly quotes).
- `findJson` has a work budget proportional to the text length (no quadratic scans on unbalanced braces).
- The prompt's numeric rules and caps are built from `LIMITS`; tests check the prompt text and the parser boundaries against `LIMITS`.
- Routine name max 60 and description max 300 characters (the program editor has no limit; these are provisional like the other caps), counted in code points; names echoed in errors are cut to 40 characters.
- Import dialog: tablist semantics (role tab/tabpanel, aria-selected, arrow/Home/End keys). Plain file import now costs one extra click (Import -> Choose file, which has focus) because the dialog hosts both sources.

## Still unverified
- `stage` 1 (warm-up) / 3 (cooldown) against the real `course/custom/save` and `detail` round trip.
- Provisional caps vs real machine limits (sets, steps, name length) and weight upper bound.
- Custom action ids on other accounts (assumed account-specific).
- Non-English library names in the prompt (token size, AI behaviour); prompt token count per language.
- Manual runs with real ChatGPT and Claude (target 9/10 first attempts import without edits).

The parser's detail text (`invalid-json` detail, the JS engine's SyntaxError message) is English-only and not translated; it is meant for the AI chat.
320 px and the 7 themes were verified by QA in rounds 1 and 2.
