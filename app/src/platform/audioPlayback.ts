import { useSyncExternalStore } from "react";
import type { Place } from "../domain/demo";
import { mediaUrl } from "../data/api";

// One audio element survives screen navigation. Native background audio is a
// separate platform adapter; Media Session support alone does not prove iOS background playback.
const audio = new Audio();
audio.preload = "metadata";
let state = { placeId: "", position: 0, duration: 0, playing: false, speed: 1, error: "" };
const listeners = new Set<() => void>();
const publish = () => { state = { ...state, position: audio.currentTime || 0, duration: Number.isFinite(audio.duration) ? audio.duration : state.duration, playing: !audio.paused, speed: audio.playbackRate }; for (const listener of listeners) listener(); };
for (const event of ["timeupdate", "play", "pause", "loadedmetadata", "ratechange", "ended"]) audio.addEventListener(event, publish);
audio.addEventListener("error", () => { state = { ...state, error: "Не удалось загрузить аудио. Проверь подключение и попробуй ещё раз." }; publish(); });

export function prepareAudio(place: Place, position: number) {
  if (!place.audioUrl) return false;
  if (state.placeId !== place.id) {
    audio.pause();
    state = { placeId: place.id, position, duration: place.durationSeconds, playing: false, speed: 1, error: "" };
    audio.src = mediaUrl(place.audioUrl);
    audio.addEventListener("loadedmetadata", () => { audio.currentTime = Math.min(position, audio.duration || position); publish(); }, { once: true });
    if ("mediaSession" in navigator) {
      navigator.mediaSession.metadata = new MediaMetadata({ title: place.title, artist: "Зилант", album: "Я шагаю по Казани" });
      for (const [name, handler] of Object.entries({ play: () => { void audio.play().catch(() => {}); }, pause: () => audio.pause(), seekbackward: () => seekAudio(audio.currentTime - 15), seekforward: () => seekAudio(audio.currentTime + 15) })) {
        try { navigator.mediaSession.setActionHandler(name as MediaSessionAction, handler); } catch { /* Optional platform action. */ }
      }
      try { navigator.mediaSession.setActionHandler("seekto", detail => seekAudio(detail.seekTime ?? audio.currentTime)); } catch { /* Optional. */ }
    }
    publish();
  }
  return true;
}
export async function toggleAudio() { if (audio.paused) await audio.play(); else audio.pause(); }
export function seekAudio(seconds: number) { audio.currentTime = Math.max(0, Math.min(seconds, Number.isFinite(audio.duration) ? audio.duration : state.duration)); publish(); }
export function setAudioSpeed(speed: number) { audio.playbackRate = speed; }
export function useAudioPlayback() { return useSyncExternalStore(listener => { listeners.add(listener); return () => listeners.delete(listener); }, () => state); }
