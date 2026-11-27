/* Training export for AI analysis - pure logic, no DOM. Browser global `TrainingExportCore`, Node module.exports.
   See docs/plan-training-export.md. Input workouts are Exercise Progress cache entries that carry `x`
   (full sets). Weights are tenths of kg. The exported file is always English (exercise names as the library
   gives them); dates are the local calendar date of the server's startTime. */
(function (root, factory) {
  const node = typeof require === "function" && typeof module !== "undefined";
  const EP = node ? require("./exercise-progress-core.js") : root.ExerciseProgressCore;
  const UC = node ? require("./units-core.js") : root.UnitsCore;
  const api = factory(EP, UC);
  if (node) module.exports = api;
  else root.TrainingExportCore = api;
})(typeof self !== "undefined" ? self : this, function (EP, UC) {
  const BODY_PARTS = { 1: "chest", 2: "shoulder", 3: "back", 4: "arm", 5: "hips", 6: "legs", 7: "abdomen", 8: "full-body" };
  const LANGUAGES = { en: "English", es: "Spanish", de: "German", fr: "French", it: "Italian", ja: "Japanese", ko: "Korean", zh: "Chinese" };
  const LARGE_TOKENS = 30000; // above this, suggest attaching the file (uncalibrated, see the plan)

  const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
  // Names are typed by users or come from the server: keep them on one line and out of Markdown syntax.
  const clean = (s) => String(s == null ? "" : s).replace(/[\u0000-\u001f\u007f\u2028\u2029]+/g, " ")
    .replace(/[|`<>]/g, "/").replace(/\s+/g, " ").trim().slice(0, 120);

  // ---------- period ----------
  const PRESETS = ["4w", "3m", "12m"];
  // Inclusive range ending today.
  function presetRange(id, today) {
    if (id === "4w") return { from: EP.addDays(today, -27), to: today };
    if (id === "3m") return { from: EP.addMonths(today, -3), to: today };
    if (id === "12m") return { from: EP.addMonths(today, -12), to: today };
    return null;
  }
  // "" when usable, else "missing" | "order".
  function rangeError(from, to) {
    if (!EP.parseDate(from) || !EP.parseDate(to)) return "missing";
    return from > to ? "order" : "";
  }
  // rows: /sport/record/list rows (or cache entries). range null = everything. Newest first, no duplicates.
  function filterRows(rows, range) {
    const seen = new Set(), out = [];
    for (const r of Array.isArray(rows) ? rows : []) {
      const id = num(r && (r.sportRecordId != null ? r.sportRecordId : r.recordId));
      const st = r && EP.parseStart(r.startTime);
      if (!(id > 0) || !st || seen.has(id)) continue;
      if (range && (st.date < range.from || st.date > range.to)) continue;
      seen.add(id);
      out.push({ recordId: id, startTime: st.startTime, date: st.date, name: typeof r.name === "string" ? r.name : "" });
    }
    return out.sort((a, b) => b.startTime.localeCompare(a.startTime) || b.recordId - a.recordId);
  }
  // Rough size before anything is fetched: fixed parts plus about 300 tokens per workout (a 32-set, 11-exercise
  // workout renders to about 900 characters of log). The ready screen shows the figure measured on the real text.
  const estimateTokens = (workouts) => (workouts > 0 ? 900 + workouts * 300 : 0);
  const textTokens = (text) => Math.ceil(String(text || "").length / 3.5);

  // ---------- model ----------
  function loadOf(info) {
    const s = info && info.sideNum;
    return s === 2 ? "per cable" : s === 1 ? "per side" : s === 0 ? "no weight" : "unknown";
  }
  function setOf(row, info) {
    const [actionId, order, weight, count, seconds, powerMode] = row;
    const load = loadOf(info);
    const timed = !!info && info.countType === 2;
    return {
      actionId: String(actionId), order: num(order),
      weight: load === "no weight" ? 0 : Math.max(0, num(weight)), // unweighted moves carry a stale default weight
      reps: timed ? 0 : Math.max(0, num(count)),
      seconds: timed ? Math.max(0, num(seconds) || num(count)) : 0,
      timed, special: num(powerMode) !== 0,
    };
  }
  // Heaviest set, ties by reps; unweighted: most reps or longest time.
  const better = (a, b) => !b || a.weight > b.weight || (a.weight === b.weight && (a.reps + a.seconds) > (b.reps + b.seconds));
  const setVolume = (s, load) => s.weight * s.reps * (load === "per cable" ? 2 : 1);
  // Sunday that starts the week (same week as the app's Activity screen).
  function weekStart(date) {
    const n = EP.dayNumber(date);
    return EP.fromDayNumber(n - (((n + 4) % 7) + 7) % 7);
  }

  // buildModel({rows (from filterRows), workouts: Map recordId -> cache entry, library: Map id -> {sideNum,countType,name,parts},
  //             range|null, today}) -> model. Rows without full data are listed as missing.
  function buildModel(o) {
    const lib = o.library || new Map();
    const log = [], missing = [], byExercise = new Map();
    const unknown = new Set();
    let zeroSets = 0, special = 0;
    const rows = (o.rows || []).slice().sort((a, b) => a.startTime.localeCompare(b.startTime) || a.recordId - b.recordId);
    for (const row of rows) {
      const w = o.workouts.get(row.recordId);
      if (!w || !w.x) { missing.push({ date: row.date, startTime: row.startTime, name: clean(row.name) }); continue; }
      const groups = new Map();
      const raw = (w.x.sets || []).slice().sort((a, b) => num(a[1]) - num(b[1]));
      for (const r of raw) {
        const id = String(r[0]);
        const info = lib.get(id) || null;
        const s = setOf(r, info);
        const load = loadOf(info);
        const name = clean((info && info.name) || (w.x.names && w.x.names[id]) || `Exercise ${id}`);
        if (load === "unknown") unknown.add(name);
        if (!s.reps && !s.seconds) zeroSets++;
        if (s.special) special++;
        let g = groups.get(id);
        if (!g) groups.set(id, (g = { actionId: id, name, load, parts: partsOf(info), sets: [] }));
        g.sets.push(s);
      }
      const exercises = [...groups.values()];
      const volume = num(w.x.volume);
      log.push({
        date: row.date, startTime: row.startTime, name: clean(row.name || w.x.name) || "Workout",
        seconds: num(w.x.seconds), kcal: num(w.x.kcal), volume, sets: raw.length, exercises,
      });
      for (const g of exercises) {
        let e = byExercise.get(g.actionId);
        if (!e) byExercise.set(g.actionId, (e = { name: g.name, parts: g.parts, load: g.load, sessions: 0, first: null, last: null, best: null, volume: 0, sets: 0 }));
        let top = null;
        for (const s of g.sets) { if ((s.reps || s.seconds) && better(s, top)) top = s; e.volume += setVolume(s, g.load); }
        e.sets += g.sets.length;
        if (!top) continue;
        e.sessions++;
        const point = { date: row.date, set: top };
        if (!e.first) e.first = point;
        e.last = point;
        if (!e.best || better(top, e.best.set)) e.best = point; // ties keep the earliest date
      }
    }
    const from = o.range ? o.range.from : (log.length ? log[0].date : o.today);
    const to = o.range ? o.range.to : o.today;
    const weeks = [];
    if (log.length) {
      const byWeek = new Map();
      for (let d = weekStart(from); d <= to; d = EP.addDays(d, 7)) byWeek.set(d, { week: d, workouts: 0, seconds: 0, volume: 0, sets: 0 });
      for (const w of log) {
        const k = byWeek.get(weekStart(w.date));
        if (!k) continue;
        k.workouts++; k.seconds += w.seconds; k.volume += w.volume; k.sets += w.sets;
      }
      weeks.push(...byWeek.values());
    }
    const sum = (k) => log.reduce((a, w) => a + w[k], 0);
    const days = EP.dayNumber(to) - EP.dayNumber(from) + 1;
    return {
      from, to, everything: !o.range,
      totals: {
        workouts: log.length, seconds: sum("seconds"), volume: sum("volume"), kcal: sum("kcal"), sets: sum("sets"),
        perWeek: log.length && days > 0 ? Math.round((log.length / Math.max(1, days / 7)) * 10) / 10 : 0,
      },
      weeks,
      exercises: [...byExercise.values()].sort((a, b) => b.sessions - a.sessions || a.name.localeCompare(b.name)),
      log, missing, notes: { unknown: [...unknown].sort(), zeroSets, special },
    };
  }
  function partsOf(info) {
    const raw = info && info.parts;
    const list = Array.isArray(raw) ? raw : String(raw == null ? "" : raw).split(",");
    return list.map((p) => BODY_PARTS[num(p)]).filter(Boolean);
  }

  // ---------- Markdown ----------
  const table = (head, rows) => [head, head.map(() => "---"), ...rows].map((r) => `| ${r.join(" | ")} |`).join("\n");
  const clock = (sec) => {
    const s = Math.round(num(sec)), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
    const p = (n) => String(n).padStart(2, "0");
    return h ? `${h}:${p(m)}:${p(r)}` : `${m}:${p(r)}`;
  };

  function toMarkdown(model, opts) {
    const unit = (opts && opts.unit) || 0;
    const u = UC.label(unit);
    const w = (tenths) => String(UC.fromTenths(tenths, unit));
    const vol = (tenths) => String(Math.round(UC.fromTenths(tenths, unit)));
    const setText = (s) => {
      const amount = s.timed ? `${s.seconds}s` : String(s.reps);
      const text = s.weight > 0 ? `${w(s.weight)}x${amount}` : (s.timed ? amount : `${amount} reps`);
      return s.special ? `${text}*` : text;
    };
    const top = (p) => (p ? setText(p.set) : "-");
    const out = [];
    out.push("# Training export (MyInnoX1)", "",
      `Period: ${model.from} to ${model.to}${model.everything ? " (full history)" : ""} · Weight unit: ${u} · Workouts: ${model.totals.workouts}`, "",
      "## How to read this data",
      "- Machine: digital cable resistance (INNODIGYM).",
      `- Sets are written weight x reps, in ${u}. A trailing "s" means seconds (timed exercise).`,
      "- Load \"per cable\": both cables work at once, so the total load is 2 x the weight shown.",
      "- Load \"per side\": the weight of the single cable in use. (L) and (R) in a name are the two sides, logged as separate exercises.",
      "- Load \"no weight\": bodyweight, warm-up or stretch; only reps or seconds are recorded.",
      "- Volume = weight x reps, doubled for per-cable exercises. Workout volume is the figure reported by the machine.",
      "- Active time is time under work. Rest between sets and total session length are NOT recorded.",
      "- Calories are the machine's estimate. Effort (RPE), planned targets, pain and soreness are NOT recorded.",
      "- Start times are as reported by the server (time zone not specified). Dates are YYYY-MM-DD.",
      "- Within a workout, exercises are listed in order of their first set; sets of paired exercises may have been alternated.", "");
    if (opts && opts.goal && clean(opts.goal)) out.push("## Athlete", `Goal or notes, written by the athlete: ${clean(opts.goal)}`, "");
    const t = model.totals;
    out.push("## Overview",
      table(["workouts", "workouts per week", "active time", `volume ${u}`, "sets", "kcal"],
        [[t.workouts, t.perWeek, clock(t.seconds), vol(t.volume), t.sets, Math.round(t.kcal)]]), "");
    out.push("## Weekly summary",
      "Weeks start on Sunday. The first and last week may be only partly inside the period.", "",
      table(["week of", "workouts", "active min", `volume ${u}`, "sets"],
        model.weeks.map((k) => [k.week, k.workouts, Math.round(k.seconds / 60), vol(k.volume), k.sets])), "");
    out.push("## Exercise progression",
      "Top set = heaviest set of a workout (ties: most reps or seconds). Best = highest top set in the period.", "",
      table(["exercise", "body parts", "load", "sessions", "first date", "first top set", "last date", "last top set", "best top set", "best date", "sets", `volume ${u}`],
        model.exercises.map((e) => [e.name, e.parts.join(", ") || "-", e.load, e.sessions, e.first ? e.first.date : "-", top(e.first),
          e.last ? e.last.date : "-", top(e.last), top(e.best), e.best ? e.best.date : "-", e.sets, e.load === "no weight" ? "-" : vol(e.volume)])), "");
    out.push("## Workout log", "Oldest first.", "");
    for (const d of model.log) {
      out.push(`### ${d.startTime.slice(0, 16)} · ${d.name} · ${clock(d.seconds)} active · ${vol(d.volume)} ${u} · ${Math.round(d.kcal)} kcal`);
      out.push(d.exercises.length
        ? table(["exercise", "load", "sets in order"], d.exercises.map((g) => [g.name, g.load, g.sets.map(setText).join(", ")]))
        : "No sets recorded.", "");
    }
    const notes = [];
    if (model.missing.length) {
      notes.push(`INCOMPLETE: ${model.missing.length} workout(s) in this period could not be loaded and are not counted anywhere above: ${model.missing.map((m) => m.startTime.slice(0, 16)).join(", ")}.`);
    }
    if (model.notes.unknown.length) notes.push(`Load type unknown (raw numbers shown, volume counted once): ${model.notes.unknown.join(", ")}.`);
    if (model.notes.special) notes.push(`Sets marked * (${model.notes.special}) used a special resistance mode (for example eccentric, spring or isokinetic); their weight is not comparable with unmarked sets.`);
    if (model.notes.zeroSets) notes.push(`${model.notes.zeroSets} set(s) have zero reps or seconds (probably skipped).`);
    if (notes.length) out.push("## Data notes", ...notes.map((n) => `- ${n}`), "");
    return out.join("\n");
  }

  // ---------- prompts ----------
  const QUESTIONS = ["progress", "plateaus", "balance", "consistency", "custom"];
  const TASKS = {
    progress: "For each exercise with at least 3 sessions, say whether it is improving, flat or declining, quoting the numbers. Finish with the 3 most important observations.",
    plateaus: "Find the exercises that have not progressed in their last 4 sessions. For each, suggest next-session weight, sets and reps, and explain why.",
    balance: "Compare volume and sets by body part, pushing against pulling, upper against lower body, and left against right side. Point out the gaps and what to change.",
    consistency: "Analyse training frequency, gaps and weekly volume. Say what routine is realistic to keep and where I drop off.",
  };
  function buildPrompt(choice, opts) {
    const o = opts || {};
    const goal = clean(o.goal);
    const custom = String(o.custom || "").trim().slice(0, 2000);
    const task = choice === "custom" ? custom : TASKS[choice] || TASKS.progress;
    return [
      "You are a strength coach. My training log follows (pasted below or attached), starting with an explanation of the data.",
      "Use only this data. Cite dates and exercise names. If something cannot be concluded from it, say so instead of guessing.",
      `My goal: ${goal || "not stated"}.`,
      `Answer in ${LANGUAGES[o.lang] || "English"}.`,
      "",
      `Task: ${task || TASKS.progress}`,
    ].join("\n");
  }
  const withPrompt = (prompt, markdown) => `${prompt}\n\n---\n\n${markdown}`;
  const filename = (model) => `myinnox1-training-${model.from}_${model.to}.md`;

  return {
    BODY_PARTS, LARGE_TOKENS, PRESETS, QUESTIONS, TASKS, presetRange, rangeError, filterRows, estimateTokens, textTokens,
    weekStart, buildModel, toMarkdown, buildPrompt, withPrompt, filename, clean,
  };
});
