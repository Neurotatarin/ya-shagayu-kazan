import { Map, setWorkerUrl } from "maplibre-gl";
import workerURL from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import "maplibre-gl/dist/maplibre-gl.css";
import catalog from "../../../server/catalog.json";
import walkingRoute from "../../../tests/fixtures/walking-route.json";
import { cancelOffline, downloadOffline, initializeOffline, localMediaURL, offlineSnapshot, prepareOffline, removeOffline } from "../../../app/src/platform/offlineStore";
import { offlineMapStyle, registerOfflineMapProtocol } from "../../../app/src/platform/offlineMap";
import type { DemoCatalog, PlaceImage, WalkingRoute } from "../../../app/src/domain/demo";

declare global { interface Window { kazanOfflineSmoke: (stage: (name: string) => void) => Promise<Record<string, unknown>>; Capacitor: { nativePromise: (plugin: string, method: string, options?: unknown) => Promise<Record<string, unknown>> } } }
setWorkerUrl(workerURL); registerOfflineMapProtocol();
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const assert = (condition: unknown, code: string) => { if (!condition) throw new Error(code); };
window.kazanOfflineSmoke = async stage => {
  const status = document.getElementById("status")!;
  await initializeOffline();
  stage("offline-prepare"); status.textContent = "Preparing native offline package";
  const input = { id: "native-offline-check", title: "Native offline check", language: "ru" as const, placeIds: walkingRoute.placeIds, route: walkingRoute as unknown as WalkingRoute, catalog: catalog as unknown as DemoCatalog };
  const prepared = await prepareOffline(input);
  assert(prepared.enoughSpace, "offline-storage");
  stage("offline-cancel");
  const pending = downloadOffline(prepared.plan).then(() => "saved", error => (error as {code?: string}).code);
  await sleep(50);
  await cancelOffline();
  assert(await pending === "OFFLINE_CANCELLED", "offline-cancellation");
  assert(!offlineSnapshot().packages.some(pack => pack.id === prepared.plan.id), "partial-package-published");
  stage("offline-download"); status.textContent = "Downloading actual files";
  const retry = await prepareOffline(input);
  await downloadOffline(retry.plan);
  const pack = offlineSnapshot().packages.find(pack => pack.id === retry.plan.id)!;
  assert(pack && pack.assets.length === Object.keys(pack.files).length, "offline-files-incomplete");
  assert(pack.bytes > 0 && pack.bytes <= 300_000_000, "offline-package-limit");
  assert(JSON.stringify(pack.route?.geometry) === JSON.stringify(walkingRoute.geometry), "offline-walking-geometry");
  const fetchOnline = window.fetch.bind(window);
  let blockedNetworkRequests = 0;
  window.fetch = ((resource: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof resource === "string" ? resource : resource instanceof URL ? resource.href : resource.url;
    if (/^https?:/.test(url)) { blockedNetworkRequests++; return Promise.reject(new Error("offline-network-fallback")); }
    return fetchOnline(resource, init);
  }) as typeof fetch;
  let photoCount = 0, renderedFeatures = 0;
  let map: Map | undefined;
  try {
    stage("offline-photo-files");
    const galleryURL = catalog.places.find(place => place.id === "ushkova")!.galleryUrl;
    const gallery = await (await fetch(localMediaURL(galleryURL)!)).json() as { items: PlaceImage[] };
    assert(gallery.items.length >= 15, "offline-photo-inventory");
    for (const photo of gallery.items) {
      assert(photo.license && photo.author && photo.sourceUrl, "offline-photo-credit");
      const local = localMediaURL(photo.url);
      assert(local && !/^https?:/.test(local), "offline-photo-not-local");
      const image = new Image(); image.src = local!; await image.decode();
      assert(image.naturalWidth > 0, "offline-photo-decode"); photoCount++;
    }
    stage("offline-map-render"); status.textContent = "Offline street map (network blocked)";
    map = new Map({ container: "map", style: offlineMapStyle(pack), center: [49.1208124, 55.7918589], zoom: 15, fadeDuration: 0, attributionControl: false });
    map.on("load", () => {
      map!.addSource("saved-route", { type: "geojson", data: { type: "Feature", properties: {}, geometry: pack.route!.geometry } });
      map!.addLayer({ id: "saved-route", type: "line", source: "saved-route", paint: { "line-color": "#08734f", "line-width": 4 } });
    });
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("offline-map-timeout")), 60000);
      map!.on("error", () => { clearTimeout(timeout); reject(new Error("offline-map-resource")); });
      map!.once("idle", () => { renderedFeatures = map!.queryRenderedFeatures().length; clearTimeout(timeout); resolve(); });
    });
    assert(renderedFeatures > 10, "offline-map-empty");
    assert(map.queryRenderedFeatures(undefined, { layers: ["saved-route"] }).length > 0, "offline-route-not-visible");
    assert(blockedNetworkRequests === 0, "offline-map-fell-back-online");
    stage("offline-map-rendered"); await sleep(1500);
    stage("offline-local-audio");
    const call = (method: string, options?: unknown) => window.Capacitor.nativePromise("KazanAudio", method, options);
    const narration = catalog.places.find(place => place.id === "ushkova")!;
    const loaded = await call("loadTrack", { id: "offline-check@ru", url: "https://kazan-demo.38-180-191-162.sslip.io" + narration.audioUrl, title: "Native local audio check", duration: 255, position: 0, speed: 1 });
    assert(loaded.local === true, "offline-audio-not-local");
    await call("play");
    let advanced = false;
    for (let i = 0; i < 120; i++) {
      const state = await call("getState");
      if (state.error) throw new Error("offline-audio-error");
      if (state.local && state.playing && Number(state.position) > 1.5) { advanced = true; break; }
      await sleep(500);
    }
    assert(advanced, "offline-local-audio-did-not-advance");
    await call("clearTrack");
    map.remove(); map = undefined;
    stage("offline-remove"); await removeOffline(pack.id);
    assert(!offlineSnapshot().packages.some(item => item.id === pack.id), "offline-remove-failed");
    status.textContent = "Native offline checks passed";
    return { ok: true, actualNativeDownload: true, cancellation: true, savedWalkingLine: true, photosDecoded: photoCount, renderedFeatures, blockedNetworkRequests, localAVPlayerAdvanced: true, removal: true };
  } finally { map?.remove(); window.fetch = fetchOnline; }
};
