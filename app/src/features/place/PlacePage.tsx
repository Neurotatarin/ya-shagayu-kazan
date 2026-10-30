import { OriginalAsset } from "../../components/OriginalAsset";
import type { Place } from "../../domain/demo";
import { hasPlacePhoto, PhotoCredit, PlacePhoto } from "../../components/PlacePhoto";

export function PlacePage({ place, favorite, visited, onVisit, onFavorite, onBack, onListen }: { place: Place; favorite: boolean; visited: boolean; onVisit: () => void; onFavorite: () => void; onBack: () => void; onListen: () => void }) {
  return <main className="place-page" data-figma-node="6:1101">
    <div className="place-hero">{hasPlacePhoto(place) ? <PlacePhoto place={place} /> : <div className="photo-pending">Фотография места скоро появится</div>}<div className="native-status-background" />
      {place.image && <PhotoCredit image={place.image} className="place-photo-credit" />}
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
        <div><p>{place.id === "ushkova" ? "Посмотри на окна." : "У каждого места — своя история."}</p><small>{place.id === "ushkova" ? "Замечаешь, какие они разные?" : "Спроси меня о нём в чате."}</small></div>
      </aside>
      <p className="audio-eyebrow">АУДИОИСТОРИЯ</p>
      <button className="primary-action listen-story" type="button" onClick={onListen}><OriginalAsset asset="place.imgPlay" /><span>{place.audioUrl ? `Слушать историю · ${Math.floor(place.durationSeconds / 60)}:${String(place.durationSeconds % 60).padStart(2, "0")}` : "Аудио скоро · открыть плеер"}</span></button>
      <button className="visit-place" type="button" aria-pressed={visited} onClick={onVisit}><OriginalAsset asset="place.imgMapPin" />{visited ? "Посещение отмечено" : "Я здесь"}</button>
    </section>
  </main>;
}
