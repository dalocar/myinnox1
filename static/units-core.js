/* Units (kg / lb) - pure logic, no DOM. Browser global `UnitsCore`, Node
   module.exports. The server ALWAYS stores kg (course/activity weights in
   tenths of a kg); the official app converts only for display and on save.
   Profile `unit`: 0 = Metric, 1 = Imperial. Conversions round to one decimal;
   lb typed by the user is rounded to 0.1 kg on save (15 lb -> 6.8 kg, which
   displays back as 15.0 lb), matching the official app. */
(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.UnitsCore = api;
})(typeof self !== "undefined" ? self : this, function () {
  const LB_PER_KG = 2.20462;
  const METRIC = 0, IMPERIAL = 1;

  const num = (v) => { const n = typeof v === "string" ? parseFloat(v) : v; return Number.isFinite(n) ? n : 0; };
  const round1 = (n) => Math.round(n * 10) / 10;

  // Anything that is not exactly Imperial (1 or "1") is Metric.
  const normalizeUnit = (u) => (Number(u) === IMPERIAL ? IMPERIAL : METRIC);
  const isImperial = (u) => normalizeUnit(u) === IMPERIAL;
  const unitFromProfile = (p) => normalizeUnit(p && p.unit);
  // Symbol: "kg" or "lb" (official app writes "lbs"; we use "lb").
  const label = (u) => (isImperial(u) ? "lb" : "kg");

  // kg (plain number) -> display number, one decimal.
  const kgToDisplay = (kg, u) => (isImperial(u) ? round1(num(kg) * LB_PER_KG) : round1(num(kg)));
  // display number -> kg, rounded to 0.1 kg.
  const displayToKg = (v, u) => (isImperial(u) ? round1(num(v) / LB_PER_KG) : round1(num(v)));

  // tenths of kg (server storage) -> display number, one decimal.
  const fromTenths = (tenths, u) => (isImperial(u)
    ? Math.round((num(tenths) / 10) * LB_PER_KG * 10) / 10
    : Math.round(num(tenths)) / 10);
  // display number -> integer tenths of kg to store. Rounds to 0.1 kg.
  const toTenths = (v, u) => (isImperial(u)
    ? Math.round((num(v) / LB_PER_KG) * 10)
    : Math.round(num(v) * 10));

  // "22.0" / "10.0" (no unit symbol).
  const fmtTenths = (tenths, u) => fromTenths(tenths, u).toFixed(1);
  // "22.0 lb" / "10.0 kg".
  const fmtWeight = (tenths, u) => `${fmtTenths(tenths, u)} ${label(u)}`;

  // Re-label a translated string that embeds the kg symbol ("Weight (kg)",
  // "Kg / side", "Volume {a} kg", "kg/Seite", "（kg）") without needing a pack
  // entry per language. Metric returns the string unchanged.
  function unitText(str, u) {
    const s = String(str == null ? "" : str);
    if (!isImperial(u)) return s;
    return s.replace(/\bKg\b/g, "Lb").replace(/\bkg\b/g, "lb");
  }

  return {
    LB_PER_KG, METRIC, IMPERIAL,
    normalizeUnit, isImperial, unitFromProfile, label,
    kgToDisplay, displayToKg, fromTenths, toTenths, fmtTenths, fmtWeight, unitText,
  };
});
