import { t } from "../../i18n";
import { OriginalAsset } from "../../components/OriginalAsset";
import type { Place } from "../../domain/demo";
import { hasPlacePhoto, PhotoCredit, PlacePhoto } from "../../components/PlacePhoto";

export function PlacePage({ place, favorite, visited, onVisit, onFavorite, onBack, onListen }: { place: Place; favorite: boolean; visited: boolean; onVisit: () => void; onFavorite: () => void; onBack: () => void; onListen: () => void }) {
  return <main className="place-page" data-figma-node="6:1101">
    <div className="place-hero">{hasPlacePhoto(place) ? <PlacePhoto place={place} /> : <div className="photo-pending">{t("Фотография места скоро появится")}</div>}<div className="native-status-background" />
      {place.image && <PhotoCredit image={place.image} className="place-photo-credit" />}
      <div className="place-top-actions">
        <button className="round-action white-action" type="button" aria-label={t("Назад к карте")} onClick={onBack}><OriginalAsset asset="place.imgArrowLeft" /></button>
        <button className="round-action white-action" type="button" aria-label={favorite ? t("Убрать из избранного") : t("Добавить в избранное")} aria-pressed={favorite} onClick={onFavorite}><span className={favorite ? "" : "unselected-bookmark"}><OriginalAsset asset="place.imgBookmarkSimple" /></span></button>
      </div>
    </div>
    <section className="place-sheet" aria-labelledby="place-title">
      <span className="sheet-handle" aria-hidden="true" />
      <p className="place-eyebrow">{place.eyebrow}</p>
      <h1 id="place-title">{place.title}</h1>
      <div className="place-address"><OriginalAsset asset="place.imgMapPin" /><span>{place.address ?? t("Казанский Кремль")}</span></div>
      <p className="place-description">{place.description}</p>
      <aside className="zilant-place-tip">
        <div className="tip-portrait"><OriginalAsset asset="place.imgZilantThinkPng" /></div>
        <div><p>{place.id === "ushkova" ? t("Посмотри на окна.") : t("У каждого места — своя история.")}</p><small>{place.id === "ushkova" ? t("Замечаешь, какие они разные?") : t("Спроси меня о нём в чате.")}</small></div>
      </aside>
      <p className="audio-eyebrow">{t("АУДИОИСТОРИЯ")}</p>
      <button className={`primary-action listen-story ${place.audioUrl ? "" : "audio-pending"}`} type="button" onClick={onListen}>{place.audioUrl ? <><OriginalAsset asset="place.imgPlay" /><span>{t("Слушать историю · {0}:{1}", {0: Math.floor(place.durationSeconds / 60), 1: String(Math.round(place.durationSeconds) % 60).padStart(2, "0")})}</span></> : <><span>{t("Открыть фотогалерею")}</span><OriginalAsset asset="profile.imgArrowRight" /></>}</button>
      {!place.audioUrl && <p className="audio-availability-note">{t("Аудио на этом языке готовится")}</p>}
      <button className="visit-place" type="button" aria-pressed={visited} onClick={onVisit}><OriginalAsset asset="place.imgMapPin" />{visited ? t("Посещение отмечено") : t("Я здесь")}</button>
    </section>
  </main>;
}
