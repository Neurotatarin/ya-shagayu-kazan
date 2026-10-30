import type { AssetKey } from "../data/figmaAssets";

export type Screen = "home" | "map" | "place" | "player" | "zilant" | "dialog" | "waiting" | "routes" | "profile";
export type PlaceId = string;
export interface Place {
  id: PlaceId; title: string; eyebrow: string; address?: string; description: string;
  photo?: AssetKey; durationSeconds: number; coordinates?: [number, number];
  category?: string; audioUrl?: string; coordinateSource?: string;
}
export interface ThemeRoute {
  id: string; title: string; description: string; meta: string;
  theme: "heart" | "imperial" | "tatar" | "threeHours" | "modern";
  nodeId: string;
  placeIds?: PlaceId[];
}
export interface LocalProgress { favorites: PlaceId[]; positions: Partial<Record<PlaceId, number>>; visited?: PlaceId[] }
export interface WalkingRoute {
  geometry: { type: "LineString"; coordinates: [number, number][] };
  distanceMeters: number; durationSeconds: number;
  legs: { distanceMeters: number; durationSeconds: number }[];
  placeIds: PlaceId[]; provider: string; cached: boolean;
}
export interface ZilantAnswer { message: string; routeTitle: string; placeIds: PlaceId[]; model: string }
export interface DemoCatalog { places: readonly Place[]; routes: readonly ThemeRoute[] }
export interface CatalogRepository { getCatalog(signal: AbortSignal): Promise<DemoCatalog> }
export type ShowNotice = (message: string) => void;
export const countPlaces = (count: number) => `${count} ${{ one: "место", few: "места", many: "мест", other: "мест" }[new Intl.PluralRules("ru").select(count) as "one" | "few" | "many" | "other"]}`;

export function readScreen(hash: string): Screen {
  const value = hash.replace(/^#\/?/, "").split("/")[0];
  return (["home", "map", "place", "player", "zilant", "dialog", "waiting", "routes", "profile"] as string[]).includes(value) ? value as Screen : "home";
}
