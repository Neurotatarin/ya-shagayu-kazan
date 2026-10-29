import { OriginalAsset } from "../../components/OriginalAsset";
import type { Place } from "../../domain/demo";

export function PlacePage({ place, favorite, onFavorite, onBack, onListen }: { place: Place; favorite: boolean; onFavorite: () => void; onBack: () => void; onListen: () => void }) {
  return <main className="place-page" data-figma-node="6:1101">
    <div className="place-hero"><OriginalAsset asset={place.photo} alt={place.title} /><div className="native-status-background" />
      <div className="place-top-actions">
        <button className="round-action white-action" type="button" aria-label="Назад к карте" onClick={onBack}><OriginalAsset asset="place.imgArrowLeft" /></button>
        <button className="round-action white-action" type="button" aria-label={favorite ? "Убрать из избранного" : "Добавить в избранное"} aria-pressed={favorite} onClick={onFavorite}><span className={favorite ? "" : "unselected-bookmark"}><OriginalAsset asset="place.imgBookmarkSimple" /></span></button>
      </div>
    </div>
    <section className="place-sheet" aria-labelledby="place-title">
      <span className="sheet-handle" aria-hidden="true" />
      <p className="place-eyebrow">{place.eyebrow}</p>
      <h1 id="place-title">{place.title}</h1>
      <div className="place-address"><OriginalAsset asset="place.imgMapPin" /><span>{place.address ?? "Казанский Кремль"}</span></div>
      <p className="place-description">{place.description}</p>
      <aside className="zilant-place-tip">
        <div className="tip-portrait"><OriginalAsset asset="place.imgZilantThinkPng" /></div>
        <div><p>Посмотри на окна.</p><small>Замечаешь, какие они разные?</small></div>
      </aside>
      <p className="audio-eyebrow">АУДИОИСТОРИЯ</p>
      <button className="primary-action listen-story" type="button" onClick={onListen}><OriginalAsset asset="place.imgPlay" /><span>Слушать историю · {Math.floor(place.durationSeconds / 60)}:{String(place.durationSeconds % 60).padStart(2, "0")}</span></button>
    </section>
  </main>;
}
