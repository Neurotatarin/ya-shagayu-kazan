import { Capacitor, registerPlugin, type PluginListenerHandle } from "@capacitor/core";
import { useSyncExternalStore } from "react";
import type { DemoCatalog, PlaceId, WalkingRoute } from "../domain/demo";
import type { OfflinePackage, OfflinePlan, OfflineState, OfflineTransfer } from "../domain/offline";
import { makeOfflinePlan } from "./offlinePlan";

interface Estimate { upperBytes: number; availableBytes: number; enoughSpace: boolean }
interface NativeOffline {
  getState(): Promise<OfflineState>;
  fetchMetadata(options: { url: string }): Promise<{ value: unknown }>;
  estimate(options: { plan: OfflinePlan }): Promise<Estimate>;
  download(options: { plan: OfflinePlan }): Promise<{ saved: boolean }>;
  cancel(): Promise<void>;
  remove(options: { id: string }): Promise<void>;
  addListener(event: string, callback: (value: Record<string, unknown>) => void): Promise<PluginListenerHandle>;
}
export const nativeDownloads = Capacitor.getPlatform() === "ios" && Capacitor.isNativePlatform();
const bridge = registerPlugin<NativeOffline>("KazanOffline");
const origin = "https://kazan-demo.38-180-191-162.sslip.io";
let state: OfflineState = { ready: !nativeDownloads, connected: navigator.onLine, packages: [], error: "" };
let files = new Map<string, string>();
let initialization: Promise<void> | undefined;
let generation = 0;
const listeners = new Set<() => void>();
const update = (value: Partial<OfflineState>) => { state = { ...state, ...value }; for (const listener of listeners) listener(); };
const canonical = (url: string) => new URL(url, origin).href;

function errorCode(error: unknown) {
  const value = error && typeof error === "object" ? "code" in error ? String(error.code) : "message" in error && /^OFFLINE_[A-Z_]+$/.test(String(error.message)) ? String(error.message) : "" : "";
  return value === "UNIMPLEMENTED" ? "OFFLINE_BRIDGE_UNAVAILABLE" : /^OFFLINE_[A-Z_]+$/.test(value) ? value : "OFFLINE_NETWORK";
}
export function offlineErrorText(code: string) {
  return ({ OFFLINE_STORAGE: "Недостаточно свободного места на iPhone. Освободи место и повтори.", OFFLINE_NETWORK: "Не удалось скачать пакет. Проверь интернет и повтори.", OFFLINE_BUSY: "Другая загрузка ещё выполняется.", OFFLINE_LIMIT: "Пакет превысил допустимый размер. Неполная загрузка не сохранена.", OFFLINE_MAP_TOO_LARGE: "Область слишком большая для одной офлайн-загрузки.", OFFLINE_CANCELLED: "Загрузка отменена.", OFFLINE_PREPARE: "Сначала проверь состав и размер пакета.", OFFLINE_BRIDGE_UNAVAILABLE: "Офлайн-модуль iPhone недоступен. Нужна новая версия приложения." } as Record<string, string>)[code] ?? "Не удалось подготовить офлайн-пакет. Попробуй ещё раз.";
}
function hydrate(value: OfflineState) {
  const packages = Array.isArray(value.packages) ? value.packages : [];
  files = new Map(packages.flatMap(pack => Object.entries(pack.files ?? {}).filter(([, url]) => url.startsWith("file://")).map(([url, path]) => [canonical(url), path] as const)));
  update({ ...value, ready: true, packages, transfer: value.transfer, error: "" });
}
async function refresh() { hydrate(await bridge.getState()); }
export function initializeOffline() {
  if (!nativeDownloads) return Promise.resolve();
  if (!initialization) initialization = (async () => {
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try { await Promise.race([(async () => {
    await bridge.addListener("transferChange", event => update({ transfer: event.finished ? undefined : event as unknown as OfflineTransfer }));
    await bridge.addListener("packagesChange", () => { void refresh().catch(error => update({ error: errorCode(error) })); });
    await bridge.addListener("networkChange", event => {
      const connected = event.connected === true, changed = state.connected !== connected;
      update({ connected });
      if (changed) window.dispatchEvent(new Event(connected ? "online" : "offline"));
    });
    await refresh();
    })(), new Promise<void>((_, reject) => { timeout = setTimeout(() => reject(Object.assign(new Error(), { code: "OFFLINE_BRIDGE_UNAVAILABLE" })), 5000); })]); }
    finally { clearTimeout(timeout); }
  })().catch(error => { update({ ready: true, error: errorCode(error) }); });
  return initialization;
}
if (!nativeDownloads) for (const event of ["online", "offline"]) window.addEventListener(event, () => update({ connected: navigator.onLine }));

export const nativeOnline = () => !nativeDownloads || state.connected;
export const offlineSnapshot = () => state;
export function useOfflineState() { return useSyncExternalStore(listener => { listeners.add(listener); return () => { listeners.delete(listener); }; }, () => state); }
export function offlineFileURL(url: string) { return nativeDownloads ? files.get(canonical(url)) : undefined; }
export function localMediaURL(url: string) { const file = offlineFileURL(url); return file ? Capacitor.convertFileSrc(file) : undefined; }
export function downloadedCatalog(): DemoCatalog | undefined { return state.packages.find(pack => Array.isArray(pack.catalog?.places) && pack.catalog.places.length)?.catalog; }
export function downloadedMap(ids: readonly PlaceId[], selected?: PlaceId, force = false) {
  if (!nativeDownloads || (state.connected && !force)) return undefined;
  return state.packages.find(pack => ids.length ? ids.every(id => pack.placeIds.includes(id)) : selected ? pack.placeIds.includes(selected) : true) ?? state.packages[0];
}
export function downloadedWalkingRoute(ids: readonly PlaceId[]): WalkingRoute | undefined { return state.packages.find(pack => pack.route?.placeIds.join(",") === ids.join(","))?.route; }
export function hasDownloadedAudio(url?: string) { return !!url && !!offlineFileURL(url); }

export async function prepareOffline(input: Parameters<typeof makeOfflinePlan>[0]) {
  if (!nativeDownloads) throw Object.assign(new Error(), { code: "OFFLINE_BRIDGE_UNAVAILABLE" });
  await initializeOffline();
  if (state.transfer) throw Object.assign(new Error(), { code: "OFFLINE_BUSY" });
  const version = ++generation;
  update({ transfer: { id: input.id + "-" + input.language, phase: "preparing", completed: 0, total: 0, bytes: 0 }, error: "" });
  try {
    const plan = await makeOfflinePlan(input, async url => {
      if (version !== generation) throw Object.assign(new Error(), { code: "OFFLINE_CANCELLED" });
      return (await bridge.fetchMetadata({ url })).value;
    });
    const estimate = await bridge.estimate({ plan });
    if (version !== generation) throw Object.assign(new Error(), { code: "OFFLINE_CANCELLED" });
    return { plan, ...estimate };
  } catch (error) {
    const code = errorCode(error);
    if (version === generation && code !== "OFFLINE_CANCELLED") update({ error: code });
    throw Object.assign(new Error(), { code });
  } finally { if (version === generation) update({ transfer: undefined }); }
}
export async function downloadOffline(plan: OfflinePlan) {
  await initializeOffline();
  if (state.transfer) throw Object.assign(new Error(), { code: "OFFLINE_BUSY" });
  update({ transfer: { id: plan.id, phase: "downloading", completed: 0, total: plan.assets.length, bytes: 0 }, error: "" });
  try { await bridge.download({ plan }); await refresh(); }
  catch (error) { const code = errorCode(error); if (code !== "OFFLINE_CANCELLED") update({ error: code }); throw Object.assign(new Error(), { code }); }
  finally { update({ transfer: undefined }); }
}
export async function cancelOffline() { generation++; update({ transfer: undefined, error: "" }); if (nativeDownloads) await bridge.cancel(); }
export async function removeOffline(id: string) { await bridge.remove({ id }); await refresh(); }
export function findDownloadedPlace(id: string, language: string): OfflinePackage | undefined { return state.packages.find(pack => pack.language === language && pack.placeIds.includes(id)); }
