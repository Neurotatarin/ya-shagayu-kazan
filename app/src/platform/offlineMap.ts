import { addProtocol, type Map } from "maplibre-gl";
import type { OfflinePackage } from "../domain/offline";
import { localMediaURL } from "./offlineStore";

let registered = false;
type StyleSpecification = ReturnType<Map["getStyle"]>;
const offlineURL = (url: string) => url.replace(/^https:\/\//, "kazan-offline://");
export function registerOfflineMapProtocol() {
  if (registered) return;
  registered = true;
  addProtocol("kazan-offline", async (parameters, controller) => {
    const original = parameters.url.replace(/^kazan-offline:\/\//, "https://");
    const local = localMediaURL(original);
    // An unavailable local asset never silently falls back to the network.
    if (!local) throw new Error("OFFLINE_MAP_ASSET_MISSING");
    const response = await fetch(local, { signal: controller.signal });
    if (!response.ok) throw new Error("OFFLINE_MAP_ASSET_MISSING");
    return { data: parameters.type === "json" ? await response.json() : await response.arrayBuffer() };
  });
}
export function offlineMapStyle(pack: OfflinePackage): StyleSpecification {
  const style = JSON.parse(JSON.stringify(pack.map.style)) as StyleSpecification;
  const sources = style.sources as Record<string, { type: string; tiles?: string[] }>;
  for (const source of Object.values(sources)) if (source.type === "vector" && source.tiles) source.tiles = source.tiles.map(offlineURL);
  if (typeof style.sprite === "string") style.sprite = offlineURL(style.sprite);
  if (style.glyphs) style.glyphs = offlineURL(style.glyphs);
  return style;
}
