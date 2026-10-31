import type { DemoCatalog, PlaceId, WalkingRoute } from "./demo";
import type { Language } from "../i18n";

export type OfflineAssetKind = "media" | "map";
export interface OfflineAsset { url: string; kind: OfflineAssetKind; tile?: boolean }
export interface OfflineMap {
  estimatedBytes?: number;
  style: Record<string, unknown>;
  bounds: [number, number, number, number];
  minZoom: number;
  maxZoom: number;
  sources: Record<string, { tiles: string[]; minzoom: number; maxzoom: number; attribution?: string }>;
  tileCount: number;
}
export interface OfflinePlan {
  schema: 1;
  // Absent on the original combined packages; those remain readable.
  kind?: "city-map" | "content";
  mapId?: string;
  id: string;
  title: string;
  language: Language;
  placeIds: PlaceId[];
  catalog: DemoCatalog;
  route?: WalkingRoute;
  galleries: Record<string, unknown>;
  map: OfflineMap;
  assets: OfflineAsset[];
}
export interface OfflinePackage extends OfflinePlan {
  downloadedAt: string;
  bytes: number;
  // Native returns fresh absolute file URLs; stored manifests use relative paths.
  files: Record<string, string>;
}
export interface OfflineTransfer {
  id: string;
  phase: "preparing" | "downloading";
  completed: number;
  total: number;
  bytes: number;
}
export interface OfflineState {
  ready: boolean;
  connected: boolean;
  packages: OfflinePackage[];
  transfer?: OfflineTransfer;
  error: string;
}

// OpenFreeMap explicitly permits offline packs with <=3,000 tiles or 50 MB,
// <=4 parallel requests and an app-specific User-Agent. Enforce both limits
// conservatively; the native downloader uses two parallel requests.
// https://openfreemap.org/tos/ (2026-10-14)
export const offlineLimits = {
  mapTiles: 3000,
  mapBytes: 50_000_000,
  packageBytes: 300_000_000,
  reserveBytes: 200_000_000,
  requests: 2,
} as const;
