# Plan: program export / import (JSON) and Clone

Source: community feedback ("program export/import for backups and sharing", "preserve versions"). The Clone idea came from the project owner.

## Decisions

- Plain **JSON file** export and import. No share links or codes.
- A **Clone** button on each program card copies the program and asks for a new name, prefilled from the old one.
- "Versions" means the user keeps their own exported files. In-app history or snapshots are a later task.

## API notes (see CLAUDE.md and `docs/plan-api.md`)

- `course/custom/save` is an upsert: omit `id` to create. It needs the **full** program object, so re-fetch `course/custom/detail?id=...` right before cloning or exporting. A partial body returns 500.
- `course/custom/list` gives the program list; `detail` gives `warmUpStepList`, `mainStepList`, `relaxStepList` and the cover images.
- Weights are stored in tenths of a kg, regardless of the account unit. Exports must keep stored values, never display values, so files do not depend on the unit setting.

## Scope

### A. `static/program-io-core.js` (new, pure, tested)
- `buildExport(courses, {appVersion, now})` -> `{format: "myinnox1-program", formatVersion: 1, exportedAt, programs: [ ... ]}`.
- Per program keep: `name`, `description`, cover fields (`smallImg`, `detailsImg`), `level`, `courseType`, `deviceCategory`, `sportType`, and the three step lists with only the step fields the save endpoint needs (`actionLibraryId`, `actionName`, `actionNo`, `sort`, `stage`, `count`, `countType`, `groupNum`, `restTime`, `sideNum`, `sideWeight`, `mode`, `modeParam`, ...). Exact list: derive from a real `detail` response and from what `save` accepts.
- Strip account-specific and server-computed fields: `id`, `courseNo`, timestamps, per-step `id` and `courseId`, `collected`, `custom` flags that the server sets.
- `parseImport(text)` -> `{programs, errors}`:
  - JSON parse errors, wrong `format`, a newer `formatVersion` than we know, programs without a name or steps, wrong types.
  - Reject, never guess. Report which program and field failed.
- `uniqueName(name, existingNames)` -> "Name (copy)", "Name (copy 2)", and so on.
- `toSaveBody(program, {name})` -> body for `course/custom/save` without `id`.
- `cloneName(name, existingNames)` using `uniqueName`.

### B. Programs screen UI (`static/app.js`, My programs list)
- **Export** button per program card and an **Export all** button at the top: downloads `myinnox1-<slug>-<date>.json` via a Blob. One file may hold one or many programs.
- **Import** button: file picker, `parseImport`, a preview dialog listing the programs ("3 programs found") with per-program checkbox and editable name, then save each through `course/custom/save` sequentially with progress and per-item result. A failure on one does not stop the others.
- **Clone** button per program card: re-fetch `detail`, prompt for the new name (prefilled with `cloneName`), save without `id`, refresh the list. Cancel does nothing.
- Validate that every `actionLibraryId` still exists in the action library (`getActionLibrary()`); if one is missing, warn and offer to skip that step or cancel.
- Show the upstream's account limits if any appear (unknown; surface any API error text instead of hiding it).

### C. i18n
New strings in all packs: "Export", "Export all", "Import", "Clone", "Name for the copy", "{n} programs found", "Imported {ok} of {total}", error messages.

## Out of scope

- Plans (training plans) export.
- In-app version history, diffing or restoring.
- Exporting activity history.
- Share links.

## Tests

- `static/program-io-core.test.js`: export/parse round trip, malformed JSON, wrong format, newer version, duplicate names, field stripping, large programs, steps of every `sideNum` and `countType`.
- Fixture-server QA (`qa/fixture-server.js`): clone, export, import of one and many programs, name collisions, failure mid-import, and a missing action id.
- Manual against a throwaway program on the real API: clone, export, delete the original, import, compare `detail`.

## Order and dependencies

- Independent of the units and side-weight work. Weights stay in stored tenths of kg, so no conversion is involved.
- Clone can ship first (small, no file handling); export and import follow.

## Open items

- Which exact step fields `save` requires versus tolerates (derive from a live `detail` plus a round trip).
- Whether cover images can be referenced by URL on import or must match the cover list.
- Is a file with several programs the right default for "Export all", or one file per program?
