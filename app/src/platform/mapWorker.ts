import { Capacitor } from "@capacitor/core";
import { setWorkerCount, setWorkerUrl } from "maplibre-gl";
import workerURL from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";

let initialization: Promise<void> | undefined;
export function prepareMapWorker() {
  if (!initialization) initialization = (async () => {
    if (Capacitor.isNativePlatform()) setWorkerCount(1);
    if (Capacitor.isNativePlatform() && Capacitor.getPlatform() === "ios") {
      // Bound the worker memory footprint on phones such as iPhone XR.
      setWorkerCount(1);
      // WKWebView loads our bundle over capacitor://. Use the already bundled,
      // self-contained worker as a classic Blob worker; no module import from
      // the custom scheme or external worker script is needed offline.
      const response = await fetch(workerURL);
      if (!response.ok) throw new Error("MAP_WORKER_UNAVAILABLE");
      const source = await response.text();
      const url = URL.createObjectURL(new Blob([source], { type: "text/javascript" }));
      // MapLibre 6 uses the .cjs suffix to select its classic-worker path.
      // Keep this one Blob for the app lifetime, shared by successive maps.
      setWorkerUrl(url + "#maplibre-gl-worker.cjs");
    } else setWorkerUrl(workerURL);
  })().catch(error => { initialization = undefined; throw error; });
  return initialization;
}
