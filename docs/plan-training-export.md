# Plan: Training export for AI analysis (My Activity)

Status: phase 1 implemented on `feat/training-export` (sheet, period choice, Markdown, copy and download, five prompts). Phases 2 and 3 are not.

## Goal

From **My Activity**, export all workouts, or those between two dates, as one clear file that any LLM can read with a short prompt. The app suggests the prompt. Nothing is sent anywhere by the app.

## UX

Principles: one screen of choices, good defaults (two taps for the common case), show what you will get before preparing it, never lose fetched data.

### Entry points
- **My Activity** (explorer) header: `Export` button, in every period view.
- Summary dashboard (History tab) header: the same button, because the explorer is one tap deeper.

### Step 1: choose (bottom sheet on mobile, dialog on desktop)

```
 Export for AI analysis                          x

 Period      [ Between dates ]  [ Everything ]
             (4 weeks) (3 months*) (12 months) (October 2026)
             From [2026-08-27]   To [2026-11-27]

             38 workouts · about 14k tokens

 What do you want to know?
             (*) How am I progressing?
             ( ) Where am I stuck, and what loads next?
             ( ) Is my training balanced?
             ( ) How consistent am I?
             ( ) My own question  [______________]

 > Options   Detail: Full sets | Summary
             [ ] Include age, sex, height, body weight
             [ Your goal or injuries (optional) ________ ]

                                  [ Prepare export ]
```

- Default: Between dates, last 3 months. The chip for the period being viewed (week, month, year) appears when opened from the explorer.
- Native date inputs, both ends inclusive, no future dates. `From > To` shows an inline error and disables the button.
- The count comes from one list call and updates as dates change. The token figure is an estimate (calibrate on real exports).
- Zero workouts: "No workouts between these dates" plus a button to switch to Everything.
- Remember the last question, detail level and goal text on this device. The body data box is off by default.

### Step 2: prepare
- Progress `Fetching 12 of 38 workouts`, with Cancel. Cached workouts are skipped, so repeat exports are near instant.
- Closing the sheet keeps what was fetched.
- Rate limit, offline or errors: Resume, or **Export the 35 available**. A partial file lists what is missing.

### Step 3: ready

```
 Ready: 38 workouts · 27 Aug – 25 Nov · 52 KB

 [ Share to an AI app ]        phones, when the browser can share files
 [ Copy prompt + data ]        primary on desktop
 [ Download file ]  [ Copy prompt only ]  [ JSON ]

 > Preview

 Paste into your AI chat, or attach the file and paste the prompt.
```

- Preparing first and acting second matters: share and clipboard need a fresh user tap.
- Above about 30k tokens, make **Download file** primary and suggest Summary detail.
- Sharing: test `navigator.canShare({files})`; retry as `.txt` if `.md` is refused; hide the button otherwise.
- Clipboard blocked: reuse the manual-copy textarea fallback from `ai-kit.js`.
- **Copy prompt only** exists because many chats follow a typed instruction better than one inside an attachment.

## File format

Default: **Markdown** (`myinnox1-training-<from>_<to>.md`). Readable by people and models, and cheaper in tokens than JSON. **JSON** (`myinnox1-training` v1) carries the same data for scripts. No CSV in v1.

The app precomputes totals and trends, because models are unreliable at arithmetic over long logs.

Sections, in order (headings and field names always English; exercise names in the UI language):

````markdown
# Training export (MyInnoX1)
Period: 2026-08-27 to 2026-11-27 · Weight unit: kg · Detail: full sets

## How to read this data
- Machine: digital cable resistance. "per cable" exercises load both cables at once: total load = 2 x weight.
- Volume = weight x reps, doubled for "per cable" exercises.
- (L) and (R) exercises are the two sides, logged separately.
- "time" exercises have no weight; the value is seconds.
- Duration is time under work. Rest between sets is not recorded.
- Calories are the machine's estimate. RPE, effort, planned targets and soreness are not recorded.

## Athlete            (only what the user opted in, plus the goal text)

## Overview
Workouts, active time, volume, kcal, sets, average workouts per week.

## Weekly summary     (every week in the range, including empty ones)
| week of | workouts | active min | volume kg | sets |

## Exercise progression
| exercise | body part | load | sessions | first date | first top set | last date | last top set | best top set | volume kg |

## Workout log
### 2026-10-28 10:24 · Rutina B · 18:06 active · 7032 kg · 351 kcal
| exercise | load | sets in order (weight x reps) |
| Seated Chest Fly | per cable | 16x12, 16x12, 16x8 |
| Seated Mid Cable Row | per cable | 18.7x3, 13.4x9, 13.4x2, 15.5x10, 15.5x12 |

## Data notes         (missing workouts, unknown exercise types, zero-rep sets)
````

- **Summary** detail drops the workout log and keeps everything above it.
- "Top set" is the heaviest set, ties broken by reps (same rule as Exercise Progress). No estimated 1RM.
- Body part comes from the action library, which makes the balance question answerable.
- Exercises are listed in order of first set; a note says supersets (L/R) were interleaved.
- No email, nickname, account or record ids. Names typed by users are escaped so they cannot break tables.

## Suggested prompts

Every prompt starts with the same base:

> You are a strength coach. Below is my training log with an explanation of the data. Use only this data. Cite dates and exercises. If something cannot be concluded from it, say so instead of guessing. My goal: {goal or "not stated"}. Answer in {UI language}.

| Choice | Task added to the base |
|---|---|
| Progress | For each exercise with at least 3 sessions, say if it is improving, flat or declining, with the numbers. Finish with the 3 most important observations. |
| Plateaus and next loads | Find exercises that have not progressed in the last 4 sessions. Give next-session weight, sets and reps for each, and why. |
| Balance | Compare volume and sets by body part, push against pull, upper against lower, left against right. Point out gaps and what to change. |
| Consistency | Analyse frequency, gaps and weekly volume. Say what is realistic to keep and where I drop off. |
| My own question | The typed text. |

## Technical design

- `static/training-export-core.js` (pure, tested): range filter, aggregates, Markdown and JSON builders, prompts, size estimate, filename.
- `static/training-export.js` + css: the sheet, progress, share, copy, download.
- Reuse the Exercise Progress sync (`exercise-progress.js`): one wide list call, pacer for the Cloudflare limit (60 requests per 10 s), retries, Web Locks, IndexedDB cache.
- **Cache change:** it stores only the best set per exercise. Add an optional compact `sets` field to each cached workout. Keep `SCHEMA` at 1 so charts keep working; the export refetches only entries in range that lack `sets`. The sync needs a way to take a date range and that "lacks sets" condition.
- Workout names come from the list call (`name` is null in the detail response).
- Action library joined for `sideNum`, `countType`, body part. Unknown action: export the raw numbers, mark load "unknown", count volume once, say so in Data notes.
- All seven language packs for UI strings.

## Verified against saved data

Four workouts in `old-account-backup/`:
- `coreData / 10` equals the sum of weight x reps, doubled for `sideNum` 2 and excluding `sideNum` 0, exactly in all four. So "per cable" doubling is correct for volume.
- Workout `duration` equals the sum of set durations in all four, so rest is excluded.
- `sideNum` 0 sets carry a meaningless default weight (50): never export it.

## Open items

1. All saved sets have `powerMode` 0. Capture an eccentric, spring and isokinetic workout to learn `powerMode` / `modeParam` before labelling them. Until then, mark such sets "special mode".
2. Time zone of `startTime` is unconfirmed. Export it as received.
3. Token estimate and the 30k threshold need calibration on real exports.
4. `.md` file sharing on iOS Safari and Android Chrome needs a device test.

## Phases

1. Sheet, period choice, Markdown, copy and download, the five prompts.
2. Share button, JSON, Summary detail, opt-in body data (`app/body/change/list`, `app/getInfo`, `physicalFitnessTest/last`).
3. "Plan my next block": adds the AI kit library and format, so the reply imports straight back as programs.

## Acceptance criteria

- Everything and a date range both export; boundary dates are included.
- Totals in the file match the sum of its log, and volume matches `coreData` per workout.
- A repeat export of the same range makes no detail calls.
- An interrupted export resumes, and a partial file says what is missing.
- No identifiers in the file; nothing leaves the browser except the existing API calls.
- Works at 320 px, keyboard and screen reader, all themes and languages.
- Manual check: each prompt in two different assistants gives answers that cite real numbers correctly.
