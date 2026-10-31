import { Capacitor } from "@capacitor/core";

export const platform = Capacitor.isNativePlatform() && ["ios", "android"].includes(Capacitor.getPlatform()) ? Capacitor.getPlatform() as "ios" | "android" : "web";
export const isNativeShell = platform !== "web";
export const deviceName = platform === "android" ? "Android" : "iPhone";

if (isNativeShell) {
  // WKWebView can focus-zoom small fields even with Capacitor's pinch zoom
  // disabled. Constrain only the installed shell; Safari keeps page zoom.
  document.documentElement.dataset.nativeShell = platform;
  document.querySelector<HTMLMetaElement>('meta[name="viewport"]')?.setAttribute("content", "width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover");
  const sizeViewport = () => {
    const height = Math.round(window.visualViewport?.height ?? window.innerHeight);
    if (Number.isFinite(height) && height > 0) document.documentElement.style.setProperty("--native-view-height", `${height}px`);
  };
  sizeViewport();
  window.visualViewport?.addEventListener("resize", sizeViewport);
  window.addEventListener("resize", sizeViewport);
}

// Future implementations belong to native AVPlayer/file adapters on iOS and
// browser media/storage adapters on web. Screens depend only on these contracts.
export interface AudioPlayback {
  play(trackId: string): Promise<void>;
  pause(): Promise<void>;
  seek(seconds: number): Promise<void>;
}
export interface PlaybackPositions {
  get(trackId: string): Promise<number | null>;
  set(trackId: string, seconds: number): Promise<void>;
}
export interface RouteDownloads {
  has(routeId: string): Promise<boolean>;
  remove(routeId: string): Promise<void>;
}
