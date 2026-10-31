// OSM administrative boundary for Kazan, plus a 1 km buffer. Covers every
// catalog stop, including the Temple of All Religions. Not a GPS restriction.
// https://www.openstreetmap.org/relation/3437391 (checked 2026-10-31)
export const offlineCity = {
  id: "kazan-city-map",
  bounds: [48.80461634253013, 55.59415258825009, 49.397215157469866, 55.939722111749916] as [number, number, number, number],
  minZoom: 8,
  maxZoom: 14,
  // Measured decoded files, used only when every asset URL still matches.
  knownBytes: 21_801_047,
  assetsSHA256: "d1d3d06d0326ec542d73a268aeabf1e57f68e0ce2d45a1665f7968612f8472d2",
};
