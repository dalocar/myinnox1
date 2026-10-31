# Export / import / clone: implementation notes

Branch `feat/export-clone`. Plan: `docs/plan-export-clone.md` (kept outside this branch; it was untracked when the branch was cut).

## Files
- `static/program-io-core.js` + `program-io-core.test.js`: pure logic (export shape, parse/validate, `cloneName`, `uniqueName`, `toSaveBody`, filenames). 15 tests.
- `static/program-io.js`: screen code (export, import preview/results, clone dialog). Loaded after `app.js`; uses its globals (`api`, `toast`, `t`, `loadPrograms`, `getActionLibrary`).
- `static/app.js`: only the program card gets Clone/Export buttons (about 5 lines in `loadPrograms`).
- `static/index.html`: Import / Export all buttons, hidden file input, shared `#pio-modal` dialog, two script tags.
- `static/style.css`: block at the end ("program export / import / clone").
- `static/i18n*.js`: 46 new keys in every pack (es in `i18n.js`).
- QA: `qa/program-io-stub-init.js` (stateful stub of `/api/course/custom/*` and `action/list`), `qa/fixtures/program-io/*.json`, `qa/screens/pio-*.png`.

## File format (version 1)
```json
{ "format": "myinnox1-program", "formatVersion": 1, "exportedAt": "ISO", "app": "MyInnoX1 <sha>", "programs": [ { ...course/custom/detail minus identity fields } ] }
```
- Denylist, not whitelist: stripped are `id, courseNo, createTime, updateTime, createBy, updateBy, userId, collected` on the course and `id, courseId, createTime, updateTime` on each step. Everything else from `detail` is kept, because `save` needs the full object and we do not know the minimal set.
- Weights stay as stored (tenths of a kg). Nothing is converted, so the units work cannot affect files.
- Import rejects instead of guessing: wrong `format`, `formatVersion` newer than 1, empty `programs`. Per program: missing name, no steps, non-array step lists, non-object steps, non-numeric/negative `actionLibraryId/count/groupNum/restTime/sideWeight`, non-integer `sideWeight`. Invalid entries stay in the preview, disabled, with the reason; the rest can still be imported.
- Missing top-level fields are filled from the same defaults as the blank template; `sort` is renumbered per list; `duration`/`capacity` are recomputed only when missing.

## Behaviour
- **Clone**: re-fetches `detail`, saves without `id`, name prefilled `Name (copy)` / `(copy 2)`. The suffix word is translated (`t("copy")`). A duplicate name only shows a hint, it does not block.
- **Export / Export all**: sequential `detail` fetches (one request at a time), Blob download `myinnox1-<slug>-<date>.json`, or `myinnox1-all-<n>-<date>.json`.
- **Import**: preview with checkbox and editable name per program; colliding names get the copy suffix (also against other rows in the same file). Steps whose `actionLibraryId` is not in the account's action library are dropped with a warning; a program left with no steps is blocked. Saves run sequentially; one failure does not stop the others. If the library cannot be loaded, the check is skipped.
- Modal: Escape and backdrop close are disabled while saving; focus is trapped; sheet layout under 720 px with sticky action buttons.

## QA done (stub, not the real API)
Clone (name, no `id`, weights 100/68 kept, steps without `id/courseId`), export one/all (contents, filenames), import of valid, mixed, wrong/newer/empty/not-JSON files, per-row failure and slow save, Escape/focus, duplicate-name hint, clone failure shown inline. Viewports 320, 768, 1280; Spanish.

## Open questions for the real-API QA pass
1. Which fields does `course/custom/save` really require on create? The stub only checks name and `mainStepList`. Round-trip a clone of a real program and a hand-minimal imported program, then compare `detail`.
2. Does the server accept steps without `id`/`courseId` and a program without `courseNo`? (The editor's new steps already omit them, so likely yes.)
3. Are `actionLibraryId`s of custom actions valid on another account? The library check drops them with a warning.
4. Maximum program name length and whether duplicate names are allowed upstream (the UI allows them).
5. Cover images: imported `smallImg`/`detailsImg` URLs are sent as-is; confirm the server accepts any of the cover-list URLs and what it does with foreign URLs.
6. Small pre-existing nit: counts like "1 exercises" in the program card meta (not touched).
