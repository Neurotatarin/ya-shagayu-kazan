import { Capacitor } from "@capacitor/core";
import { t, getLanguage, type Language } from "../i18n";
import type { CatalogRepository, DemoCatalog, LocalProgress, PlaceId, WalkingRoute, ZilantAnswer } from "../domain/demo";
import { downloadedCatalog, downloadedWalkingRoute, localMediaURL, nativeDownloads, nativeOnline } from "../platform/offlineStore";

const base = Capacitor.isNativePlatform() ? "https://kazan-demo.38-180-191-162.sslip.io" : "";
const sessionKey = "kazan:guest:token:v1";
const catalogKey = "kazan:catalog:v1";
let sessionPromise: Promise<string> | undefined;
let memoryToken = "";

export async function api<T>(path: string, options: RequestInit = {}, authenticated = true, retried = false): Promise<T> {
  if (!nativeOnline()) throw new Error(t("Нет связи с сервером. Проверь интернет и попробуй ещё раз."));
  const token = authenticated ? await guestToken() : "";
  let response: Response;
  try { response = await fetch(`${base}/api/${path}`, { ...options, headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}), ...options.headers } }); }
  catch (error) { if (options.signal?.aborted) throw error; throw new Error(t("Нет связи с сервером. Проверь интернет и попробуй ещё раз.")); }
  if (response.status === 401 && authenticated && !retried) {
    memoryToken = ""; sessionPromise = undefined;
    try { localStorage.removeItem(sessionKey); } catch { /* In-memory replacement works. */ }
    return api<T>(path, options, true, true);
  }
  let result;
  try { result = await response.json(); } catch { throw new Error(t("Сервис временно недоступен. Попробуй ещё раз.")); }
  if (!response.ok) throw new Error(t(result.error || "Сервис временно недоступен. Попробуй ещё раз."));
  return result as T;
}

async function guestToken(): Promise<string> {
  if (memoryToken) return memoryToken;
  try { const saved = localStorage.getItem(sessionKey); if (saved) return memoryToken = saved; } catch { /* In-memory guest still works. */ }
  if (!sessionPromise) sessionPromise = api<{ token: string }>("guest", { method: "POST", body: "{}" }, false).then(({ token }) => {
    memoryToken = token;
    try { localStorage.setItem(sessionKey, token); } catch { /* No browser persistence. */ }
    return token;
  }).catch(error => { sessionPromise = undefined; throw error; });
  return sessionPromise;
}

export const apiCatalogRepository: CatalogRepository = {
  async getCatalog(signal) {
    const saved = downloadedCatalog();
    if (saved && !nativeOnline()) return saved;
    const controller = new AbortController(), abort = () => controller.abort();
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) controller.abort();
    const timeout = nativeDownloads && saved ? setTimeout(abort, 4000) : undefined;
    try {
      const result = await api<DemoCatalog>("catalog", { signal: controller.signal }, false);
      try { localStorage.setItem(catalogKey, JSON.stringify(result)); } catch { /* Catalog does not require storage. */ }
      return result;
    } catch (error) {
      if (signal.aborted) throw error;
      if (saved) return saved;
      // This only preserves the last catalog, not a downloaded offline map/tour.
      try { const cached = localStorage.getItem(catalogKey); if (cached) return JSON.parse(cached) as DemoCatalog; } catch { /* Show retry state. */ }
      throw error;
    } finally { clearTimeout(timeout); signal.removeEventListener("abort", abort); }
  },
};

export const getServerProgress = () => api<LocalProgress>("progress");
export const putServerProgress = (progress: LocalProgress) => api<LocalProgress>("progress", { method: "PUT", body: JSON.stringify(progress) });
export const calculateWalkingRoute = (placeIds: PlaceId[], signal: AbortSignal, start?: [number, number]) => {
  if (!nativeOnline()) {
    const saved = !start && downloadedWalkingRoute(placeIds);
    return saved ? Promise.resolve(saved) : Promise.reject(new Error(t("Нет сети. Новые пути рассчитываются онлайн.")));
  }
  return api<WalkingRoute>("walking-route", { method: "POST", signal, body: JSON.stringify({ placeIds, ...(start ? { start } : {}) }) }).catch(error => {
    const saved = !signal.aborted && !start && downloadedWalkingRoute(placeIds);
    if (saved) return { ...saved, cached: true };
    throw error;
  });
};
export const askZilant = (message: string, conversationId: string, signal: AbortSignal, language: Language = getLanguage()) => api<ZilantAnswer>("chat", { method: "POST", signal, body: JSON.stringify({ message, conversationId, language }) });
export const remoteMediaUrl = (url: string) => url.startsWith("/") ? `${base}${url}` : url;
export const mediaUrl = (url: string) => localMediaURL(url) ?? remoteMediaUrl(url);
