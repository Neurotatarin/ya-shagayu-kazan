import { Capacitor, registerPlugin, type PluginListenerHandle } from "@capacitor/core";
import { useSyncExternalStore } from "react";
import type { DemoCatalog, PlaceId, WalkingRoute } from "../domain/demo";
import type { OfflinePackage, OfflinePlan, OfflineState, OfflineTransfer } from "../domain/offline";
import { makeCityMapPlan, makeOfflinePlan } from "./offlinePlan";
import { offlineCity } from "../data/offlineCity";

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
let batch: { id: string; part: string; total: number; completed: number; bytes: number } | undefined;
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
  update({ ...value, ready: true, packages, transfer: batch ? state.transfer : value.transfer, error: "" });
}
async function refresh() { hydrate(await bridge.getState()); }
export function initializeOffline() {
  if (!nativeDownloads) return Promise.resolve();
  if (!initialization) initialization = (async () => {
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try { await Promise.race([(async () => {
    await bridge.addListener("transferChange", event => {
      if (batch) {
        if (!event.finished && event.id === batch.part) update({ transfer: { id: batch.id, phase: "downloading", completed: batch.completed + Number(event.completed), total: batch.total, bytes: batch.bytes + Number(event.bytes) } });
      } else update({ transfer: event.finished ? undefined : event as unknown as OfflineTransfer });
    });
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
  const maps = state.packages.filter(pack => pack.kind !== "content");
  return maps.find(pack => pack.id === offlineCity.id) ?? maps.find(pack => ids.length ? ids.every(id => pack.placeIds.includes(id)) : selected ? pack.placeIds.includes(selected) : true) ?? maps[0];
}
export function downloadedWalkingRoute(ids: readonly PlaceId[]): WalkingRoute | undefined { return state.packages.find(pack => pack.route?.placeIds.join(",") === ids.join(","))?.route; }
export function hasDownloadedAudio(url?: string) { return !!url && !!offlineFileURL(url); }

export const offlineContextID = (input: { id: string; language: string; cityOnly?: boolean }) => input.cityOnly ? offlineCity.id : input.id + "-" + input.language;
export async function prepareOffline(input: Parameters<typeof makeOfflinePlan>[0] & { cityOnly?: boolean }) {
  if (!nativeDownloads) throw Object.assign(new Error(), { code: "OFFLINE_BRIDGE_UNAVAILABLE" });
  await initializeOffline();
  if (state.transfer) throw Object.assign(new Error(), { code: "OFFLINE_BUSY" });
  const version = ++generation;
  update({ transfer: { id: offlineContextID(input), phase: "preparing", completed: 0, total: 0, bytes: 0 }, error: "" });
  try {
    const read = async (url: string) => {
      if (version !== generation) throw Object.assign(new Error(), { code: "OFFLINE_CANCELLED" });
      return (await bridge.fetchMetadata({ url })).value;
    };
    const savedMap = state.packages.find(pack => pack.id === offlineCity.id);
    const cityPlan = !savedMap || input.cityOnly ? await makeCityMapPlan(input.catalog, read) : undefined;
    const plan = input.cityOnly ? cityPlan! : await makeOfflinePlan({ ...input, map: (cityPlan ?? savedMap)!.map }, read);
    const estimate = await bridge.estimate({ plan });
    const mapEstimate = cityPlan && !input.cityOnly ? await bridge.estimate({ plan: cityPlan }) : undefined;
    if (version !== generation) throw Object.assign(new Error(), { code: "OFFLINE_CANCELLED" });
    const upperBytes = estimate.upperBytes + (mapEstimate?.upperBytes ?? 0);
    const mapUpper = input.cityOnly ? estimate.upperBytes : mapEstimate?.upperBytes ?? 0;
    const mapApproximate = mapUpper > 0 && !!cityPlan?.map.estimatedBytes;
    const mapBytes = mapApproximate ? cityPlan!.map.estimatedBytes! : mapUpper;
    const contentBytes = input.cityOnly ? 0 : estimate.upperBytes;
    return { plan, cityPlan: input.cityOnly ? undefined : cityPlan, contentBytes, mapBytes, mapApproximate, downloadBytes: contentBytes + mapBytes, upperBytes, enoughSpace: estimate.enoughSpace && (mapEstimate?.enoughSpace ?? true) && Math.min(estimate.availableBytes, mapEstimate?.availableBytes ?? Infinity) >= upperBytes + 200_000_000 };
  } catch (error) {
    const code = errorCode(error);
    if (version === generation && code !== "OFFLINE_CANCELLED") update({ error: code });
    throw Object.assign(new Error(), { code });
  } finally { if (version === generation) update({ transfer: undefined }); }
}
export async function downloadOffline(plan: OfflinePlan, cityPlan?: OfflinePlan) {
  await initializeOffline();
  if (state.transfer) throw Object.assign(new Error(), { code: "OFFLINE_BUSY" });
  const version = ++generation;
  const jobs = cityPlan ? [cityPlan, plan] : [plan];
  batch = { id: plan.id, part: jobs[0]!.id, total: jobs.reduce((n, job) => n + job.assets.length, 0), completed: 0, bytes: 0 };
  update({ transfer: { id: plan.id, phase: "downloading", completed: 0, total: batch.total, bytes: 0 }, error: "" });
  try {
    for (const job of jobs) {
      if (version !== generation) throw Object.assign(new Error(), { code: "OFFLINE_CANCELLED" });
      batch!.part = job.id;
      await bridge.download({ plan: job }); await refresh();
      if (batch) { batch.completed += job.assets.length; batch.bytes += state.packages.find(pack => pack.id === job.id)?.bytes ?? 0; }
    }
  }
  catch (error) { const code = errorCode(error); if (code !== "OFFLINE_CANCELLED") update({ error: code }); throw Object.assign(new Error(), { code }); }
  finally { batch = undefined; update({ transfer: undefined }); }
}
export async function cancelOffline() { generation++; update({ transfer: undefined, error: "" }); if (nativeDownloads) await bridge.cancel(); }
export async function removeOffline(id: string) { await bridge.remove({ id }); await refresh(); }
export function findDownloadedPlace(id: string, language: string): OfflinePackage | undefined { return state.packages.find(pack => pack.kind !== "city-map" && pack.language === language && pack.placeIds.includes(id)); }
