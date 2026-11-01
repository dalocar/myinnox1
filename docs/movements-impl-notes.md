# Movements screen: implementation notes

## Built
- `static/movements-core.js` (pure: normalize, filterMovements, facetsFrom, paginate, countActive, levelOf/typeOf/partsOf) + `static/movements-core.test.js` (9 tests).
- `static/movements.js` (`window.MovementsUI = {show, relang}`), markup in `#tab-actions` of `index.html`, styles appended to `style.css` (`.mv-*`, `.sr-only`), hooks in `app.js` (switchTab "actions" -> MovementsUI.show(); I18N.onChange -> MovementsUI.relang()), ES strings in `i18n.js`, README bullet.
- No new tab: Actions tab now has a segmented control Library | My actions (default Library). "My actions" is the old custom-actions UI, unchanged (wrapped in `#actions-mine`).

## Discovery
Confirmed with real data (`qa/fixtures/action-list-real.json`): `level` 1/2/3 = Beginner/Intermediate/Advanced; `actionType` 1/2/3 = Stretching/Warm-up/Strength (ES: Estiramiento/Calentamiento/Fuerza); no hot field, so no HOT ribbon. Filters still self-hide if a facet has < 2 values; unknown values fall back to "Type N" / "Level N". No add-to-program (out of scope).

## Test
- `node --test static/*.test.js` (30 pass, incl. real-fixture counts); `node --check static/*.js`.
- Browser: stubbed `fetch` then `showLoggedIn("a@b.c"); switchTab("actions")` (verified: 60 cards + Show more, search accent-insensitive, filters AND, empty state + reset, ES switch keeps screen, no console errors, no horizontal scroll).

## DOM ids / classes for QA
Segmented: `#mv-seg`, `#mv-seg-library`, `#mv-seg-mine` (aria-pressed). Panels: `#actions-library`, `#actions-mine`.
Search `#mv-search` (label .sr-only), reset `#mv-reset` (hidden when nothing active; shows "(n)" active filter groups), filters `#mv-filters > .mv-filter-group[data-filter=parts|types|levels] .chip[aria-pressed][data-value]`, count `#mv-count` (aria-live), results `#mv-results > ul.mv-grid > li > button.mv-card[data-id]` (.mv-name, img or .mv-ph), `#mv-more` (Show more), empty `.empty-state` + `#mv-empty-reset`, error `.server-error` + `#mv-retry`, skeleton `.mv-skel`. Card click opens existing lightbox.

## i18n verification
Count line uses `I18N.plural(n, "movement")` (ES nouns added). ES wording follows the official app (Movimientos, Acciones propias, Ingresa un nombre, Parte, Tipo, Dificultad, Principiante/Medio/Avanzado, Estiramiento/Fuerza/Calentamiento, Restablecer). "Confirmar" is not needed: filters apply instantly (no sheet). Verified in browser with the real fixture: EN->ES->EN keeps search text and selected filters, refetches `/api/action/list?languageId=es`, accent-insensitive search in both languages.

## Custom action form (Create Action parity)
`static/custom-action-core.js` (+ test) maps the official form to the API: Part -> `muscleParts` (comma list, ids as MUSCLE_GROUPS), Difficulty -> `level` 1/2/3, Type -> `actionType` 1 Stretch / 2 Warm Up / 3 Strength, Timer/Repetition -> `countType` 2/1, Per Side/Combined -> `sideNum` 1/2, Bodyweight-only -> `sideNum` 0 with timer forced (inferred from the library: all 94 `sideNum` 0 actions are `countType` 2; not captured from a real create).
Confirmed by creating and reading back a throwaway: `/action/add` accepts `name, muscleParts, level, actionType, countType, sideNum` under those names. Picture upload is implemented (see the last section). Earlier `/file/upload` guesses all returned an opaque 500 because the required form field `usage` was unknown. Unconfirmed, and the official app's Edit route (the app has Edit, we have none). The official app refuses to save without an image.

## Picture upload (`POST /api/file/upload`)
Captured from the official iOS-on-Mac build with mitmproxy local mode (the Android build is Flutter and ignores proxies and user CAs). Multipart parts: `usage` = `6` (**required**; without it upstream answers a generic 500), `extraParam` = `0` (optional, only adds the `_0` suffix to the stored name), `file` (any filename; `image/jpeg` and the app's `image/jpg` both work). `languageId` as query or header is irrelevant. Response `data` is the hosted URL (`.../filestore/power/action-pic/<id>_0.jpg`), sent as `picUrl` to `/action/add`. Other `usage` values were not tested; 6 is presumably "action picture".
- Editing: `/action/add` with an `id` and a new `picUrl` replaces the picture; omitting `picUrl` keeps the stored one (both verified on a throwaway action, since deleted). The form therefore sends `picUrl` only after a new upload and shows the stored picture meanwhile.
- `custom-action-core.js`: `uploadFields`, `validateImage` (JPEG/PNG), `fitSize` (max edge 1024), `uploadUrl`; 4 new tests.
- `app.js`: `api()` drops the JSON `Content-Type` for `FormData`; the form has a Picture fieldset (choose, preview, remove). The image is shrunk to a JPEG on a canvas (PNG transparency flattened on white), uploaded, and the URL kept in `caForm.picUrl`. Submit waits for a running upload. The picture is optional (upstream accepts a create without one; the official app does not).
- `server.py` and `functions/api/[[path]].js` already forward the multipart body and `Content-Type` unchanged.
- Verified in a browser with a stubbed `fetch` (create, edit without/with a new picture, remove, cancel, bad type) and with curl against the real API. The Cloudflare Function was not exercised with an upload.
