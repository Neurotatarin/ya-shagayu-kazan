import { Capacitor } from "@capacitor/core";

export const platform = Capacitor.getPlatform() === "ios" ? "ios" : "web";

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
