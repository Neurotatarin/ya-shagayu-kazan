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
    const parsed = new URL(original);
    const resource = parsed.origin + parsed.pathname;
    // An unavailable local asset never silently falls back to the network.
    if (!local) throw new Error(`OFFLINE_MAP_ASSET_MISSING lookup ${resource}`);
    const response = await fetch(local, { signal: controller.signal });
    if (!response.ok) throw new Error(`OFFLINE_MAP_ASSET_MISSING HTTP ${response.status} ${resource}`);
    return { data: parameters.type === "json" ? await response.json() : await response.arrayBuffer() };
  });
}
export function offlineMapStyle(pack: OfflinePackage): StyleSpecification {
  return JSON.parse(JSON.stringify(pack.map.style)) as StyleSpecification;
}
// Expand sprite @2x/.json/.png and glyph/tile templates as standard HTTPS
// URLs first. Older Android WebViews do not reliably mutate URL.pathname for
// custom schemes. Redirect only the final resource request to private files.
export const offlineMapRequest = (url: string) => ({ url: offlineURL(url) });
