import { Map } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import catalog from "../../../server/catalog.json";
import walkingRoute from "../../../tests/fixtures/walking-route.json";
import { backgroundMusic } from "../../../app/src/data/backgroundMusic";
import { audioSmoke } from "./audioSmoke";
import { prepareMapWorker } from "../../../app/src/platform/mapWorker";
import { cancelOffline, downloadOffline, initializeOffline, localMediaURL, offlineSnapshot, prepareOffline, removeOffline } from "../../../app/src/platform/offlineStore";
import { offlineMapStyle, registerOfflineMapProtocol } from "../../../app/src/platform/offlineMap";
import type { DemoCatalog, PlaceImage, WalkingRoute } from "../../../app/src/domain/demo";

declare global { interface Window { kazanOfflineSmoke: (stage: (name: string) => void) => Promise<Record<string, unknown>>; kazanSmokeStage?: string; kazanSmokeResult?: Record<string, unknown>; kazanSmokeDiagnostics?: Record<string, unknown>; Capacitor: { nativePromise: (plugin: string, method: string, options?: unknown) => Promise<Record<string, unknown>> } } }
registerOfflineMapProtocol();
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
  let terminal: string | undefined;
  const pending = downloadOffline(prepared.plan).then(() => terminal = "saved", error => terminal = (error as {code?: string}).code);
  let actualPending = false;
  for (let i = 0; i < 80; i++) {
    const nativeState = await window.Capacitor.nativePromise("KazanOffline", "getState");
    if ((nativeState.transfer as { id?: string })?.id === prepared.plan.id) { actualPending = true; break; }
    if (terminal) break;
    await sleep(25);
  }
  assert(actualPending, `offline-download-not-pending-${terminal ?? "timeout"}`);
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
  const diagnostics = { basicWorker: false, workerOrigin: "", webgl2: false, renderer: "", pixelRatio: devicePixelRatio, viewport: [innerWidth, innerHeight], requests: {} as Record<string, number>, signatures: {} as Record<string, string>, firstTileBytes: 0, firstTileMagic: "", contextLost: 0, errors: [] as string[] };
  window.kazanSmokeDiagnostics = diagnostics;
  const mapFiles = new globalThis.Map(pack.assets.filter(asset => asset.kind === "map").map(asset => [localMediaURL(asset.url), asset] as const));
  window.fetch = ((resource: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof resource === "string" ? resource : resource instanceof URL ? resource.href : resource.url;
    if (/^https?:/.test(url)) { blockedNetworkRequests++; return Promise.reject(new Error("offline-network-fallback")); }
    return fetchOnline(resource, init).then(async response => {
      const asset = mapFiles.get(url);
      if (asset) {
        const kind = asset.tile ? "tile" : asset.url.includes("/fonts/") ? "glyph" : asset.url.endsWith(".json") ? "spriteJson" : "spriteImage";
        diagnostics.requests[kind] = (diagnostics.requests[kind] ?? 0) + 1;
        const data = new Uint8Array(await response.clone().arrayBuffer());
        diagnostics.signatures[kind] ??= [...data.subarray(0, 4)].map(value => value.toString(16).padStart(2, "0")).join("");
      }
      return response;
    });
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
      image.removeAttribute("src");
    }
    stage("offline-tile-format");
    const tile = pack.assets.find(asset => asset.tile)!;
    const tileBytes = new Uint8Array(await (await fetch(localMediaURL(tile.url)!)).arrayBuffer());
    diagnostics.firstTileBytes = tileBytes.length;
    diagnostics.firstTileMagic = [...tileBytes.subarray(0, 4)].map(value => value.toString(16).padStart(2, "0")).join("");
    assert(!(tileBytes[0] === 0x1f && tileBytes[1] === 0x8b), "offline-tile-still-gzip");
    assert(tileBytes[0] !== 0x3c && tileBytes[0] !== 0x7b, "offline-tile-not-protobuf");
    stage("offline-worker-probe");
    const probeURL = URL.createObjectURL(new Blob(["self.postMessage({ok:true,origin:self.location.origin});"], { type: "text/javascript" }));
    const probe = new Worker(probeURL);
    try {
      const result = await bounded(new Promise<{ok: boolean; origin: string}>((resolve, reject) => { probe.onmessage = event => resolve(event.data); probe.onerror = () => reject(new Error("offline-basic-worker-error")); }), 10000, "offline-basic-worker-timeout");
      diagnostics.basicWorker = result.ok; diagnostics.workerOrigin = result.origin;
      assert(result.ok, "offline-basic-worker-invalid");
    } finally { probe.terminate(); URL.revokeObjectURL(probeURL); }
    stage("offline-webgl-probe");
    const canvas = document.createElement("canvas"), gl = canvas.getContext("webgl2");
    diagnostics.webgl2 = !!gl;
    assert(gl, "offline-webgl2-unavailable");
    diagnostics.renderer = String(gl!.getParameter(gl!.RENDERER));
    gl!.getExtension("WEBGL_lose_context")?.loseContext();
    stage("offline-map-render"); status.textContent = "Offline street map (network blocked)";
    await bounded(prepareMapWorker(), 20000, "offline-worker-timeout");
    map = new Map({ container: "map", style: offlineMapStyle(pack), center: [49.1208124, 55.7918589], zoom: 15, fadeDuration: 0, attributionControl: false });
    map.on("load", () => {
      map!.addSource("saved-route", { type: "geojson", data: { type: "Feature", properties: {}, geometry: pack.route!.geometry } });
      map!.addLayer({ id: "saved-route", type: "line", source: "saved-route", paint: { "line-color": "#08734f", "line-width": 4 } });
    });
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("offline-map-timeout")), 60000);
      map!.on("error", event => { const message = event.error?.message ?? ""; const kind = /worker/i.test(message) ? "worker" : /pbf|protobuf|varint/i.test(message) ? "protobuf" : /glyph|font/i.test(message) ? "glyph" : /webgl|gpu|context/i.test(message) ? "graphics" : "resource"; diagnostics.errors.push(kind); clearTimeout(timeout); reject(new Error("offline-map-" + kind)); });
      map!.getCanvas().addEventListener("webglcontextlost", () => { diagnostics.contextLost++; });
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
