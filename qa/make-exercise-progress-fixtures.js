// QA only: regenerates qa/fixtures/exercise-progress/*.json (deterministic, no randomness).
// Usage: node qa/make-exercise-progress-fixtures.js
const fs = require("fs"), path = require("path");
const OUT = path.join(__dirname, "fixtures", "exercise-progress");
fs.mkdirSync(OUT, { recursive: true });
const pic = (no) => `https://power.renhesports.com/filestore/power/action-pic/${no}.png`;

// Library: sideNum 2 Combined, 1 Per side, 0 no weight; countType 1 reps, 2 seconds.
const LIB = [
  { id: 512, name: "Seated Chest Fly", actionNo: "LM012", sideNum: 2, countType: 1 },
  { id: 530, name: "Single-Arm Row (R)", actionNo: "LM030", sideNum: 1, countType: 1 },
  { id: 531, name: "Single-Arm Row (L)", actionNo: "LM031", sideNum: 1, countType: 1 },
  { id: 570, name: "Hammer Curl", actionNo: "LM070", sideNum: 1, countType: 1 },
  { id: 560, name: "Plank", actionNo: "LM060", sideNum: 0, countType: 2 },
  { id: 561, name: "Push-up", actionNo: "LM061", sideNum: 0, countType: 1 },
].map((a) => Object.assign({ actionType: 3, picUrl: pic(a.actionNo), custom: false, sideWeight: 50, consume: 10 }, a));
const CUSTOM = [{ id: 9001, name: "My Cable Pullover", actionNo: "", actionType: 3, picUrl: "", custom: true, sideNum: 2, countType: 1, sideWeight: 0, consume: 8 }];
const info = (id) => LIB.concat(CUSTOM).find((a) => a.id === id);

let sort = 0, setId = 60000;
function sets(actionId, rows, nameOverride) {
  const a = info(actionId) || { name: nameOverride, actionNo: "" };
  return rows.map(([weight, count, duration]) => ({
    id: ++setId, actionId, actionName: a.name, actionNo: a.actionNo || "", picUrl: a.picUrl || null, actionType: 3,
    sort: ++sort, powerMode: 0, modeParam: null, weight, count, duration: duration == null ? count * 3 : duration,
  }));
}
const pad = (n) => String(n).padStart(2, "0");
const addDays = (s, n) => { const d = new Date(Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10) + n)); return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`; };

// Workout dates: every 7 days from 2025-01-08 to 2026-10-21, minus a few skipped weeks, plus same-day duplicates.
const dates = [];
for (let d = "2025-01-08", i = 0; d <= "2026-10-21"; d = addDays(d, 7), i++) if (i % 9 !== 8) dates.push([d, "07:30:00"]);
dates.push(["2026-10-20", "07:15:00"], ["2026-10-20", "18:40:00"]); // same-day duplicate pair (both with Chest Fly)
dates.sort((a, b) => (a[0] + a[1] < b[0] + b[1] ? -1 : 1));

const workouts = [];
let flyN = 0;
dates.forEach(([date, time], i) => {
  sort = 0;
  const ex = [];
  const dup = date === "2026-10-20";
  const A = i % 2 === 0 || dup;
  if (A) {
    // Chest Fly, Combined: stored value is the load PER CABLE (tenths of kg). Climbs 8.0 -> ~15.5, with a deload at the 11th session.
    const climb = 80 + 5 * Math.floor(flyN / 3);
    const top = flyN === 10 ? 90 : climb;                         // deload dip
    ex.push(...sets(512, [[Math.round(top * 0.6), 12], [top, 10 - (flyN % 3)], [top, 8]]));
    flyN++;
    // Single-arm row R/L (Per side), left a little weaker, and the L side starts later.
    const row = 100 + 5 * Math.floor(i / 2);
    ex.push(...sets(530, [[row, 10], [row, 9]]));
    if (i >= 6) ex.push(...sets(531, [[row - 10, 10], [row - 10, 8]]));
    // Push-up: weightless, but the server keeps a stale default weight of 50 on the row.
    ex.push(...sets(561, [[50, 12 + (i % 5)], [50, 10 + (i % 4)]]));
  } else {
    ex.push(...sets(570, [[60 + 5 * Math.floor(i / 4), 12], [60 + 5 * Math.floor(i / 4), 10]]));
    ex.push(...sets(560, [[50, 30 + 5 * Math.floor(i / 3), 30 + 5 * Math.floor(i / 3)]]));  // timed: count = seconds
    if (i % 4 === 1) ex.push(...sets(9001, [[40 + 5 * Math.floor(i / 4), 12], [40 + 5 * Math.floor(i / 4), 10]]));
    if (i < 6) ex.push(...sets(777, [[30, 15]], "Retired Move")); // an action that is in no library
  }
  if (i === 5) ex.push(...sets(512, [[0, 15]])); // warm-up only (weight 0) set mixed in
  const volume = ex.reduce((s, r) => s + r.weight * r.count, 0);
  workouts.push({
    sportRecordId: 20001 + i, sportMode: 2, sportModeId: 2220 + (i % 2), sportType: 2, deviceType: "35", deviceCode: 0,
    startTime: `${date} ${time}`, name: A ? "Upper A" : "Upper B", coreData: volume, consume: 150 + (i % 7) * 20,
    duration: 1200 + (i % 5) * 120, capacity: 0, coins: 10, steps: 0, extData: ex,
  });
});
const w = (n, o) => fs.writeFileSync(path.join(OUT, n), JSON.stringify(o, null, 1) + "\n");
w("workouts.json", workouts);
w("action-list.json", { code: 200, msg: "OK", traceId: "fixture", success: true, data: LIB });
w("action-list-custom.json", { code: 200, msg: "OK", traceId: "fixture", success: true, data: CUSTOM });
console.log(`${workouts.length} workouts, ${workouts[0].startTime} .. ${workouts[workouts.length - 1].startTime}`);
