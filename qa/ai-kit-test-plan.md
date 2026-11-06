# AI kit (Use with AI + Paste JSON) - QA test plan

Scope: issue #10 V1. Actions -> Library -> "Use with AI" menu, Programs -> Import dialog (File / Paste JSON), format `myinnox1-routines` (see docs/plan-ai-export.md, docs/ai-export-impl-notes.md).
Setup: `node qa/fixture-server.js` (:8799), `python3 server.py` (:8787), load `qa/ai-kit-stub-init.js` as an init script (real 268-action library + custom ids 9101 "My Cable Curl", 9102 "My Plank Hold"; hooks `window.__saves`, `window.__downloads`, `window.__dlNames`; save name containing FAIL / SLOW). The stub must be installed before app.js (init script on navigation); after a plain reload it is gone. If the action library was cached empty, call `invalidateActionCaches()`.
Unit: `node --test static/*.test.js`. Status column: R1 = run in dev/QA round 1, R2 = run after the round-1 fixes, - = not run yet.

## A. Use with AI menu
| ID | Steps | Expected | Status |
|---|---|---|---|
| A1 | Actions -> Library -> "Use with AI" | Panel opens, aria-expanded true; checkbox on by default; note about custom ids | R1 |
| A2 | Copy AI prompt | Status + toast "Copied..."; clipboard holds prompt ending `My goal: ` with 268 table rows (+2 custom) | R1 |
| A3 | Untick custom, download library | `myinnox1-library-<lang>-<date>.json`, 268 actions, no URLs; ticked -> 270 | R1 |
| A4 | Download format guide | `myinnox1-routines-guide-<date>.md`, no table, mentions the library file name | R1 |
| A5 | Clipboard blocked (insecure context / denied) | Textarea with the text, selected; message to copy manually | - |
| A6 | Escape with focus on the toggle, and inside the panel | Panel closes, focus returns to the toggle | R2 |
| A7 | Switch language, copy again | Names in the new language, `language` field updated, instructions stay English | - |
| A8 | 320 px, all themes | No horizontal scroll, buttons stack, text readable | R1 (320 untested in round 1: resize ignored) |

## B. Import dialog
| ID | Steps | Expected | Status |
|---|---|---|---|
| B1 | Click Import | Dialog with File tab, "Choose file" focused | R2 |
| B2 | Choose a `myinnox1-program` file | Same preview and results as before the feature (no regressions) | R1 |
| B3 | Tabs: click, ArrowLeft/Right, Home/End | role=tablist/tab, aria-selected, roving tabindex, selection follows focus | R2 |
| B4 | Paste empty, Preview | Inline "Paste the JSON first." | R1 |
| B5 | Paste valid fenced/chatty answer | Preview lists routines, suggested days; import saves programs; weights 12.5 kg -> sideWeight 125; warm-up stage 1, cooldown stage 3 | R1 |
| B6 | Unknown actionId | Row blocked, "Push A / main / step 2: actionId 999 is not in your library." | R1 |
| B7 | "Skip steps that have problems" | Row becomes importable, step shown as "Skipped step (...)"; routine with no steps left stays blocked | R1 |
| B8 | Copy errors for AI | Clipboard has the plain-text list ("The myinnox1-routines JSON could not be imported...") | R1 |
| B9 | Name collision with an existing program | Gets "(copy)" suffix | R1 |
| B10 | Account in lb (#imperial) | Stored sideWeight identical to kg account | - |
| B11 | Save failure (name with FAIL) | Per-row failure, others still imported | - |

## C. Malformed answers (round-1 findings)
| ID | Input | Expected | Status |
|---|---|---|---|
| C1 | Fenced JSON with trailing comma | "A JSON object was found but it is not valid JSON (<parser message>). Check ..." + Copy errors for AI | R2 |
| C2 | `// comment` inside the JSON | Same invalid-json message (not "must have format ...") | R2 |
| C3 | Curly (smart) quotes | Same invalid-json message | R2 |
| C4 | Truncated reply (unbalanced braces) | invalid-json, detail "unbalanced braces, the reply may be cut off" | R2 |
| C5 | Text without any `{` | "No JSON object was found in the text." | R2 |
| C6 | Valid JSON, wrong `format` / newer version / empty routines / 8 routines | Matching fatal message | R1 |
| C7 | 100k `{` pasted | Responds in well under a second | R2 |
| C8 | Name > 60 chars, description > 300 | Row blocked with "longer than 60/300 characters" | R2 |
| C9 | `weightKg` on a bodyweight action | Warning only, library default used | R1 |
| C10 | Schedule pointing at a missing routine / bad weekday | Listed as `schedule[n]: ...`, routines still importable | R1 |

## D. Manual with real AIs (not done)
ChatGPT and Claude, three goals (strength, fat loss, beginner full body), 10 attempts: record how many import without edits (target 9/10) and whether pasted-back errors get fixed in one reply.
