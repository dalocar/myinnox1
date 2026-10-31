# Courses screen: implementation notes

## Built
- `static/courses-core.js` (pure; uses MovementsCore.normalize/paginate): `filterCourses`, `facetsFrom`, `countActive`, `countPanelActive`, `stepsOf`, label maps `TOPICS/LEVELS/ACCESSORIES`, `DURATION_BUCKETS`. Tests: `static/courses-core.test.js` (real fixture: 75 courses, counts per level/topic/accessory/duration).
- `static/courses.js` (`window.CoursesUI = {show, relang, view}`), markup in the Programs tab of `index.html`, CSS appended to `style.css` (`.cs-*`), hooks in `app.js` (`switchTab("programs")` -> `CoursesUI.show()`; `I18N.onChange` -> `CoursesUI.relang()` when the Courses view is active), ES strings + `course/curso` noun in `i18n.js`, README bullet.
- Programs tab: segmented control Courses | My programs (default Courses). "My programs" = existing `#list-view` / `#editor`, now wrapped in `#programs-mine` (no other changes). Toggling while the editor is open keeps the editor state; entering the tab from elsewhere in "My programs" shows the list as before.

## Data / decisions
- `/course/list`: `level` 1/2/3 Beginner/Intermediate/Advanced; `courseType` 1..5 = Fat loss / Stretching / Strength / Conditioning / Themed training; `duration` minutes; `partsList` accessory ids.
- Accessories offered only for confirmed ids 1,2,3,4,5,6,14; ids 8, 13, 16 are never shown as filters (not labelled).
- Duration filter = single-select "Up to N min" (10/20/30/40; assumption that the official buckets are upper bounds). 69 of 75 courses are <= 40 min.
- Topics are a chip row (multi, OR); Filters button opens a panel (Difficulty multi, Duration single, Accessory multi, OR within a group, AND across groups). The badge on Filters counts active panel groups; Reset shows total active groups. No Confirm (instant filtering).
- Detail: `GET /course/detail?id=` (lazy, cached per language), shows image, pills, description and `mainStepList` (name, sets x reps); thumbnail opens the existing lightbox. Read-only.

## Verified
`node --test static/*.test.js` (36 pass), `node --check static/*.js`, i18n key scan (every t() key and static string has ES; no duplicate keys). Browser (stubbed fetch with the real course fixture; dev server on 8788 was down so the page was opened via file://): EN<->ES keeps search/filters and refetches with `languageId=es`, plural 1 course / 5 courses (1 curso / 5 cursos), reset, empty state, detail modal, My programs toggle shows the list; no horizontal overflow at 320 / 375 / 1280 (1 column cards at 320/375, 3 at 1280); chips 44 px under coarse pointer; no console errors.
Not tested: real login/real /course/detail payload (only the known mainStepList shape), keyboard-only pass.

## DOM ids / classes for QA
Toggle `#pg-seg`, `#pg-seg-courses`, `#pg-seg-mine`; panels `#programs-courses`, `#programs-mine` (contains `#list-view`, `#editor`).
Search `#cs-search`; reset `#cs-reset`; topic chips `#cs-topics .chip[data-value]`; filters button `#cs-filters-btn` (aria-expanded) with `#cs-badge`; panel `#cs-panel > .mv-filter-group[data-filter=levels|durations|accessories] .chip[data-value][aria-pressed]`; count `#cs-count`; results `#cs-results > ul.cs-grid > li > button.cs-card[data-id]` (`.cs-img`, `.cs-name`, `.cs-pill`); `#cs-more`; empty `.empty-state` + `#cs-empty-reset`; error `.server-error` + `#cs-retry`; skeleton `.cs-skel`.
Detail modal `#course-modal-backdrop`, `#course-modal` (role=dialog), `#course-modal-title`, `#course-modal-close-btn`, `#course-modal-body` (`.cs-hero`, `.cs-desc`, `ul.cs-steps > li.cs-step`).
