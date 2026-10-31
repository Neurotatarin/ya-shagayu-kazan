import { useEffect, useState } from "react";
import type { DemoCatalog, PlaceId, WalkingRoute } from "../../domain/demo";
import type { OfflinePackage } from "../../domain/offline";
import { offlineCity } from "../../data/offlineCity";
import { getLanguage, languageNames, numberLocale, t, type Language } from "../../i18n";
import { localizeCatalog } from "../../i18n/catalog";
import { DetailSheet } from "../../components/DetailSheet";
import { cancelOffline, downloadOffline, nativeDownloads, offlineContextID, offlineErrorText, offlineSnapshot, prepareOffline, useOfflineState } from "../../platform/offlineStore";
import { OfflinePackageCard, type OfflineCardState } from "./OfflinePackageCard";

export interface OfflineContext { id: string; title: string; language: Language; placeIds: PlaceId[]; catalog: DemoCatalog; route?: WalkingRoute; cityOnly?: boolean }
const mb = (bytes: number) => Math.ceil(bytes / 1_000_000).toLocaleString(numberLocale());
export const downloadedDescription = (pack: OfflinePackage) => {
  if (pack.kind === "city-map") return t("{0} МБ · весь город, улицы и метки. Общая карта для всех языков. Экскурсии скачиваются отдельно.", {0: mb(pack.bytes)});
  const count = pack.catalog.places.filter(place => pack.placeIds.includes(place.id) && (place.audioTracks?.[pack.language] || (pack.language === "ru" && place.audioUrl))).length;
  return t("{0} · {1} МБ. Фотографии и описание сохранены. Аудиозаписей: {2} из {3}.", {0: languageNames[pack.language], 1: mb(pack.bytes), 2: count, 3: pack.placeIds.length});
};
const packageTitle = (pack: OfflinePackage) => {
  if (pack.kind === "city-map") return t("Карта Казани");
  const catalog = localizeCatalog(pack.catalog, getLanguage());
  return (pack.placeIds.length === 1 ? catalog.places.find(place => place.id === pack.placeIds[0])?.title : catalog.routes.find(route => route.placeIds?.join(",") === pack.placeIds.join(","))?.title) ?? pack.title;
};

export function OfflineDownloadSheet({ context, onClose, onOpen, onRemove }: { context: OfflineContext; onClose: () => void; onOpen: (pack: OfflinePackage) => void; onRemove: (pack: OfflinePackage) => Promise<void> }) {
  const download = useOfflineState();
  const [prepared, setPrepared] = useState<Awaited<ReturnType<typeof prepareOffline>>>();
  const [error, setError] = useState(""), [attempt, setAttempt] = useState(0), [removing, setRemoving] = useState(false);
  const id = offlineContextID(context);
  const saved = download.packages.find(pack => pack.id === id);
  const city = download.packages.find(pack => pack.id === offlineCity.id);
  // Old area packages can acquire the city map without losing their recordings.
  const complete = !context.cityOnly && saved && city;
  const transfer = download.transfer?.id === id ? download.transfer : undefined;
  useEffect(() => {
    if (!nativeDownloads || complete || (offlineSnapshot().transfer?.id === id && offlineSnapshot().transfer?.phase === "downloading")) return;
    let active = true;
    setError(""); setPrepared(undefined);
    prepareOffline(context).then(value => { if (active) setPrepared(value); }).catch((failure: { code?: string }) => { if (active && failure.code !== "OFFLINE_CANCELLED") setError(offlineErrorText(failure.code ?? "")); });
    return () => { active = false; if (offlineSnapshot().transfer?.phase === "preparing") void cancelOffline().catch(() => {}); };
  }, [context, attempt]);
  const state: OfflineCardState = !nativeDownloads ? "BrowserDisabled" : complete ? "Saved" : error || (prepared && !prepared.enoughSpace) ? "Error" : transfer?.phase === "downloading" ? "Downloading" : !prepared ? "Preparing" : "Available";
  let body = t("Проверяем состав пакета и свободное место на iPhone.");
  let rows: string[] | undefined;
  if (!nativeDownloads) body = t("Скачивание доступно в установленном приложении iPhone.");
  else if (complete) body = downloadedDescription(saved!);
  else if (error) body = t(error);
  else if (transfer?.phase === "downloading") body = t("Сохранено {0} из {1} файлов · {2} МБ. Держи приложение открытым.", {0: transfer.completed, 1: transfer.total, 2: mb(transfer.bytes)});
  else if (prepared) {
    body = prepared.enoughSpace ? t(context.cityOnly ? "Сохраним карту всего города. Аудио и фотографии экскурсий скачиваются отдельно." : "Общая карта сохраняется один раз для всех экскурсий и языков.") : t("Недостаточно свободного места. Для пакета нужно до {1} МБ и ещё 200 МБ запаса.", {1: mb(prepared.upperBytes)});
    rows = [prepared.mapBytes ? t(prepared.mapApproximate ? "Карта Казани · около {0} МБ" : "Карта Казани · до {0} МБ", {0: mb(prepared.mapBytes)}) : t("Карта Казани · уже на iPhone")];
    if (!context.cityOnly) rows.push(t("Аудио, фото и описание · {0} МБ", {0: mb(prepared.contentBytes)}));
    rows.push(t(prepared.mapApproximate ? "К загрузке · около {0} МБ. Нужен запас 200 МБ." : "К загрузке · до {0} МБ. Нужен запас 200 МБ.", {0: mb(prepared.downloadBytes)}));
  }
  async function action() {
    try {
      if (complete) { setRemoving(true); await onRemove(saved!); onClose(); }
      else if (transfer?.phase === "downloading") { await cancelOffline(); onClose(); }
      else if (error || (prepared && !prepared.enoughSpace)) setAttempt(value => value + 1);
      else if (prepared) { await downloadOffline(prepared.plan, prepared.cityPlan); if (context.cityOnly) onClose(); }
    } catch (failure) { setPrepared(undefined); setError(offlineErrorText((failure as {code?: string}).code ?? "")); }
    finally { setRemoving(false); }
  }
  return <DetailSheet title={t("Офлайн")} onClose={onClose} className="offline-download-sheet">
    <OfflinePackageCard title={context.title} state={state} body={body} rows={rows} disabled={removing} progress={transfer} onAction={() => { void action(); }} onOpen={complete ? () => onOpen(saved!) : undefined} />
  </DetailSheet>;
}

export function OfflineSavedPackages({ onOpen, onRemove, onChoose, onCity }: { onOpen: (pack: OfflinePackage) => void; onRemove: (pack: OfflinePackage) => Promise<void>; onChoose: () => void; onCity: () => void }) {
  const state = useOfflineState();
  const [error, setError] = useState(""), [removing, setRemoving] = useState(""), [confirmCity, setConfirmCity] = useState(false);
  if (!nativeDownloads) return <OfflinePackageCard title={t("Офлайн-маршруты")} state="BrowserDisabled" body={t("Скачивание доступно в установленном приложении iPhone.")} />;
  const city = state.packages.find(pack => pack.id === offlineCity.id), content = state.packages.filter(pack => pack.kind !== "city-map");
  const busy = !!removing || !!state.transfer;
  const remove = (pack: OfflinePackage) => { setRemoving(pack.id); void onRemove(pack).then(() => setConfirmCity(false)).catch(failure => setError(offlineErrorText((failure as {code?:string}).code ?? ""))).finally(() => setRemoving("")); };
  return <div className="offline-package-list">
    {state.transfer?.phase === "downloading" && <OfflinePackageCard title={t("Офлайн-пакет")} state="Downloading" body={t("Сохранено {0} из {1} файлов · {2} МБ. Держи приложение открытым.", {0: state.transfer.completed, 1: state.transfer.total, 2: mb(state.transfer.bytes)})} progress={state.transfer} onAction={() => { void cancelOffline().catch(() => setError("Не удалось отменить загрузку.")); }} />}
    <OfflinePackageCard title={t(confirmCity ? "Удалить карту Казани?" : "Карта Казани")} state={city ? "Saved" : "Available"} body={t(confirmCity ? "Аудио, фотографии и описания сохранятся. Для просмотра общей карты без интернета потребуется скачать её снова." : city ? "Весь город, улицы и метки. Общая карта для всех языков. Экскурсии скачиваются отдельно." : "Карта всего города пока не скачана. Сохрани её отдельно или вместе с первой экскурсией.")} rows={city && !confirmCity ? [t("На iPhone · {0} МБ", {0: mb(city.bytes)})] : undefined} disabled={busy} actionLabel={confirmCity ? "Удалить карту" : city ? "Проверить обновление" : "Скачать карту Казани"} onAction={() => confirmCity && city ? remove(city) : onCity()} onOpen={city && !confirmCity ? () => onOpen(city) : undefined} secondaryLabel={city ? confirmCity ? "Оставить карту" : "Удалить карту" : undefined} onSecondary={() => setConfirmCity(value => !value)} />
    {!content.length && !state.transfer && <><p>{t("Скачанных маршрутов пока нет.")}</p><button className="sheet-option" type="button" onClick={onChoose}>{t("Выбрать маршрут")}</button></>}
    {content.map(pack => <OfflinePackageCard key={pack.id} title={packageTitle(pack)} state="Saved" body={downloadedDescription(pack) + (city ? "" : " " + t("Общая карта Казани пока не скачана."))} disabled={busy} onOpen={() => onOpen(pack)} onAction={() => remove(pack)} />)}
    {error && <p role="alert">{t(error)}</p>}
  </div>;
}
