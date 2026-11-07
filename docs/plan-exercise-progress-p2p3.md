# Plan: Exercise Progress, Phases 2 and 3

Issue: dalocar/myinnox1#9. This builds on Phase 1 (PR dalocar/myinnox1#13, branch `feat/exercise-progress`). The work happens on the stacked branch `feat/exercise-progress-p23` in its own worktree.

Phase 1 is described in `docs/plan-exercise-progress.md`, `docs/exercise-progress-impl-notes.md` and `qa/exercise-progress-qa-report.md`. Phase 1 already did time ranges and summary stats. Phase 1 behaviour must not regress: pacer, cooldown, single-tab sync, purge rules, cache scoping, all-time summary stats.

## Phase 2: exercise list with search in the History tab

### What it does

- An "Exercises" entry point in the History tab opens a list of every exercise found in the local index, one row per `actionId`.
  - The entry point is placed next to the existing dashboard sections, in the same sub-view pattern as `DashboardUI`, `ExplorerUI` and `ReportUI`: one visible sub-view at a time, and Back returns to the opener.
- Each row shows:
  - the name and picture (with an image fallback);
  - a weight-mode badge, through `WeightModeCore`;
  - the last session date;
  - the session count;
  - the personal best (unit-aware; reps or seconds for weightless exercises);
  - a small trend hint comparing the latest to the first, as text, not colour alone.
- Tapping a row opens Exercise Progress. Back returns to the list with its search text, sort and scroll position intact.
- Search:
  - is case- and accent-insensitive (`localeCompare` / `normalize("NFD")`);
  - matches the exercise name in the current language, falling back to the name stored in the index;
  - is debounced;
  - shows a "no matches" state;
  - has a visible label and is keyboard-accessible.
- Sort options: most recent (default), most sessions, name A–Z.
- The list renders from the cache immediately and updates as the sync progresses.
  - The sync trigger is the existing one: opening the list starts or resumes it, with the same progress, cooldown and paused UI.
- States:
  - no history yet;
  - syncing with no cache yet;
  - offline with no cache;
  - error.

### Code layout

- Pure logic goes in `exercise-progress-core.js` (or `exercise-list-core.js` if it gets large), with tests: `exerciseOptions` / `listExercises(index, {query, sort, lang})`, normalisation and trend.
- DOM code goes in `exercise-progress.js` or a new `exercise-list.js`.

## Phase 3: Program editor icon and background warm-up

### Program editor icon

- In the program editor, each step that has a weight (`sideNum` 1 or 2, or unknown but with a weight) gets a small progress-chart icon button next to the weight input.
- No icon for `sideNum` 0 steps.
- The button has an accessible name ("Progress for {exercise}"), is at least 44 px on touch widths, and uses theme tokens only.
- Tapping it opens Exercise Progress for that step's `actionId`.
  - Back returns to the editor with unsaved edits intact: the editor's state is untouched and its scroll position is restored.
  - Never discard unsaved edits. If the editor is in a modal or would be torn down, open Exercise Progress as an overlay on top instead.
- If the exercise has no cached history, Exercise Progress shows its normal empty or sync state.

### Background warm-up after login

- Background warm-up is incremental only: it runs only when this account has already completed at least one full sync on this device.
- A first sync is never started in the background, because its about 500 detail calls should stay user-initiated.
- When it runs:
  - after login, or on app load with a valid session;
  - once the page has been idle for about 5 s (`requestIdleCallback` with a timeout fallback);
  - at most once per 30 minutes per account, tracked in meta.
- It goes through the same pacer, cooldown and Web Lock. It must yield to the user: if `ExerciseProgressUI` or the list opens, that sync simply continues in the foreground (no double sync).
- No UI while it runs, except that a rate-limit cooldown is quiet: no banner on unrelated screens, only the existing state if the user opens Exercise Progress.
- It is disabled when offline, when the tab is hidden (wait for `visibilitychange`), and when `navigator.connection.saveData` is set.
- Stopped on logout.

## Requirements (both phases)

- i18n keys in all 7 packs (the existing pack-completeness test must pass).
- Theme tokens only.
- Widths 320 / 768 / 1280.
- `node --test static/*.test.js`, `scripts/check-external-hosts.js` and `scripts/check-theme-contrast.js` must all pass.
- Fixtures and stub flags for the new screens.
- Implementation notes in `docs/exercise-progress-impl-notes.md`, in a new Phase 2/3 section.

## Acceptance criteria

1. History tab → Exercises opens the list. Rows have correct data against the fixture oracle (86 workouts). Tapping a row opens Exercise Progress, and Back restores the list state.
2. Search is accent- and case-insensitive with a no-match state. All three sort options are correct.
3. The list shows cached data instantly, updates during the sync, and covers the empty, offline and error states.
4. The program editor shows the icon only on weighted steps. Tapping it opens Exercise Progress; Back returns to the editor with unsaved edits intact.
5. Warm-up never starts a first sync, runs at most once per 30 minutes, respects the pacer, cooldown, Web Lock, offline, hidden-tab and `saveData` conditions, and stops on logout.
6. No Phase 1 regression.
7. All 7 languages, kg/lb, themes and the 3 widths; keyboard-only and screen-reader semantics work.
8. Tests and checks are green.
