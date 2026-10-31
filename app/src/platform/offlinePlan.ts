import type { DemoCatalog, PlaceId, PlaceImage, WalkingRoute } from "../domain/demo";
import type { OfflineAsset, OfflineMap, OfflinePlan } from "../domain/offline";
import { offlineLimits } from "../domain/offline";
import type { Language } from "../i18n";
import { offlineCity } from "../data/offlineCity";
import { backgroundMusic } from "../data/backgroundMusic";

const origin = "https://kazan-demo.38-180-191-162.sslip.io";
const styleURL = "https://tiles.openfreemap.org/styles/positron";
type JsonReader = (url: string) => Promise<unknown>;
type TileSource = { tiles: string[]; minzoom?: number; maxzoom?: number; attribution?: string };
const absolute = (url: string) => new URL(url, origin).href;
const mercatorY = (latitude: number, zoom: number) => {
  const radians = Math.max(-85, Math.min(85, latitude)) * Math.PI / 180;
  return Math.floor((1 - Math.log(Math.tan(radians) + 1 / Math.cos(radians)) / Math.PI) / 2 * 2 ** zoom);
};

export function mapBounds(points: readonly [number, number][], bufferMeters = 800): [number, number, number, number] {
  if (!points.length || points.some(([lon, lat]) => !Number.isFinite(lon) || !Number.isFinite(lat) || lon < 48 || lon > 50 || lat < 55 || lat > 57)) throw new Error("OFFLINE_AREA_INVALID");
  const latitude = points.reduce((sum, point) => sum + point[1], 0) / points.length;
  const dx = bufferMeters / (111_320 * Math.cos(latitude * Math.PI / 180)), dy = bufferMeters / 111_320;
  return [Math.min(...points.map(p => p[0])) - dx, Math.min(...points.map(p => p[1])) - dy, Math.max(...points.map(p => p[0])) + dx, Math.max(...points.map(p => p[1])) + dy];
}

export function mapTiles(bounds: OfflineMap["bounds"], minZoom: number, maxZoom: number) {
  const result: { z: number; x: number; y: number }[] = [];
  for (let z = minZoom; z <= maxZoom; z++) {
    const left = Math.floor((bounds[0] + 180) / 360 * 2 ** z), right = Math.floor((bounds[2] + 180) / 360 * 2 ** z);
    const top = mercatorY(bounds[3], z), bottom = mercatorY(bounds[1], z);
    if ((right - left + 1) * (bottom - top + 1) + result.length > offlineLimits.mapTiles) throw new Error("OFFLINE_MAP_TOO_LARGE");
    for (let x = left; x <= right; x++) for (let y = top; y <= bottom; y++) result.push({ z, x, y });
  }
  return result;
}

export async function makeOfflinePlan(input: { id: string; title: string; language: Language; placeIds: PlaceId[]; catalog: DemoCatalog; route?: WalkingRoute; map?: OfflineMap }, read: JsonReader): Promise<OfflinePlan> {
  if (!/^[a-z][a-z0-9-]{0,60}$/.test(input.id)) throw new Error("OFFLINE_ID_INVALID");
  const ids = [...new Set(input.placeIds)];
  const places = ids.map(id => input.catalog.places.find(p => p.id === id));
  if (!ids.length || ids.length > 20 || places.some(p => !p?.coordinates)) throw new Error("OFFLINE_PLACES_INVALID");
  if (ids.length > 1 && (!input.route || input.route.placeIds.join(",") !== ids.join(","))) throw new Error("OFFLINE_ROUTE_REQUIRED");

  const { assets, add } = assetCollector();
  const galleries: Record<string, unknown> = {};
  let narrationCount = 0;
  for (const place of places) {
    if (!place) continue;
    if (place.image) add(place.image.url, "media");
    const track = place.audioTracks?.[input.language] ?? (input.language === "ru" && place.audioUrl ? { url: place.audioUrl } : undefined);
    if (track) { add(track.url, "media"); narrationCount++; }
    if (place.galleryUrl) {
      const gallery = await read(absolute(place.galleryUrl)) as { items?: PlaceImage[] };
      if (!Array.isArray(gallery.items) || gallery.items.length > 100 || gallery.items.some(photo => !photo.url?.startsWith("/media/") || !photo.sourceUrl?.startsWith("https://") || !photo.license)) throw new Error("OFFLINE_GALLERY_INVALID");
      galleries[place.id] = gallery;
      add(place.galleryUrl, "media");
      for (const photo of gallery.items) add(photo.url, "media");
    }
  }
  // Shared files are downloaded once by the native URL-keyed file store.
  if (narrationCount) add(backgroundMusic.url, "media");
  const map = input.map ?? (await makeCityMapPlan(input.catalog, read)).map;
  return { schema: 1, ...input, kind: "content", mapId: offlineCity.id, id: input.id + "-" + input.language, placeIds: ids, galleries, map, assets: [...assets.values()] };
}

function assetCollector() {
  const assets = new Map<string, OfflineAsset>();
  const add = (url: string, kind: OfflineAsset["kind"], tile = false) => {
    const normalized = absolute(url);
    const parsed = new URL(normalized);
    if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.port || !(parsed.hostname === "tiles.openfreemap.org" || (parsed.origin === origin && parsed.pathname.startsWith("/media/")))) throw new Error("OFFLINE_ASSET_REJECTED");
    assets.set(normalized, { url: normalized, kind, ...(tile ? { tile } : {}) });
  };
  return { assets, add };
}

export async function makeCityMapPlan(catalog: DemoCatalog, read: JsonReader): Promise<OfflinePlan> {
  const { assets, add } = assetCollector();
  const bounds = [...offlineCity.bounds] as OfflineMap["bounds"];
  if (catalog.places.some(p => p.coordinates && (p.coordinates[0] < bounds[0] || p.coordinates[0] > bounds[2] || p.coordinates[1] < bounds[1] || p.coordinates[1] > bounds[3]))) throw new Error("OFFLINE_AREA_INVALID");
  const style = await read(styleURL) as Record<string, unknown> & { version: number; sources: Record<string, Record<string, unknown>>; layers: Record<string, unknown>[]; glyphs?: string; sprite?: string };
  if (style.version !== 8 || !style.sources || !Array.isArray(style.layers)) throw new Error("OFFLINE_STYLE_INVALID");
  const sources: OfflineMap["sources"] = {};
  let tileCount = 0, minZoom: number = offlineCity.minZoom, maxZoom: number = offlineCity.maxZoom;
  for (const [name, source] of Object.entries(style.sources)) {
    // The source's Natural Earth raster is only used at zoom <=6; the offline
    // route region starts at zoom 9 and retains the same detailed vector style.
    if (source.type !== "vector") { delete style.sources[name]; style.layers = style.layers.filter(layer => layer.source !== name); continue; }
    const tilejson = (typeof source.url === "string" ? await read(source.url) : source) as TileSource;
    if (!Array.isArray(tilejson.tiles) || !tilejson.tiles.length || tilejson.tiles.some(url => typeof url !== "string")) throw new Error("OFFLINE_TILE_SOURCE_INVALID");
    const low = Math.max(minZoom, tilejson.minzoom ?? 0), high = Math.min(maxZoom, tilejson.maxzoom ?? 14);
    const tiles = mapTiles(bounds, low, high);
    tileCount += tiles.length;
    if (tileCount > offlineLimits.mapTiles) throw new Error("OFFLINE_MAP_TOO_LARGE");
    for (const tile of tiles) add(tilejson.tiles[0]!.replace("{z}", String(tile.z)).replace("{x}", String(tile.x)).replace("{y}", String(tile.y)), "map", true);
    sources[name] = { tiles: [tilejson.tiles[0]!], minzoom: low, maxzoom: high, ...(tilejson.attribution ? { attribution: tilejson.attribution } : {}) };
    delete source.url;
    Object.assign(source, sources[name], { bounds });
    minZoom = low; maxZoom = high;
  }
  if (!tileCount) throw new Error("OFFLINE_MAP_EMPTY");
  if (style.sprite) {
    if (typeof style.sprite !== "string") throw new Error("OFFLINE_SPRITE_INVALID");
    for (const suffix of [".json", ".png", "@2x.json", "@2x.png"]) add(style.sprite + suffix, "map");
  }
  if (style.glyphs) {
    const fonts = new Set<string>();
    for (const layer of style.layers) {
      const layout = layer.layout as Record<string, unknown> | undefined;
      if (!layout?.["text-font"]) continue;
      const font = layout["text-font"];
      if (!Array.isArray(font) || font.some(value => typeof value !== "string")) throw new Error("OFFLINE_FONT_INVALID");
      fonts.add(font.join(","));
    }
    // Latin, Cyrillic, Arabic and punctuation for the three supported languages.
    for (const font of fonts) for (const start of [0, 256, 512, 768, 1024, 1280, 1536, 1792, 8192, 8448, 65024, 65280]) add(style.glyphs.replace("{fontstack}", encodeURIComponent(font)).replace("{range}", `${start}-${start + 255}`), "map");
  }
  const hash = globalThis.crypto?.subtle ? [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode([...assets.keys()].sort().join("\n"))))].map(byte => byte.toString(16).padStart(2, "0")).join("") : "";
  const estimatedBytes = hash === offlineCity.assetsSHA256 ? offlineCity.knownBytes : undefined;
  return { schema: 1, kind: "city-map", id: offlineCity.id, title: "Карта Казани", language: "ru", placeIds: catalog.places.map(p => p.id), catalog, galleries: {}, map: { style, bounds, minZoom, maxZoom, sources, tileCount, estimatedBytes }, assets: [...assets.values()] };
}
