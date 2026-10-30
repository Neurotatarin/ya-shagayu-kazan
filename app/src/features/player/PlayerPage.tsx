import { t, numberLocale } from "../../i18n";
import { useEffect, useState, type CSSProperties } from "react";
import { OriginalAsset } from "../../components/OriginalAsset";
import type { Place, ShowNotice } from "../../domain/demo";
import { seekAudio, setAudioSpeed, toggleAudio, setBackgroundEnabled, useAudioPlayback } from "../../platform/audioPlayback";
import { PlacePhoto } from "../../components/PlacePhoto";
import { PhotoGallery } from "./PhotoGallery";

const time = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;

export function PlayerPage({ place, position, onPosition, onBack, onMap, onMore, notice }: { place: Place; position: number; onPosition: (seconds: number) => void; onBack: () => void; onMap: () => void; onMore: () => void; notice: ShowNotice }) {
  const playback = useAudioPlayback();
  const [selectedSpeed, setSpeed] = useState(1);
  const available = !!place.audioUrl;
  const active = playback.placeId === place.id && playback.language === place.audioLanguage && available;
  const currentPosition = Math.min(active ? playback.position : position, active && playback.duration ? playback.duration : place.durationSeconds);
  const speed = active ? playback.speed : selectedSpeed;
  const duration = active && playback.duration ? playback.duration : place.durationSeconds;
  const seek = (seconds: number) => { if (active) seekAudio(seconds); onPosition(seconds); };
  useEffect(() => { if (active && Math.abs(playback.position - position) >= 5) onPosition(playback.position); }, [active, Math.floor(playback.position / 5)]);
  useEffect(() => { if (playback.error && active) notice(playback.error); }, [playback.error, active]);
  useEffect(() => { if (playback.backgroundError) notice(playback.backgroundError); }, [playback.backgroundError]);
  return <main className={`player-page ${available ? "" : "audio-unavailable"}`} data-figma-node="6:1166">
    <header className="player-header"><button type="button" className="round-action" aria-label={t("Назад к месту")} onClick={onBack}><OriginalAsset asset="player.imgArrowLeft" /></button><p>{t(available ? "СЕЙЧАС ЗВУЧИТ" : "АУДИОИСТОРИЯ")}</p><button type="button" className="round-action" aria-label={t("Действия с историей")} onClick={onMore}><OriginalAsset asset="player.imgDotsThree" /></button></header>
    <PhotoGallery place={place}>
      <PlacePhoto place={place} className="cover-photo" />
      <span className="cover-color" /><p>{t("У каждого")}<br />{t("дома —")}<br />{t("свой голос.")}</p>
      <div className="cover-zilant-window"><OriginalAsset asset="player.imgZilantListenPng" /></div>
    </PhotoGallery>
    <div className="player-caption"><h1>{place.title}</h1><p id="audio-availability" aria-live="polite">{!available ? t("Аудио на этом языке готовится") : active && playback.loading ? t("Загружаем запись…") : t("Зилант рассказывает · Казань")}</p></div>
    <div className="player-progress">
      <input aria-label={t("Позиция аудиоистории")} type="range" disabled={!available} min="0" max={duration || 1} step="1" value={available ? currentPosition : 0} onChange={event => seek(Number(event.target.value))} style={{ "--progress": `${duration ? 100 * currentPosition / duration : 0}%` } as CSSProperties} />
      <div className="player-times" dir="ltr"><span>{available ? time(currentPosition) : "0:00"}</span><span>{available ? time(Math.round(duration)) : "—:—"}</span></div>
    </div>
    <div className="playback-controls">
      <button className="round-action skip-action" type="button" disabled={!available} aria-label={t("Назад на 15 секунд")} onClick={() => seek(Math.max(0, currentPosition - 15))}><OriginalAsset asset="player.imgArrowLeft1" /></button>
      <button className="round-action play-action" type="button" disabled={!available} aria-describedby={!available ? "audio-availability" : undefined} aria-busy={active && playback.loading} aria-label={active && playback.playing ? t("Пауза") : t("Воспроизвести историю")} onClick={async () => { try { if (!await toggleAudio(place, position, speed)) notice(t("Готовая аудиозапись ещё не добавлена.")); } catch { notice(t("Не удалось начать воспроизведение. Попробуй ещё раз.")); } }}>{active && playback.playing ? <OriginalAsset asset="player.imgPause" /> : <OriginalAsset asset={available ? "place.imgPlay" : "map.imgPlay"} />}</button>
      <button className="round-action skip-action" type="button" disabled={!available} aria-label={t("Вперёд на 15 секунд")} onClick={() => seek(Math.min(duration, currentPosition + 15))}><OriginalAsset asset="player.imgArrowRight" /></button>
    </div>
    <div className="player-extra-actions">
      <button type="button" onClick={() => notice(t("Скачивание карты и материалов маршрута будет подключено отдельно."))}><OriginalAsset asset="player.imgCloudArrowDown" /><span>{t("Офлайн")}</span></button>
      <button className="playback-speed" type="button" disabled={!available} aria-label={t("Скорость воспроизведения {0}", {0: speed})} onClick={() => { const next = speed === 2 ? 1 : speed + .25; setSpeed(next); if (active) setAudioSpeed(next); }}><span dir="ltr">{speed.toLocaleString(numberLocale())}×</span></button>
      <button className="background-toggle" type="button" aria-label={t("Музыкальный фон")} aria-pressed={playback.backgroundEnabled && available} onClick={() => { if (!available) return notice(t("Аудио на этом языке готовится")); void setBackgroundEnabled(!playback.backgroundEnabled); }}><OriginalAsset asset="map.imgHeadphones" /><span>{t("Фон")}</span></button>
      <button type="button" onClick={onMap}><OriginalAsset asset="player.imgMapTrifold" /><span>{t("Карта")}</span></button>
    </div>
  </main>;
}
