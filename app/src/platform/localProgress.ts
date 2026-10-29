import type { LocalProgress, PlaceId } from "../domain/demo";

const storageKey = "kazan:design-preview:progress:v1";
const validIds: PlaceId[] = ["ushkova", "kul-sharif"];
const initial = (): LocalProgress => ({ favorites: ["ushkova"], positions: {} });

export function loadLocalProgress(): LocalProgress {
  try {
    const text = localStorage.getItem(storageKey);
    if (!text) return initial();
    const saved = JSON.parse(text) as Partial<LocalProgress>;
    const favorites = Array.isArray(saved.favorites) ? validIds.filter(id => saved.favorites!.includes(id)) : [];
    const positions: LocalProgress["positions"] = {};
    for (const id of validIds) {
      const seconds = saved.positions?.[id];
      if (typeof seconds === "number" && Number.isFinite(seconds)) positions[id] = Math.max(0, Math.min(seconds, id === "ushkova" ? 260 : 240));
    }
    return { favorites, positions };
  } catch { return initial(); }
}

export function saveLocalProgress(progress: LocalProgress): boolean {
  try { localStorage.setItem(storageKey, JSON.stringify(progress)); return true; }
  catch { return false; }
}
