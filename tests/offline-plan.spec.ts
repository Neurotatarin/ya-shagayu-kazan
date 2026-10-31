import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import type { DemoCatalog, WalkingRoute } from "../app/src/domain/demo";
import { makeCityMapPlan, makeOfflinePlan, mapBounds, mapTiles } from "../app/src/platform/offlinePlan";

const catalog = JSON.parse(readFileSync(new URL("../server/catalog.json", import.meta.url), "utf8")) as DemoCatalog;
const route = JSON.parse(readFileSync(new URL("./fixtures/walking-route.json", import.meta.url), "utf8")) as WalkingRoute;
const style = { version: 8, glyphs: "https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf", sprite: "https://tiles.openfreemap.org/sprites/test/ofm", sources: { raster: { type: "raster", tiles: ["https://invalid.example/{z}.png"] }, vector: { type: "vector", url: "https://tiles.openfreemap.org/planet" } }, layers: [{ id: "raster", source: "raster", type: "raster" }, { id: "labels", source: "vector", type: "symbol", layout: { "text-font": ["Noto Sans Regular"] } }] };
const photo = { url: "/media/offline-test-photo.jpg", width: 800, height: 600, caption: "Историческое фото", author: "Автор", sourceUrl: "https://commons.wikimedia.org/wiki/File:Example.jpg", license: "CC BY 4.0", licenseUrl: "https://creativecommons.org/licenses/by/4.0/" };
async function metadata(url: string) {
  if (url.includes("/styles/")) return structuredClone(style);
  if (url.endsWith("/planet")) return { tiles: ["https://tiles.openfreemap.org/planet/version/{z}/{x}/{y}.pbf"], minzoom: 0, maxzoom: 14, attribution: "OpenFreeMap · OpenMapTiles · © OpenStreetMap" };
  return { items: [photo] };
}

test.beforeEach(({}, info) => test.skip(info.project.name !== "phone-402", "Pure offline planning contracts run once; no device playback is claimed."));

test("a route pack preserves its street geometry, selected-language audio, photo licenses and bounded map dependencies", async () => {
  const walking = { ...route, placeIds: ["kremlin", "ushkova"] };
  const plan = await makeOfflinePlan({ id: "route-test", title: "Прогулка", language: "en", catalog, placeIds: walking.placeIds, route: walking }, metadata);
  expect(plan.route).toEqual(walking);
  expect(plan.id).toBe("route-test-en");
  expect(plan.map.tileCount).toBeGreaterThan(0);
  expect(plan.map.tileCount).toBeLessThanOrEqual(3000);
  expect(plan.kind).toBe("content");
  expect(plan.mapId).toBe("kazan-city-map");
  expect(plan.assets.every(a => a.kind === "media" && !a.tile)).toBe(true);
  const city = await makeCityMapPlan(catalog, metadata);
  expect(city.kind).toBe("city-map");
  expect(city.id).toBe("kazan-city-map");
  expect(city.assets.filter(a => a.tile).length).toBe(1135);
  expect(city.map.minZoom).toBe(8);
  expect(city.map.maxZoom).toBe(14);
  for (const place of catalog.places) {
    expect(place.coordinates![0]).toBeGreaterThan(city.map.bounds[0]);
    expect(place.coordinates![0]).toBeLessThan(city.map.bounds[2]);
    expect(place.coordinates![1]).toBeGreaterThan(city.map.bounds[1]);
    expect(place.coordinates![1]).toBeLessThan(city.map.bounds[3]);
  }
  expect(city.assets.every(a => a.kind === "map")).toBe(true);
  expect(new Set(plan.assets.map(a => a.url)).size).toBe(plan.assets.length);
  const krem = catalog.places.find(p => p.id === "kremlin")!;
  expect(plan.assets.some(a => a.url.endsWith(krem.audioTracks!.en!.url))).toBe(true);
  expect(plan.assets.some(a => a.url.endsWith(catalog.places.find(p => p.id === "ushkova")!.audioUrl!))).toBe(false);
  expect(plan.galleries.ushkova).toEqual({ items: [photo] });
  expect(plan.assets.filter(a => a.url.endsWith("offline-test-photo.jpg"))).toHaveLength(1);
  expect((plan.map.style.layers as { source?: string }[]).some(layer => layer.source === "raster")).toBe(false);
  expect(plan.map.sources.vector!.attribution).toContain("© OpenStreetMap");
  expect(city.assets.some(a => a.url.includes("1536-1791.pbf"))).toBe(true);
  expect(city.assets.some(a => a.url.endsWith("@2x.png"))).toBe(true);
});

test("missing foreign narration never downloads Russian fallback; excessive areas and unapproved hosts fail", async () => {
  const plan = await makeOfflinePlan({ id: "place-ushkova", title: "Дом Ушковой", language: "ar", catalog, placeIds: ["ushkova"] }, metadata);
  expect(plan.assets.some(a => a.url.includes("ushkova-") && a.url.endsWith(".mp3"))).toBe(false);
  expect(() => mapBounds([])).toThrow("OFFLINE_AREA_INVALID");
  expect(() => mapBounds([[0, 0]])).toThrow("OFFLINE_AREA_INVALID");
  expect(() => mapTiles([48, 55, 50, 57], 9, 14)).toThrow("OFFLINE_MAP_TOO_LARGE");
  await expect(makeOfflinePlan({ id: "route-test", title: "Прогулка", language: "ru", catalog, placeIds: ["kremlin", "ushkova"] }, metadata)).rejects.toThrow("OFFLINE_ROUTE_REQUIRED");
  await expect(makeOfflinePlan({ id: "place-test", title: "Дом", language: "ru", catalog, placeIds: ["ushkova"] }, async url => url.includes("gallery-") ? { items: [{ ...photo, url: "https://invalid.example/image.jpg" }] } : metadata(url))).rejects.toThrow("OFFLINE_GALLERY_INVALID");
});
