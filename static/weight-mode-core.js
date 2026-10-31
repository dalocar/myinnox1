/* Weight mode of an exercise, from its `sideNum` (pure, no DOM; exposed as
   `WeightModeCore`, Node module.exports for tests).
   Confirmed with the official app: custom actions created with "Weight mode: Per Side"
   store sideNum 1, "Combined" stores sideNum 2; sideNum 0 means the exercise has no
   weight (warm-ups, stretches, bodyweight). A step stores exactly the number the editor
   shows, so there is no per-cable halving or doubling in the API: for Combined (sideNum 2,
   both cables work at once) `sideWeight` is the resistance PER CABLE and the machine's
   workout screen shows the TOTAL (2 x sideWeight). Inferred from the community report and
   the owner's reading, pending a machine check; stored values are never changed. */
(function (root) {
  "use strict";
  const MODES = {
    none: { key: "none", sideNum: 0, label: "No weight", hasWeight: false },
    perSide: { key: "per-side", sideNum: 1, label: "Per side", hasWeight: true },
    combined: { key: "combined", sideNum: 2, label: "Combined", hasWeight: true },
  };
  // Unknown or missing sideNum: no badge, weight stays editable (never lock a field on a guess).
  const UNKNOWN = { key: "unknown", sideNum: null, label: null, hasWeight: true };

  // modeFor(sideNum) -> {key, sideNum, label (English i18n key or null), hasWeight}
  function modeFor(sideNum) {
    if (sideNum === null || sideNum === undefined || sideNum === "") return UNKNOWN;
    const n = Number(sideNum);
    if (n === 0) return MODES.none;
    if (n === 1) return MODES.perSide;
    if (n === 2) return MODES.combined;
    return UNKNOWN;
  }

  // Total resistance in tenths of kg, computed from the STORED value (convert to lb
  // afterwards, never double an already-rounded lb figure): Combined -> 2 x stored,
  // Per side / unknown -> as stored, no weight -> 0.
  function totalTenths(sideNum, sideWeightTenths) {
    const n = Math.round(Number(sideWeightTenths));
    const w = Number.isFinite(n) && n > 0 ? n : 0;
    const mode = modeFor(sideNum);
    if (mode.key === "none") return 0;
    return mode.key === "combined" ? w * 2 : w;
  }

  // breakdown(sideNum, stored tenths) -> {perCable, total (tenths of kg), showTotal}.
  // showTotal is true only for Combined, where the total differs from the entered number.
  function breakdown(sideNum, sideWeightTenths) {
    const mode = modeFor(sideNum);
    const n = Math.round(Number(sideWeightTenths));
    const perCable = mode.key !== "none" && Number.isFinite(n) && n > 0 ? n : 0;
    return { perCable, total: totalTenths(sideNum, sideWeightTenths), showTotal: mode.key === "combined" };
  }

  const api = { modeFor, totalTenths, breakdown, MODES, UNKNOWN };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.WeightModeCore = api;
})(typeof window !== "undefined" ? window : globalThis);
