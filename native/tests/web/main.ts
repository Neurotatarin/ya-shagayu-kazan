import { Map, setWorkerUrl } from "maplibre-gl";
import workerURL from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import "maplibre-gl/dist/maplibre-gl.css";
import catalog from "../../../server/catalog.json";
import walkingRoute from "../../../tests/fixtures/walking-route.json";
import { backgroundMusic } from "../../../app/src/data/backgroundMusic";
import { audioSmoke } from "./audioSmoke";
import { cancelOffline, downloadOffline, initializeOffline, localMediaURL, offlineSnapshot, prepareOffline, removeOffline } from "../../../app/src/platform/offlineStore";
import { offlineMapStyle, registerOfflineMapProtocol } from "../../../app/src/platform/offlineMap";
import type { DemoCatalog, PlaceImage, WalkingRoute } from "../../../app/src/domain/demo";

declare global { interface Window { kazanOfflineSmoke: (stage: (name: string) => void) => Promise<Record<string, unknown>>; kazanSmokeStage?: string; kazanSmokeResult?: Record<string, unknown>; Capacitor: { nativePromise: (plugin: string, method: string, options?: unknown) => Promise<Record<string, unknown>> } } }
setWorkerUrl(workerURL); registerOfflineMapProtocol();
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const assert = (condition: unknown, code: string) => { if (!condition) throw new Error(code); };
async function bounded<T>(operation: Promise<T>, milliseconds: number, code: string) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try { return await Promise.race([operation, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error(code)), milliseconds); })]); }
  finally { clearTimeout(timer); }
}
window.kazanOfflineSmoke = async stage => {
  const status = document.getElementById("status")!;
  await initializeOffline();
  // Only our isolated CI package is removed. This makes cancellation a test
  // of an actual pending download rather than an already cached instant save.
  for (const pack of offlineSnapshot().packages.filter(pack => pack.id.startsWith("native-offline-check-"))) await removeOffline(pack.id);
  stage("offline-prepare"); status.textContent = "Preparing native offline package";
  const input = { id: "native-offline-check", title: "Native offline check", language: "ru" as const, placeIds: walkingRoute.placeIds, route: walkingRoute as unknown as WalkingRoute, catalog: catalog as unknown as DemoCatalog };
  const prepared = await bounded(prepareOffline(input), 120000, "offline-prepare-timeout");
  assert(prepared.enoughSpace, "offline-storage");
  stage("offline-cancel");
  const pending = downloadOffline(prepared.plan).then(() => "saved", error => (error as {code?: string}).code);
  const nativeState = await window.Capacitor.nativePromise("KazanOffline", "getState");
  assert((nativeState.transfer as { id?: string })?.id === prepared.plan.id, "offline-download-not-pending");
  await cancelOffline();
  const cancellation = await pending;
  assert(cancellation === "OFFLINE_CANCELLED", `offline-cancellation-${cancellation}`);
  assert(!offlineSnapshot().packages.some(pack => pack.id === prepared.plan.id), "partial-package-published");
  stage("offline-download"); status.textContent = "Downloading actual files";
  const retry = await bounded(prepareOffline(input), 120000, "offline-retry-timeout");
  await bounded(downloadOffline(retry.plan), 180000, "offline-download-timeout");
  const pack = offlineSnapshot().packages.find(pack => pack.id === retry.plan.id)!;
  assert(pack && pack.assets.length === Object.keys(pack.files).length, "offline-files-incomplete");
  assert(pack.bytes > 0 && pack.bytes <= 300_000_000, "offline-package-limit");
  const savedLine = pack.route?.geometry.coordinates ?? [], sourceLine = walkingRoute.geometry.coordinates;
  assert(pack.route?.geometry.type === "LineString" && savedLine.length === sourceLine.length && pack.route.placeIds.join(",") === input.placeIds.join(","), "offline-walking-geometry");
  const maxCoordinateDelta = Math.max(...sourceLine.flatMap((point, index) => point.map((coordinate, axis) => Math.abs(coordinate - savedLine[index]![axis]!))));
  // JSON dictionaries may reorder keys and NSNumber may round a Double by one
  // ULP. Keep the same line within sub-millimetre numeric precision.
  assert(maxCoordinateDelta < 1e-9, "offline-walking-coordinates");
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
      stage(`offline-photo-file-${photoCount + 1}`);
      assert(photo.license && photo.author && photo.sourceUrl, "offline-photo-credit");
      const local = localMediaURL(photo.url);
      assert(local && !/^https?:/.test(local), "offline-photo-not-local");
      const image = new Image(); image.src = local!; await bounded(image.decode(), 20000, "offline-photo-decode-timeout");
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
    stage("offline-background");
    await call("setBackground", { enabled: true, url: "https://kazan-demo.38-180-191-162.sslip.io" + backgroundMusic.url, volume: .08 });
    let backgroundPlaying = false;
    for (let i = 0; i < 60; i++) {
      const state = await call("getState");
      assert(!state.backgroundError, "offline-background-error");
      if (state.backgroundPlaying) { backgroundPlaying = true; break; }
      await sleep(500);
    }
    assert(backgroundPlaying, "offline-background-not-playing");
    await call("setBackground", { enabled: false });
    await call("clearTrack");
    map.remove(); map = undefined;
    stage("offline-remove"); await removeOffline(pack.id);
    assert(!offlineSnapshot().packages.some(item => item.id === pack.id), "offline-remove-failed");
    status.textContent = "Native offline checks passed";
    return { ok: true, actualNativeDownload: true, cancellation: true, savedWalkingLine: true, maxCoordinateDelta, photosDecoded: photoCount, renderedFeatures, blockedNetworkRequests, localAVPlayerAdvanced: true, backgroundPlaying, removal: true };
  } finally { map?.remove(); window.fetch = fetchOnline; }
};

// Run once from the final document itself. Native code only observes results;
// it never injects a second async scenario into a changing WKWebView document.
const stage = (name: string) => { window.kazanSmokeStage = name; };
stage("page-module-ready");
void audioSmoke(stage, () => window.kazanOfflineSmoke(stage)).then(result => { window.kazanSmokeResult = result; }).catch(error => {
  const category = String(error?.code || error?.message || "");
  window.kazanSmokeResult = { ok: false, check: window.kazanSmokeStage, reason: /^[A-Za-z0-9_-]{1,90}$/.test(category) ? category : "unclassified" };
});
