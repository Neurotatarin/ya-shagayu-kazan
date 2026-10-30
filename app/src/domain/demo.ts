import type { AssetKey } from "../data/figmaAssets";
import type { Language } from "../i18n";
export { countPlaces } from "../i18n";

export type Screen = "home" | "map" | "place" | "player" | "zilant" | "dialog" | "waiting" | "routes" | "profile";
export type PlaceId = string;
export interface PlaceImage {
  url: string; width: number; height: number; caption: string; date?: string;
  author: string; sourceUrl: string; license: string; licenseUrl: string;
  position?: string;
  captions?: Partial<Record<Language, string>>;
}
export interface Place {
  id: PlaceId; title: string; eyebrow: string; address?: string; description: string;
  photo?: AssetKey; durationSeconds: number; coordinates?: [number, number];
  category?: string; audioUrl?: string; coordinateSource?: string;
  image?: PlaceImage; galleryUrl?: string;
  audioTracks?: Partial<Record<Language, { url: string; durationSeconds: number }>>;
  audioLanguage?: Language;
  translations?: Partial<Record<Language, Partial<Pick<Place, "title" | "eyebrow" | "address" | "description">>>>;
}
export interface ThemeRoute {
  id: string; title: string; description: string; meta: string;
  theme: "heart" | "imperial" | "tatar" | "threeHours" | "modern";
  nodeId: string;
  placeIds?: PlaceId[];
}
export interface LocalProgress { favorites: PlaceId[]; positions: Partial<Record<PlaceId, number>>; visited?: PlaceId[]; audioPositions?: Partial<Record<PlaceId, Partial<Record<Language, number>>>> }
export interface WalkingRoute {
  geometry: { type: "LineString"; coordinates: [number, number][] };
  distanceMeters: number; durationSeconds: number;
  legs: { distanceMeters: number; durationSeconds: number }[];
  placeIds: PlaceId[]; provider: string; cached: boolean;
}
export interface ZilantAnswer { message: string; routeTitle: string; placeIds: PlaceId[]; model: string; routeDistanceMeters?: number; walkingSeconds?: number; fitsBudget?: boolean }
export interface DemoCatalog { places: readonly Place[]; routes: readonly ThemeRoute[] }
export interface CatalogRepository { getCatalog(signal: AbortSignal): Promise<DemoCatalog> }
export type ShowNotice = (message: string) => void;

export function readScreen(hash: string): Screen {
  const value = hash.replace(/^#\/?/, "").split("/")[0];
  return (["home", "map", "place", "player", "zilant", "dialog", "waiting", "routes", "profile"] as string[]).includes(value) ? value as Screen : "home";
}
