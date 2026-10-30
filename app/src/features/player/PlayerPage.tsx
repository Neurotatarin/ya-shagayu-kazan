import { useEffect, useState, type CSSProperties } from "react";
import { OriginalAsset } from "../../components/OriginalAsset";
import type { Place, ShowNotice } from "../../domain/demo";
import { seekAudio, setAudioSpeed, toggleAudio, useAudioPlayback } from "../../platform/audioPlayback";

const time = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;

export function PlayerPage({ place, position, onPosition, onBack, onMap, onMore, notice }: { place: Place; position: number; onPosition: (seconds: number) => void; onBack: () => void; onMap: () => void; onMore: () => void; notice: ShowNotice }) {
  const playback = useAudioPlayback();
  const [selectedSpeed, setSpeed] = useState(1);
  const active = playback.placeId === place.id && !!place.audioUrl;
  const currentPosition = Math.min(active ? playback.position : position, active && playback.duration ? playback.duration : place.durationSeconds);
  const speed = active ? playback.speed : selectedSpeed;
  const duration = active && playback.duration ? playback.duration : place.durationSeconds;
  const seek = (seconds: number) => { if (active) seekAudio(seconds); onPosition(seconds); };
  useEffect(() => { if (active && Math.abs(playback.position - position) >= 5) onPosition(playback.position); }, [active, Math.floor(playback.position / 5)]);
  useEffect(() => { if (playback.error && active) notice(playback.error); }, [playback.error, active]);
  return <main className="player-page" data-figma-node="6:1166">
    <header className="player-header"><button type="button" className="round-action" aria-label="Назад к месту" onClick={onBack}><OriginalAsset asset="player.imgArrowLeft" /></button><p>СЕЙЧАС ЗВУЧИТ</p><button type="button" className="round-action" aria-label="Действия с историей" onClick={onMore}><OriginalAsset asset="player.imgDotsThree" /></button></header>
    <section className="audio-cover" aria-label="Обложка истории">
      {place.photo && <OriginalAsset asset={place.photo} className="cover-photo" />}
      <span className="cover-color" /><p>У каждого<br />дома —<br />свой голос.</p>
      <div className="cover-zilant-window"><OriginalAsset asset="player.imgZilantListenPng" /></div>
      <span className="cover-chapter">01 / 05</span>
    </section>
    <div className="player-caption"><h1>{place.title}</h1><p aria-live="polite">{active && playback.loading ? "Загружаем запись…" : "Зилант рассказывает · Казань"}</p></div>
    <div className="player-progress">
      <input aria-label="Позиция аудиоистории" type="range" min="0" max={duration || 1} step="1" value={currentPosition} onChange={event => seek(Number(event.target.value))} style={{ "--progress": `${duration ? 100 * currentPosition / duration : 0}%` } as CSSProperties} />
      <div className="player-times"><span>{time(currentPosition)}</span><span>{time(Math.round(duration))}</span></div>
    </div>
    <div className="playback-controls">
      <button className="round-action skip-action" type="button" aria-label="Назад на 15 секунд" onClick={() => seek(Math.max(0, currentPosition - 15))}><OriginalAsset asset="player.imgArrowLeft1" /></button>
      <button className="round-action play-action" type="button" aria-busy={active && playback.loading} aria-label={active && playback.playing ? "Пауза" : "Воспроизвести историю"} onClick={async () => { try { if (!await toggleAudio(place, position, speed)) notice("Готовая аудиозапись ещё не добавлена."); } catch { notice("Не удалось начать воспроизведение. Попробуй ещё раз."); } }}>{active && playback.playing ? <OriginalAsset asset="player.imgPause" /> : <OriginalAsset asset="place.imgPlay" />}</button>
      <button className="round-action skip-action" type="button" aria-label="Вперёд на 15 секунд" onClick={() => seek(Math.min(duration, currentPosition + 15))}><OriginalAsset asset="player.imgArrowRight" /></button>
    </div>
    <div className="player-extra-actions">
      <button type="button" onClick={() => notice("Скачивание карты и материалов маршрута будет подключено отдельно.")}><OriginalAsset asset="player.imgCloudArrowDown" /><span>Офлайн</span></button>
      <button className="playback-speed" type="button" aria-label={`Скорость воспроизведения ${speed}`} onClick={() => { const next = speed === 2 ? 1 : speed + .25; setSpeed(next); if (active) setAudioSpeed(next); }}>{speed.toLocaleString("ru-RU")}×</button>
      <button type="button" onClick={onMap}><OriginalAsset asset="player.imgMapTrifold" /><span>Карта</span></button>
    </div>
  </main>;
}
