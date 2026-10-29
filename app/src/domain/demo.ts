import type { AssetKey } from "../data/figmaAssets";

export type Screen = "home" | "map" | "place" | "player" | "zilant" | "dialog" | "waiting" | "routes" | "profile";
export type PlaceId = "ushkova" | "kul-sharif";
export interface Place {
  id: PlaceId; title: string; eyebrow: string; address?: string; description: string;
  photo: AssetKey; durationSeconds: number;
}
export interface ThemeRoute {
  id: string; title: string; description: string; meta: string;
  theme: "heart" | "imperial" | "tatar" | "threeHours" | "modern";
  nodeId: string;
}
export interface LocalProgress { favorites: PlaceId[]; positions: Partial<Record<PlaceId, number>> }
export interface DemoCatalog { places: readonly Place[]; routes: readonly ThemeRoute[] }
export interface CatalogRepository { getCatalog(signal: AbortSignal): Promise<DemoCatalog> }
export type ShowNotice = (message: string) => void;

export function readScreen(hash: string): Screen {
  const value = hash.replace(/^#\/?/, "").split("/")[0];
  return (["home", "map", "place", "player", "zilant", "dialog", "waiting", "routes", "profile"] as string[]).includes(value) ? value as Screen : "home";
}
