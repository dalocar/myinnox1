/* Movements screen - pure logic (no DOM). Works in the browser (global
   `MovementsCore`) and in Node (module.exports) so it can be unit tested with
   `node --test static/`.

   The /action/list payload is only partially documented (see
   docs/plan-movements-screen.md, Discovery), so every facet is derived from the
   data actually present and a facet with fewer than two distinct values is not
   offered. */
(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.MovementsCore = api;
})(typeof self !== "undefined" ? self : this, function () {
  const PAGE_SIZE = 60;
  // Candidate field names for a difficulty value, first one present wins.
  const LEVEL_FIELDS = ["level", "difficulty", "actionLevel", "degree", "grade"];

  // lower-case, strip diacritics, collapse whitespace ("Bíceps " -> "biceps")
  function normalize(str) {
    return String(str == null ? "" : str)
      .normalize("NFD").replace(/[̀-ͯ]/g, "")
      .toLowerCase().replace(/\s+/g, " ").trim();
  }

  // "1,4" -> ["1","4"]; tolerates arrays, numbers, null.
  function partsOf(a) {
    const v = a && a.muscleParts;
    const arr = Array.isArray(v) ? v : String(v == null ? "" : v).split(",");
    return arr.map((s) => String(s).trim()).filter(Boolean);
  }

  function levelOf(a) {
    if (!a) return null;
    for (const f of LEVEL_FIELDS) {
      const v = a[f];
      if (v !== undefined && v !== null && v !== "") return String(v);
    }
    return null;
  }

  function typeOf(a) {
    return a && a.actionType !== undefined && a.actionType !== null && a.actionType !== "" ? String(a.actionType) : null;
  }

  const toSet = (x) => (x instanceof Set ? x : new Set((x || []).map(String)));

  // AND between filters, OR within one filter. Empty filter = no constraint.
  function filterMovements(list, { query = "", parts, types, levels } = {}) {
    const q = normalize(query);
    const P = toSet(parts), T = toSet(types), L = toSet(levels);
    return (list || []).filter((a) => {
      if (q && !normalize(a.name).includes(q)) return false;
      if (P.size && !partsOf(a).some((p) => P.has(p))) return false;
      if (T.size && !T.has(typeOf(a))) return false;
      if (L.size && !L.has(levelOf(a))) return false;
      return true;
    });
  }

  // Which filter options actually exist in the data. `parts` keeps the given
  // order of knownParts (ids), `types`/`levels` are sorted. A facet with < 2
  // distinct values is returned as [] (nothing to filter on).
  function facetsFrom(list, knownParts) {
    const parts = new Set(), types = new Set(), levels = new Set();
    for (const a of list || []) {
      partsOf(a).forEach((p) => parts.add(p));
      const ty = typeOf(a); if (ty !== null) types.add(ty);
      const lv = levelOf(a); if (lv !== null) levels.add(lv);
    }
    const num = (x, y) => (Number(x) - Number(y)) || String(x).localeCompare(String(y));
    const partList = knownParts
      ? knownParts.filter((id) => parts.has(String(id))).map(String)
      : Array.from(parts).sort(num);
    return {
      parts: partList.length >= 2 ? partList : [],
      types: types.size >= 2 ? Array.from(types).sort(num) : [],
      levels: levels.size >= 2 ? Array.from(levels).sort(num) : [],
    };
  }

  // First `page` pages of `size` items (cumulative: "Show more" grows page).
  function paginate(list, page, size = PAGE_SIZE) {
    const n = Math.max(1, Math.floor(page) || 1);
    const items = (list || []).slice(0, n * size);
    return { items, total: (list || []).length, shown: items.length, hasMore: items.length < (list || []).length };
  }

  // Number of active filter groups (search not counted) - for the badge.
  function countActive({ parts, types, levels } = {}) {
    return [parts, types, levels].filter((s) => toSet(s).size > 0).length;
  }

  return { PAGE_SIZE, LEVEL_FIELDS, normalize, partsOf, levelOf, typeOf, filterMovements, facetsFrom, paginate, countActive };
});
