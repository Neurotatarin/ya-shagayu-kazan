import { useSyncExternalStore } from "react";
import { Capacitor, registerPlugin, type PluginListenerHandle } from "@capacitor/core";
import type { Place } from "../domain/demo";
import { mediaUrl, remoteMediaUrl } from "../data/api";
import { backgroundMusic } from "../data/backgroundMusic";
import { getLanguage, isLanguage, t, type Language } from "../i18n";

interface AudioState { placeId: string; language: Language; position: number; duration: number; playing: boolean; loading: boolean; speed: number; error: string; backgroundEnabled: boolean; backgroundPlaying: boolean; backgroundError: string }
type NativeState = Omit<AudioState, "language">;
interface NativeAudio {
  loadTrack(options: { id: string; url: string; title: string; artist: string; album: string; position: number; duration: number; speed: number }): Promise<NativeState>;
  play(): Promise<NativeState>; pause(): Promise<NativeState>; clearTrack(): Promise<NativeState>; seek(options: { seconds: number }): Promise<NativeState>;
  setSpeed(options: { speed: number }): Promise<NativeState>; getState(): Promise<NativeState>;
  setBackground(options: { enabled: boolean; url: string; volume: number }): Promise<NativeState>;
  addListener(event: "stateChange", listener: (state: NativeState) => void): Promise<PluginListenerHandle>;
}
const native = Capacitor.getPlatform() === "ios" && Capacitor.isNativePlatform();
const nativePlayer = registerPlugin<NativeAudio>("KazanAudio");
export function audioFailureMessage(error: unknown) {
  const raw = error && typeof error === "object" && "code" in error ? String(error.code) : "";
  const code = raw === "UNIMPLEMENTED" ? "AUDIO_BRIDGE_UNAVAILABLE" : /^AUDIO_(?:URL_REJECTED|(?:SESSION|LOAD)_-?\d+)$/.test(raw) ? raw : native ? "AUDIO_NATIVE_UNKNOWN" : "";
  if (code) try { localStorage.setItem("kazan:audio-error:v1", JSON.stringify({ code, time: new Date().toISOString() })); } catch { /* Playback does not require diagnostic storage. */ }
  return t("Не удалось начать воспроизведение. Попробуй ещё раз.") + (code ? ` [${code}]` : "");
}
const audio = native ? undefined : new Audio();
if (audio) audio.preload = "metadata";
let state: AudioState = { placeId: "", language: getLanguage(), position: 0, duration: 0, playing: false, loading: false, speed: 1, error: "", backgroundEnabled: false, backgroundPlaying: false, backgroundError: "" };
let trackVersion = 0, loadedSource = "";
let music: HTMLAudioElement | undefined, musicContext: AudioContext | undefined, musicGain: GainNode | undefined;
let musicPriming = false, musicAttempt = 0;
let browserAudible = false, lastBrowserTime = 0;
let restorePosition: number | undefined;
const listeners = new Set<() => void>();
const update = (change: Partial<AudioState>) => { state = { ...state, ...change }; for (const listener of listeners) listener(); };
const updateNative = (snapshot: NativeState) => { const [placeId, language] = snapshot.placeId.split("@"); update({ ...snapshot, placeId, language: isLanguage(language) ? language : "ru" }); };
const failure = () => update({ error: "Не удалось загрузить аудио. Проверь подключение и попробуй ещё раз.", loading: false, playing: false });
const backgroundFailure = () => {
  musicPriming = false; musicAttempt++; music?.pause();
  if (musicGain) musicGain.gain.value = 0;
  update({ backgroundEnabled: false, backgroundPlaying: false, backgroundError: "Музыкальный фон недоступен. Рассказ продолжается; фон можно включить ещё раз." });
};
function prepareBackground() {
  if (music) return;
  const context = new AudioContext();
  const track = new Audio(); track.preload = "none"; track.loop = true;
  track.setAttribute("data-kazan-background", "true");
  const gain = context.createGain(); gain.gain.value = 0;
  context.createMediaElementSource(track).connect(gain); gain.connect(context.destination);
  // Stream the long recording: decoding the entire MP3 into an AudioBuffer
  // would use hundreds of MB on a phone. Only music passes through Web Audio;
  // narration keeps its existing browser/lock-screen playback path.
  music = track; musicContext = context; musicGain = gain;
  track.src = mediaUrl(backgroundMusic.url);
  track.addEventListener("playing", () => update({ backgroundPlaying: true }));
  track.addEventListener("pause", () => update({ backgroundPlaying: false }));
  track.addEventListener("error", backgroundFailure);
}
function syncBackground(audible = browserAudible && !!audio && !audio.paused && !audio.ended && !audio.seeking) {
  if (!music) return;
  if (musicGain) musicGain.gain.value = state.backgroundEnabled && audible ? backgroundMusic.volume : 0;
  // During buffering/seek keep the already-unlocked stream silent. Pausing it
  // here would require a second Safari gesture when narration becomes ready.
  const paused = !state.backgroundEnabled || !audio || audio.paused || audio.ended;
  if (paused) { if (!musicPriming || !state.backgroundEnabled) music.pause(); }
  else if (music.paused) void music.play().catch(error => { if (error.name !== "AbortError") backgroundFailure(); });
}
function primeBackgroundFromGesture() {
  if (!music || !state.backgroundEnabled) return;
  const attempt = ++musicAttempt; musicPriming = true;
  void musicContext?.resume().catch(backgroundFailure);
  // Safari unlocks each media element separately. Start the streaming element
  // in the actual tap, muted until narration is audible, then pause if needed.
  // Waiting for the narration's asynchronous 'playing' event loses that gesture.
  void music.play().then(() => {
    if (attempt === musicAttempt) { musicPriming = false; syncBackground(); }
  }).catch(error => {
    if (attempt === musicAttempt) { musicPriming = false; if (error.name !== "AbortError") backgroundFailure(); }
  });
}

function browserState() {
  if (!audio) return;
  update({ position: restorePosition ?? (audio.currentTime || 0), duration: Number.isFinite(audio.duration) ? audio.duration : state.duration, playing: !audio.paused && !audio.ended, speed: audio.playbackRate });
  if ("mediaSession" in navigator) {
    navigator.mediaSession.playbackState = state.playing ? "playing" : "paused";
    if (state.duration > 0) try { navigator.mediaSession.setPositionState({ duration: state.duration, position: Math.min(state.position, state.duration), playbackRate: state.speed }); } catch { /* Optional browser support. */ }
  }
  syncBackground();
}
if (audio) {
  for (const event of ["timeupdate", "play", "pause", "ratechange", "ended"]) audio.addEventListener(event, browserState);
  audio.addEventListener("timeupdate", () => {
    // WebKit may report a stalled network connection while buffered narration
    // keeps playing. Advancing playback is stronger evidence than that event.
    if (!audio.paused && !audio.seeking && audio.currentTime > lastBrowserTime + .01) { browserAudible = true; update({ loading: false }); syncBackground(); }
    lastBrowserTime = audio.currentTime;
  });
  audio.addEventListener("loadedmetadata", () => {
    if (restorePosition !== undefined) { audio.currentTime = Math.min(restorePosition, audio.duration || restorePosition); restorePosition = undefined; }
    browserState();
  });
  for (const event of ["waiting", "seeking"]) audio.addEventListener(event, () => { browserAudible = false; update({ loading: !audio.paused }); syncBackground(false); });
  audio.addEventListener("stalled", () => { if (audio.readyState < 2) { browserAudible = false; update({ loading: !audio.paused }); syncBackground(false); } });
  audio.addEventListener("playing", () => { browserAudible = true; update({ loading: false }); syncBackground(); });
  for (const event of ["pause", "ended"]) audio.addEventListener(event, () => { browserAudible = false; update({ loading: false }); syncBackground(false); });
  audio.addEventListener("error", () => { browserAudible = false; failure(); syncBackground(false); });
}

const nativeReady = native ? nativePlayer.addListener("stateChange", updateNative).then(async () => updateNative(await nativePlayer.getState())).catch(failure) : Promise.resolve();
document.addEventListener("visibilitychange", () => { if (native && document.visibilityState === "visible") void nativePlayer.getState().then(updateNative).catch(failure); });

function prepareBrowser(place: Place, position: number, speed: number) {
  if (!audio || !place.audioUrl) return;
  if (state.placeId !== place.id || state.language !== (place.audioLanguage ?? "ru") || loadedSource !== place.audioUrl || audio.error) {
    audio.pause(); browserAudible = false; lastBrowserTime = 0; restorePosition = Math.min(position, place.durationSeconds);
    update({ placeId: place.id, language: place.audioLanguage ?? "ru", position: restorePosition, duration: place.durationSeconds, playing: false, loading: false, speed, error: "" });
    loadedSource = place.audioUrl;
    audio.src = mediaUrl(place.audioUrl); audio.playbackRate = speed;
    if ("mediaSession" in navigator) {
      navigator.mediaSession.metadata = new MediaMetadata({ title: place.title, artist: t("Зилант"), album: t("Я шагаю по Казани") });
      for (const [name, handler] of Object.entries({ play: () => { primeBackgroundFromGesture(); void audio.play().catch(failure); }, pause: () => audio.pause(), seekbackward: () => seekAudio(audio.currentTime - 15), seekforward: () => seekAudio(audio.currentTime + 15) })) {
        try { navigator.mediaSession.setActionHandler(name as MediaSessionAction, handler); } catch { /* Optional action. */ }
      }
      try { navigator.mediaSession.setActionHandler("seekto", detail => seekAudio(detail.seekTime ?? audio.currentTime)); } catch { /* Optional action. */ }
    }
  }
}

// In the browser audio.play() runs before the first await, preserving the iOS
// Safari user gesture. The iPhone shell uses AVPlayer and AVAudioSession instead.
export async function toggleAudio(place: Place, position: number, speed = 1): Promise<boolean> {
  if (!place.audioUrl) return false;
  const version = trackVersion;
  if (native) {
    await nativeReady;
    if (version !== trackVersion) return false;
    const sameTrack = state.placeId === place.id && state.language === (place.audioLanguage ?? "ru");
    const wasPlaying = sameTrack && state.playing;
    updateNative(await nativePlayer.loadTrack({ id: place.id + "@" + (place.audioLanguage ?? "ru"), url: remoteMediaUrl(place.audioUrl), title: place.title, artist: t("Зилант"), album: t("Я шагаю по Казани"), duration: place.durationSeconds, position: sameTrack ? state.position : position, speed }));
    if (version !== trackVersion) return false;
    updateNative(await (wasPlaying ? nativePlayer.pause() : nativePlayer.play()));
  } else if (audio) {
    prepareBrowser(place, position, speed);
    audio.preload = "auto";
    audio.playbackRate = speed;
    if (audio.paused) { update({ loading: true, error: "" }); primeBackgroundFromGesture(); try { await audio.play(); } catch (error) { if (version === trackVersion) throw error; } } else audio.pause();
  }
  return true;
}
export async function closeAudio() {
  trackVersion++;
  if (native) {
    await nativeReady;
    updateNative(await nativePlayer.clearTrack());
  } else if (audio) {
    audio.pause(); music?.pause(); browserAudible = false; restorePosition = undefined; loadedSource = "";
    audio.removeAttribute("src"); audio.load();
    if ("mediaSession" in navigator) {
      navigator.mediaSession.metadata = null; navigator.mediaSession.playbackState = "none";
      for (const action of ["play", "pause", "seekbackward", "seekforward", "seekto"] as MediaSessionAction[]) try { navigator.mediaSession.setActionHandler(action, null); } catch { /* Optional browser action. */ }
      try { navigator.mediaSession.setPositionState(); } catch { /* Optional browser support. */ }
    }
    update({ placeId: "", language: getLanguage(), position: 0, duration: 0, playing: false, loading: false, error: "", backgroundPlaying: false, backgroundError: "" });
  }
}
export const clearAudioForLanguageChange = closeAudio;
export async function setBackgroundEnabled(enabled: boolean) {
  update({ backgroundError: "" });
  if (native) {
    await nativeReady;
    try { updateNative(await nativePlayer.setBackground({ enabled, url: remoteMediaUrl(backgroundMusic.url), volume: backgroundMusic.volume })); }
    catch { backgroundFailure(); }
  } else {
    try {
      if (enabled) {
        prepareBackground();
        if (music?.error) music.load();
      }
      update({ backgroundEnabled: enabled });
      if (enabled) primeBackgroundFromGesture();
      syncBackground();
    } catch { backgroundFailure(); }
  }
}
export function seekAudio(seconds: number) {
  const position = Math.max(0, Math.min(seconds, state.duration));
  update({ position });
  if (native) void nativePlayer.seek({ seconds: position }).then(updateNative).catch(failure);
  else if (audio) { if (restorePosition !== undefined) restorePosition = position; else audio.currentTime = position; browserState(); }
}
export function setAudioSpeed(speed: number) {
  update({ speed });
  if (native) void nativePlayer.setSpeed({ speed }).then(updateNative).catch(failure);
  else if (audio) audio.playbackRate = speed;
}
export function useAudioPlayback() { return useSyncExternalStore(listener => { listeners.add(listener); return () => listeners.delete(listener); }, () => state); }
