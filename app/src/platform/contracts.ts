// UI modules depend on these contracts, not on browser/native storage or player APIs.
export interface DownloadedFileStore {
  has(key: string): Promise<boolean>;
  remove(key: string): Promise<void>;
}
export interface PlaybackPositionStore {
  read(trackId: string): Promise<number | null>;
  write(trackId: string, seconds: number): Promise<void>;
}
export interface AudioPlayback {
  play(trackId: string): Promise<void>;
  pause(): Promise<void>;
  seek(seconds: number): Promise<void>;
}
export type PlatformKind = "web" | "ios";
