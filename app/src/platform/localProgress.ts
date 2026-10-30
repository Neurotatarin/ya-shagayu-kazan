import type { LocalProgress, PlaceId } from "../domain/demo";
import { isLanguage, type Language } from "../i18n";

const storageKey = "kazan:design-preview:progress:v1";
const pendingKey = "kazan:progress:pending:v1";
const validId = (id: unknown): id is PlaceId => typeof id === "string" && /^[a-z][a-z0-9-]{0,50}$/.test(id);
const initial = (): LocalProgress => ({ favorites: [], positions: {}, visited: [] });

export function loadLocalProgress(): LocalProgress {
  try {
    const text = localStorage.getItem(storageKey);
    if (!text) return initial();
    const saved = JSON.parse(text) as Partial<LocalProgress>;
    const favorites = Array.isArray(saved.favorites) ? saved.favorites.filter(validId) : [];
    const positions: LocalProgress["positions"] = {};
    for (const id of Object.keys(saved.positions ?? {}).filter(validId)) {
      const seconds = saved.positions?.[id];
      if (typeof seconds === "number" && Number.isFinite(seconds)) positions[id] = Math.max(0, Math.min(seconds, 86400));
    }
    const audioPositions: NonNullable<LocalProgress["audioPositions"]> = {};
    for (const [id, tracks] of Object.entries(saved.audioPositions ?? {})) {
      if (!validId(id) || !tracks || typeof tracks !== "object") continue;
      for (const [language, seconds] of Object.entries(tracks)) if (isLanguage(language) && typeof seconds === "number" && Number.isFinite(seconds) && seconds >= 0 && seconds <= 86400) audioPositions[id] = { ...audioPositions[id], [language]: seconds };
    }
    return { favorites, positions, visited: Array.isArray(saved.visited) ? saved.visited.filter(validId) : [], ...(Object.keys(audioPositions).length ? { audioPositions } : {}) };
  } catch { return initial(); }
}

export function audioPosition(progress: LocalProgress, place: PlaceId, language: Language) {
  return progress.audioPositions?.[place]?.[language] ?? (language === "ru" ? progress.positions[place] ?? 0 : 0);
}
export function withAudioPosition(progress: LocalProgress, place: PlaceId, language: Language, seconds: number): LocalProgress {
  const position = Math.max(0, Math.min(Number.isFinite(seconds) ? seconds : 0, 86400));
  return { ...progress, positions: language === "ru" ? { ...progress.positions, [place]: position } : progress.positions, audioPositions: { ...progress.audioPositions, [place]: { ...progress.audioPositions?.[place], [language]: position } } };
}

export function saveLocalProgress(progress: LocalProgress, pending = true): boolean {
  try { localStorage.setItem(storageKey, JSON.stringify(progress)); if (pending) localStorage.setItem(pendingKey, "1"); return true; }
  catch { return false; }
}

export function hasPendingProgress(): boolean {
  try { return localStorage.getItem(pendingKey) === "1"; } catch { return false; }
}

export function acknowledgeProgress(progress: LocalProgress) {
  try { if (localStorage.getItem(storageKey) === JSON.stringify(progress)) localStorage.removeItem(pendingKey); } catch { /* Keep the pending local copy. */ }
}
