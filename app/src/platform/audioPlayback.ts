import { useSyncExternalStore } from "react";
import { Capacitor, registerPlugin, type PluginListenerHandle } from "@capacitor/core";
import type { Place } from "../domain/demo";
import { mediaUrl } from "../data/api";
import { backgroundMusic } from "../data/backgroundMusic";

interface AudioState { placeId: string; position: number; duration: number; playing: boolean; loading: boolean; speed: number; error: string; backgroundEnabled: boolean; backgroundPlaying: boolean; backgroundError: string }
interface NativeAudio {
  loadTrack(options: { id: string; url: string; title: string; position: number; duration: number; speed: number }): Promise<AudioState>;
  play(): Promise<AudioState>; pause(): Promise<AudioState>; seek(options: { seconds: number }): Promise<AudioState>;
  setSpeed(options: { speed: number }): Promise<AudioState>; getState(): Promise<AudioState>;
  setBackground(options: { enabled: boolean; url: string; volume: number }): Promise<AudioState>;
  addListener(event: "stateChange", listener: (state: AudioState) => void): Promise<PluginListenerHandle>;
}
const native = Capacitor.getPlatform() === "ios" && Capacitor.isNativePlatform();
const nativePlayer = registerPlugin<NativeAudio>("KazanAudio");
const audio = native ? undefined : new Audio();
if (audio) audio.preload = "metadata";
let state: AudioState = { placeId: "", position: 0, duration: 0, playing: false, loading: false, speed: 1, error: "", backgroundEnabled: false, backgroundPlaying: false, backgroundError: "" };
let music: HTMLAudioElement | undefined, musicContext: AudioContext | undefined, musicGain: GainNode | undefined;
let musicPriming = false, musicAttempt = 0;
let restorePosition: number | undefined;
const listeners = new Set<() => void>();
const update = (change: Partial<AudioState>) => { state = { ...state, ...change }; for (const listener of listeners) listener(); };
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
function syncBackground(audible = !!audio && !audio.paused && !audio.ended && audio.readyState >= 3 && !state.loading) {
  if (!music) return;
  if (musicGain) musicGain.gain.value = state.backgroundEnabled && audible ? backgroundMusic.volume : 0;
  if (!state.backgroundEnabled || !audible) { if (!musicPriming || !state.backgroundEnabled) music.pause(); }
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
  audio.addEventListener("loadedmetadata", () => {
    if (restorePosition !== undefined) { audio.currentTime = Math.min(restorePosition, audio.duration || restorePosition); restorePosition = undefined; }
    browserState();
  });
  for (const event of ["waiting", "stalled", "seeking"]) audio.addEventListener(event, () => { update({ loading: !audio.paused }); syncBackground(false); });
  for (const event of ["playing", "canplay", "pause", "ended", "seeked"]) audio.addEventListener(event, () => { update({ loading: false }); syncBackground(); });
  audio.addEventListener("error", () => { failure(); syncBackground(false); });
}

const nativeReady = native ? nativePlayer.addListener("stateChange", snapshot => update(snapshot)).then(async () => update(await nativePlayer.getState())).catch(failure) : Promise.resolve();
document.addEventListener("visibilitychange", () => { if (native && document.visibilityState === "visible") void nativePlayer.getState().then(update).catch(failure); });

function prepareBrowser(place: Place, position: number, speed: number) {
  if (!audio || !place.audioUrl) return;
  if (state.placeId !== place.id || audio.error) {
    audio.pause(); restorePosition = Math.min(position, place.durationSeconds);
    update({ placeId: place.id, position: restorePosition, duration: place.durationSeconds, playing: false, loading: false, speed, error: "" });
    audio.src = mediaUrl(place.audioUrl); audio.playbackRate = speed;
    if ("mediaSession" in navigator) {
      navigator.mediaSession.metadata = new MediaMetadata({ title: place.title, artist: "Зилант", album: "Я шагаю по Казани" });
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
  if (native) {
    await nativeReady;
    update(await nativePlayer.loadTrack({ id: place.id, url: mediaUrl(place.audioUrl), title: place.title, duration: place.durationSeconds, position, speed }));
    update(await (state.playing ? nativePlayer.pause() : nativePlayer.play()));
  } else if (audio) {
    prepareBrowser(place, position, speed);
    audio.preload = "auto";
    audio.playbackRate = speed;
    if (audio.paused) { update({ loading: true, error: "" }); primeBackgroundFromGesture(); await audio.play(); } else audio.pause();
  }
  return true;
}
export async function setBackgroundEnabled(enabled: boolean) {
  update({ backgroundError: "" });
  if (native) {
    await nativeReady;
    try { update(await nativePlayer.setBackground({ enabled, url: mediaUrl(backgroundMusic.url), volume: backgroundMusic.volume })); }
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
  if (native) void nativePlayer.seek({ seconds: position }).then(update).catch(failure);
  else if (audio) { if (restorePosition !== undefined) restorePosition = position; else audio.currentTime = position; browserState(); }
}
export function setAudioSpeed(speed: number) {
  update({ speed });
  if (native) void nativePlayer.setSpeed({ speed }).then(update).catch(failure);
  else if (audio) audio.playbackRate = speed;
}
export function useAudioPlayback() { return useSyncExternalStore(listener => { listeners.add(listener); return () => listeners.delete(listener); }, () => state); }
