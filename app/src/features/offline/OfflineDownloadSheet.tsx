import { useEffect, useState } from "react";
import type { DemoCatalog, PlaceId, WalkingRoute } from "../../domain/demo";
import type { OfflinePackage, OfflinePlan } from "../../domain/offline";
import { getLanguage, languageNames, numberLocale, t, type Language } from "../../i18n";
import { localizeCatalog } from "../../i18n/catalog";
import { DetailSheet } from "../../components/DetailSheet";
import { cancelOffline, downloadOffline, nativeDownloads, offlineErrorText, offlineSnapshot, prepareOffline, useOfflineState } from "../../platform/offlineStore";
import { OfflinePackageCard, type OfflineCardState } from "./OfflinePackageCard";

export interface OfflineContext { id: string; title: string; language: Language; placeIds: PlaceId[]; catalog: DemoCatalog; route?: WalkingRoute }
const mb = (bytes: number) => Math.ceil(bytes / 1_000_000).toLocaleString(numberLocale());
export const downloadedDescription = (pack: OfflinePackage) => {
  const count = pack.catalog.places.filter(place => pack.placeIds.includes(place.id) && (place.audioTracks?.[pack.language] || (pack.language === "ru" && place.audioUrl))).length;
  return t("{0} · {1} МБ. Карта и фотографии сохранены. Аудиозаписей: {2} из {3}.", {0: languageNames[pack.language], 1: mb(pack.bytes), 2: count, 3: pack.placeIds.length});
};
const packageTitle = (pack: OfflinePackage) => {
  const catalog = localizeCatalog(pack.catalog, getLanguage());
  return (pack.placeIds.length === 1 ? catalog.places.find(place => place.id === pack.placeIds[0])?.title : catalog.routes.find(route => route.placeIds?.join(",") === pack.placeIds.join(","))?.title) ?? pack.title;
};

export function OfflineDownloadSheet({ context, onClose, onOpen, onRemove }: { context: OfflineContext; onClose: () => void; onOpen: (pack: OfflinePackage) => void; onRemove: (pack: OfflinePackage) => Promise<void> }) {
  const download = useOfflineState();
  const [prepared, setPrepared] = useState<{ plan: OfflinePlan; upperBytes: number; enoughSpace: boolean }>();
  const [error, setError] = useState(""), [attempt, setAttempt] = useState(0), [removing, setRemoving] = useState(false);
  const id = context.id + "-" + context.language;
  const saved = download.packages.find(pack => pack.id === id);
  const narrationCount = context.catalog.places.filter(place => context.placeIds.includes(place.id) && (place.audioTracks?.[context.language] || (context.language === "ru" && place.audioUrl))).length;
  const transfer = download.transfer?.id === id ? download.transfer : undefined;
  useEffect(() => {
    if (!nativeDownloads || saved || (offlineSnapshot().transfer?.id === id && offlineSnapshot().transfer?.phase === "downloading")) return;
    let active = true;
    setError(""); setPrepared(undefined);
    prepareOffline(context).then(value => { if (active) setPrepared(value); }).catch((failure: { code?: string }) => { if (active && failure.code !== "OFFLINE_CANCELLED") setError(offlineErrorText(failure.code ?? "")); });
    return () => { active = false; if (offlineSnapshot().transfer?.phase === "preparing") void cancelOffline().catch(() => {}); };
  }, [context, attempt]);
  const state: OfflineCardState = !nativeDownloads ? "BrowserDisabled" : saved ? "Saved" : error || (prepared && !prepared.enoughSpace) ? "Error" : transfer?.phase === "downloading" ? "Downloading" : !prepared ? "Preparing" : "Available";
  let body = t("Проверяем состав пакета и свободное место на iPhone.");
  if (!nativeDownloads) body = t("Скачивание доступно в установленном приложении iPhone.");
  else if (saved) body = downloadedDescription(saved);
  else if (error) body = t(error);
  else if (transfer?.phase === "downloading") body = t("Сохранено {0} из {1} файлов · {2} МБ. Держи приложение открытым.", {0: transfer.completed, 1: transfer.total, 2: mb(transfer.bytes)});
  else if (prepared) body = t(prepared.enoughSpace ? "{0}. Аудиозаписей: {2} из {3}. Пакет до {1} МБ: карта, фото и описание. Нужен запас 200 МБ свободного места." : "Недостаточно свободного места. Для пакета нужно до {1} МБ и ещё 200 МБ запаса.", {0: languageNames[context.language], 1: mb(prepared.upperBytes), 2: narrationCount, 3: context.placeIds.length});
  async function action() {
    try {
      if (saved) { setRemoving(true); await onRemove(saved); onClose(); }
      else if (transfer?.phase === "downloading") { await cancelOffline(); onClose(); }
      else if (error || (prepared && !prepared.enoughSpace)) setAttempt(value => value + 1);
      else if (prepared) await downloadOffline(prepared.plan);
    } catch (failure) { setError(offlineErrorText((failure as {code?: string}).code ?? "")); }
    finally { setRemoving(false); }
  }
  return <DetailSheet title={t("Офлайн")} onClose={onClose} className="offline-download-sheet">
    <OfflinePackageCard title={context.title} state={state} body={body} progress={transfer} disabled={removing} onAction={() => { void action(); }} onOpen={saved ? () => onOpen(saved) : undefined} />
  </DetailSheet>;
}

export function OfflineSavedPackages({ onOpen, onRemove, onChoose }: { onOpen: (pack: OfflinePackage) => void; onRemove: (pack: OfflinePackage) => Promise<void>; onChoose: () => void }) {
  const state = useOfflineState();
  const [error, setError] = useState(""), [removing, setRemoving] = useState("");
  if (!nativeDownloads) return <OfflinePackageCard title={t("Офлайн-маршруты")} state="BrowserDisabled" body={t("Скачивание доступно в установленном приложении iPhone.")} />;
  return <div className="offline-package-list">
    {state.transfer?.phase === "downloading" && <OfflinePackageCard title={t("Офлайн-пакет")} state="Downloading" body={t("Сохранено {0} из {1} файлов · {2} МБ. Держи приложение открытым.", {0: state.transfer.completed, 1: state.transfer.total, 2: mb(state.transfer.bytes)})} progress={state.transfer} onAction={() => { void cancelOffline().catch(() => setError("Не удалось отменить загрузку.")); }} />}
    {!state.packages.length && !state.transfer && <><p>{t("Скачанных маршрутов пока нет.")}</p><button className="sheet-option" type="button" onClick={onChoose}>{t("Выбрать маршрут")}</button></>}
    {state.packages.map(pack => <OfflinePackageCard key={pack.id} title={packageTitle(pack)} state="Saved" body={downloadedDescription(pack)} disabled={!!removing || !!state.transfer} onOpen={() => onOpen(pack)} onAction={() => { setRemoving(pack.id); void onRemove(pack).catch(failure => setError(offlineErrorText((failure as {code?:string}).code ?? ""))).finally(() => setRemoving("")); }} />)}
    {error && <p role="alert">{t(error)}</p>}
  </div>;
}
