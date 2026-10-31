# Plan API (power.renhesports.com) - reverse-engineered spec

Confirmed by request/response trials with a dedicated test account (2026-10). Conventions as in the README: `Authorization: Bearer <token>`, `?languageId=en`, errors come back as HTTP 200 with `{"code":500,"msg":...,"success":false}`. Reproduce with `scripts/plan_probe.py` (`list | demo | cleanup`).

## Key discoveries

1. **The client clock is part of every plan call.** `curTime` (format `yyyy-MM-dd HH:mm:ss`, Java `LocalDateTime`) is required on `plan/list/ongoing`, `plan/list/stopped`, `plan/get` (as query params) and on `plan/save|stop|delete` (in the JSON body). Without it list endpoints return the opaque `HTTP 200 / code 500 "系统异常，请稍后重试"` (this is the "500" seen earlier, not an account problem) and get/save/stop return `当前时间不能为空` ("current time must not be empty"). Status (ongoing/ended) is evaluated against this value.
2. **A plan is `planItemMap: { "yyyy-MM-dd": [ {courseId}, ... ] }`.** The server accepts any number of dates, any course per date, several courses per date, and different routines on different dates. The "only first day editable" limit is app-side.
3. **Official courses and custom templates share one id space and one field (`courseId`).** They are told apart in the response by `custom` (0 official, 1 custom) and `courseNo` (`LMxxx` official / `LM2026-10-29_7` custom). Official ids are small (41...), custom ids larger (2289...). Ids come from `course/list` (official) and `course/custom/list` (custom).
4. `plan/save` returns `data: null` - no id. Find the new id by diffing `plan/list/ongoing` before/after.
5. `plan/questionnaire/preview` is NOT a dry run: it **creates and persists** an auto-generated plan (and it superseded the previous ones). Avoid, or delete what it makes.

## Endpoints

| Method | Path | Params | Notes |
|---|---|---|---|
| GET | `plan/list/ongoing` | `curTime` | status-1 plans, full objects incl. `planItemMap`. `[]` when none. |
| GET | `plan/list/stopped` | `curTime` | stopped AND ended plans, **summary only** (`id,name,startDate,endDate,percent,pic,goal`; no `status`, no items). Use `plan/get` for details. |
| GET | `plan/get` | `planId`, `curTime` | full object; `data: null` for unknown id (not an error). `id=` is NOT accepted (`计划ID不能为空`). |
| POST | `plan/save` | body | create or update (see below). `data: null`. |
| POST | `plan/stop` | `{planId, curTime}` | status -> 3. Idempotent. Plan moves from `ongoing` to `stopped` list. |
| POST | `plan/delete` | `{planId, curTime}` | hard delete; gone from both lists and `plan/get`. Idempotent, unknown id returns OK. |
| GET | `plan/cover/list` | - | `data`: array of 6 URL strings `.../filestore/power/plan/COVER_PLAN_{1..6}.png` |
| POST | `plan/questionnaire/preview` | see above | creates a plan. Required: `duration` (minutes/session: 30 or 60 accepted; 1,2,3 rejected), `goal`, `weeklyDays` (string "1,3,5"), `curTime`, `experience`, `bodyParts` (string). Validation msgs `plan_questionnaire_<field>_invalid`. |

## plan/save body

Minimal valid create (confirmed):

```json
{
  "curTime": "2026-10-28 10:00:00",
  "name": "My plan",
  "weeks": 2,
  "preferDays": "1,3,5",
  "trainDays": "2026-10-28,2026-10-30,2026-11-02",
  "startDate": "2026-10-28",
  "pic": "",
  "planItemMap": {
    "2026-10-28": [ { "courseId": 2290 } ],
    "2026-10-30": [ { "courseId": 2289 }, { "courseId": 41 } ],
    "2026-11-02": [ { "courseId": 2289 } ]
  }
}
```

| Field | Type | Meaning | Required | Status |
|---|---|---|---|---|
| `curTime` | "yyyy-MM-dd HH:mm:ss" | client now | yes | confirmed |
| `name` | string | plan name | yes (`plan_name_can_not_be_null`) | confirmed |
| `weeks` | int | nominal duration | yes (`plan_weeks_can_not_be_null`); value not validated (0, -1, 5, 8 accepted and stored) | confirmed |
| `preferDays` | string "1,3,5" | weekday chips, 1=Mon..7=Sun (inferred from the app output; Wed 10-28 <-> "3") | yes | confirmed required; 1=Mon mapping inferred; a JSON array is a 500 |
| `trainDays` | string, comma-joined ISO dates | the training dates | yes (`plan_train_days_can_not_be_null`) | confirmed; array is a 500 |
| `startDate` | "yyyy-MM-dd" | first date | yes (omitting = opaque 500) | confirmed |
| `pic` | string URL | cover (from `plan/cover/list`) or `""` | yes (omit or `null` = opaque 500; `""` is fine) | confirmed |
| `planItemMap` | object date -> array | items per date | yes (`plan_item_map_can_not_be_null`); keys must equal the set of `trainDays` (`plan_train_days_not_match` otherwise) | confirmed |
| `planItemMap[d][].courseId` | int | official or custom course id | yes | confirmed (other item fields not needed) |
| `id` | int | present = update | no | confirmed |
| `endDate`, `percent`, `status`, `goal`, `aerobicType` | | server-computed/derived | no (may be omitted) | confirmed; `goal` null for hand-made plans |

Stored/returned plan (from `plan/get`, ongoing list): `id,name,startDate,endDate,percent,pic,goal,preferDays,trainDays,weeks,status,aerobicType,planItemMap`. `endDate` = max(`trainDays`). `status`: 1 ongoing (also for a future start), 2 ended (endDate before curTime, appears in `stopped` list), 3 stopped.

Each item in the returned `planItemMap` is the course summary plus plan fields:
`courseId, courseNo, name, courseType, level, smallImg, duration, custom (0|1), actionNum, capacity, deviceCategory, sportType, deviceTypeList, partsList, createTime, updateTime, planId, trainDate, planItemId, sportRecordId, finished`.
Extra input fields on items (`trainDate`, whole item objects as returned by get) are accepted and ignored.

## Update semantics

- `id` in the body => in-place upsert, same id, send the **whole** object (a body with only `id`+`name` fails `plan_weeks_can_not_be_null`). Re-posting the object returned by `plan/get` (plus `curTime`) works verbatim.
- On update the item set is fully replaced per the new map; dates can be added/removed (`trainDays`/`planItemMap` must still match). `pic`, `name`, `preferDays`, `trainDays`, items updated.
- On update `weeks` and `startDate` appear to be ignored (kept from creation); `endDate` is recomputed. (Seen once each; treat as likely.)
- Stopped plans can't be updated: `plan_status_error`.
- Only **one ongoing (status 1, incl. future-start) plan** at a time: saving another gives `plan_already_exist_ongoing`. Stop or delete the current one first. A plan whose dates are all in the past is created with status 2 and does not block. (Plans made via questionnaire/preview did not trigger the limit - quirk.)

## Behaviours / limits

- Many days and weeks are accepted: weeks 5 and 8 with 18/28 training dates saved fine, so the app's 1-4 cap is client-side. Dates not on a `preferDays` weekday, unsorted dates, and dates before `startDate` are accepted (startDate is stored as sent; endDate = max date).
- Past start dates accepted (status 2 if everything is before curTime; spanning today stays 1). Far-future start accepted.
- Date format must be `yyyy-MM-dd` (`2026/10/28` -> opaque 500).
- A date with an empty array is accepted: the date stays in `trainDays` but disappears from the returned `planItemMap` (the "days without courses" warning must be computed client-side as `trainDays` minus `planItemMap` keys).
- Unknown `courseId`: silently dropped (date kept in `trainDays`, no item). Duplicate ids on one date are stored twice.
- The same course (or the same custom template) can be used on any number of dates; the item `duration` for custom courses is the course's current `duration` (appears to be computed server-side and by the editor as a sum of step `duration`, e.g. 2-4 for 1-2 steps; official LM courses use 20-35, plausibly minutes). The unit is NOT confirmed; the app shows hh:mm:ss.
- Items snapshot nothing by themselves: they reference `courseId`, so editing/deleting a custom template presumably changes/orphans plan items (not tested).
- Custom `course/custom/save` returns `data: null`; get the id from `course/custom/list`. `course/custom/delete/{id}` is POST.
- Two-week multi-routine example (Mon=A, Wed=B, Fri=A, with an official course added on one day, several courses on one day) was saved and read back with exactly those items per date.

## Errors seen

`当前时间不能为空` (curTime missing), `计划ID不能为空` (planId missing), `plan_cur_time_not_be_null`, `plan_name_can_not_be_null`, `plan_weeks_can_not_be_null`, `plan_prefer_days_can_not_be_null`, `plan_train_days_can_not_be_null`, `plan_item_map_can_not_be_null`, `plan_train_days_not_match`, `plan_already_exist_ongoing`, `plan_status_error`, `请求参数类型不匹配...LocalDateTime` (bad curTime format), `系统异常，请稍后重试` (any deserialisation/type problem or missing startDate/pic; no detail).

## Official/custom reads

- `course/list`: `[{id, courseNo "LM001", name, deviceCategory, sportType, courseType, level, smallImg, duration (20), capacity, custom 0, actionNum, deviceTypeList, createTime, updateTime, partsList}]`.
- `course/recommend/list`: `[{recommendType, name, level, smallImg, bigImg, devicCategory (sic), deviceTypeList, duration, stepUrlList[], sort, id}]` - `id` appears to be the course id (Boxing Basics id 80 = LM040, same as `course/list`).
- `course/custom/list`: same shape as course/list with `custom: 1`, `courseNo "LM<date>_<n>"`, `duration`, `actionNum`. Empty `[]` on a fresh account.
- `course/detail` and `course/custom/detail` share a shape (`mainStepList`, `warmUpStepList`, `relaxStepList`, ...); `course/collect/list` is `[]`.

## Unconfirmed / still guesses

- Weekday numbering of `preferDays` (1=Mon assumed from the sample; server doesn't validate it against `trainDays`).
- Duration unit of items/courses; what the "01:01:00" in the app derives from.
- Whether `goal`, `aerobicType` matter outside questionnaire plans; `percent`/`finished`/`sportRecordId` progress semantics (how a done workout links to a plan item, via `sport/record/create`?). Not tested.
- Maximum plan length / number of items (tested to 8 weeks, 28 dates).
- Behaviour when a referenced custom template is edited or deleted after being scheduled.
- Whether the official app/device renders plans whose dates differ from `preferDays`, or multi-date items beyond first day (server stores them; the official app's behaviour not tested here).
- Update ignoring `weeks`/`startDate` (see above).
- The one-ongoing-plan rule exemption for questionnaire plans.
