import { Capacitor } from "@capacitor/core";
import type { PlatformKind } from "./contracts";
export const platformKind: PlatformKind =
  Capacitor.getPlatform() === "ios" ? "ios" : "web";
// Future iOS audio uses AVAudioSession/AVPlayer through a native plugin, not a WebView timer.
// Downloaded files will use the native file store on iOS and quota-aware storage on the web.
