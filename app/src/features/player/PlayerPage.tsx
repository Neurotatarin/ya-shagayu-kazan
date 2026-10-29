import { useState, type CSSProperties } from "react";
import { OriginalAsset } from "../../components/OriginalAsset";
import type { Place, ShowNotice } from "../../domain/demo";

const time = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;

export function PlayerPage({ place, position, onPosition, onBack, onMap, onMore, notice }: { place: Place; position: number; onPosition: (seconds: number) => void; onBack: () => void; onMap: () => void; onMore: () => void; notice: ShowNotice }) {
  const [paused, setPaused] = useState(false);
  const [speed, setSpeed] = useState(1);
  return <main className="player-page" data-figma-node="6:1166">
    <header className="player-header"><button type="button" className="round-action" aria-label="Назад к месту" onClick={onBack}><OriginalAsset asset="player.imgArrowLeft" /></button><p>СЕЙЧАС ЗВУЧИТ</p><button type="button" className="round-action" aria-label="Действия с историей" onClick={onMore}><OriginalAsset asset="player.imgDotsThree" /></button></header>
    <section className="audio-cover" aria-label="Обложка истории">
      <OriginalAsset asset={place.photo} className="cover-photo" />
      <span className="cover-color" /><p>У каждого<br />дома —<br />свой голос.</p>
      <div className="cover-zilant-window"><OriginalAsset asset="player.imgZilantListenPng" /></div>
      <span className="cover-chapter">01 / 05</span>
    </section>
    <div className="player-caption"><h1>{place.title}</h1><p>Зилант рассказывает · Казань</p></div>
    <div className="player-progress">
      <input aria-label="Позиция аудиоистории" type="range" min="0" max={place.durationSeconds} step="1" value={position} onChange={event => onPosition(Number(event.target.value))} style={{ "--progress": `${100 * position / place.durationSeconds}%` } as CSSProperties} />
      <div className="player-times"><span>{time(position)}</span><span>{time(place.durationSeconds)}</span></div>
    </div>
    <div className="playback-controls">
      <button className="round-action skip-action" type="button" aria-label="Назад на 15 секунд" onClick={() => onPosition(Math.max(0, position - 15))}><OriginalAsset asset="player.imgArrowLeft1" /></button>
      <button className="round-action play-action" type="button" aria-label={paused ? "Воспроизвести историю" : "Пауза"} onClick={() => { if (!paused) setPaused(true); else notice("Готовая аудиозапись ещё не добавлена. Сейчас открыт макет плеера."); }}>{paused ? <OriginalAsset asset="place.imgPlay" /> : <OriginalAsset asset="player.imgPause" />}</button>
      <button className="round-action skip-action" type="button" aria-label="Вперёд на 15 секунд" onClick={() => onPosition(Math.min(place.durationSeconds, position + 15))}><OriginalAsset asset="player.imgArrowRight" /></button>
    </div>
    <div className="player-extra-actions">
      <button type="button" onClick={() => notice("Скачивание карты и материалов маршрута будет подключено отдельно.")}><OriginalAsset asset="player.imgCloudArrowDown" /><span>Офлайн</span></button>
      <button className="playback-speed" type="button" aria-label={`Скорость воспроизведения ${speed}`} onClick={() => setSpeed(value => value === 2 ? 1 : value + .25)}>{speed.toLocaleString("ru-RU")}×</button>
      <button type="button" onClick={onMap}><OriginalAsset asset="player.imgMapTrifold" /><span>Карта</span></button>
    </div>
  </main>;
}
