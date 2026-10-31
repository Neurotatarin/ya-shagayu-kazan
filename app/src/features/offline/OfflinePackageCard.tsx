import { OriginalAsset } from "../../components/OriginalAsset";
import { t } from "../../i18n";

export type OfflineCardState = "Available" | "Preparing" | "Downloading" | "Saved" | "Error" | "BrowserDisabled";
const labels = { Available: "Готов к скачиванию", Preparing: "Подготовка", Downloading: "Скачиваем", Saved: "Скачано", Error: "Загрузка не завершена", BrowserDisabled: "Офлайн на iPhone" };
const actions = { Available: "Скачать на iPhone", Preparing: "Подготавливаем…", Downloading: "Отменить загрузку", Saved: "Удалить с iPhone", Error: "Повторить", BrowserDisabled: "Недоступно в браузере" };
export function OfflinePackageCard({ title, state, body, rows, actionLabel, secondaryLabel, onSecondary, progress, disabled, onAction, onOpen }: { title: string; state: OfflineCardState; body: string; rows?: string[]; actionLabel?: string; secondaryLabel?: string; onSecondary?: () => void; progress?: { completed: number; total: number }; disabled?: boolean; onAction?: () => void; onOpen?: () => void }) {
  const header = <><span className="offline-card-icon"><OriginalAsset asset="offline.imgCloudArrowDown" /></span><span>{title}</span></>;
  return <section className="offline-package-card" data-state={state} data-figma-node={secondaryLabel ? actionLabel === "Удалить карту" ? "2040:8129" : "2040:8115" : rows?.length ? "2040:8087" : "2037:8075"}>
    {onOpen ? <button className="offline-card-heading" type="button" onClick={onOpen} aria-label={t("Открыть скачанное: {0}", {0: title})}>{header}</button> : <div className="offline-card-heading">{header}</div>}
    <p className="offline-card-status" aria-live="polite">{t(labels[state])}</p>
    <p className="offline-card-body">{body}</p>
    {rows?.map((row, index) => <p className="offline-card-body" key={index}>{row}</p>)}
    {state === "Downloading" && progress && <div className="offline-card-progress" role="progressbar" aria-label={t("Загрузка офлайн-пакета")} aria-valuemin={0} aria-valuemax={progress.total || 1} aria-valuenow={progress.completed}><span style={{ width: `${progress.total ? 100 * progress.completed / progress.total : 0}%` }} /></div>}
    <button className="offline-card-action" type="button" disabled={disabled || state === "Preparing" || state === "BrowserDisabled"} onClick={onAction}>{t(actionLabel ?? actions[state])}</button>
    {secondaryLabel && <button className="offline-card-action offline-card-secondary" type="button" disabled={disabled} onClick={onSecondary}>{t(secondaryLabel)}</button>}
  </section>;
}
