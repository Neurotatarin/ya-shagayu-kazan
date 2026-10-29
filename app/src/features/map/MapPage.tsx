import { useEffect, useRef, useState } from "react";
import { OriginalAsset } from "../../components/OriginalAsset";
import type { Place, PlaceId, ShowNotice } from "../../domain/demo";

export function MapPage({ places, selected, onOpen, onListen, onFilters, notice }: { places: readonly Place[]; selected: PlaceId; onOpen: (id: PlaceId) => void; onListen: (id: PlaceId) => void; onFilters: () => void; notice: ShowNotice }) {
  const area = useRef<HTMLDivElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const [scale, setScale] = useState(1);
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [audioOnly, setAudioOnly] = useState(false);
  const place = places.find(p => p.id === selected) ?? places[1]!;
  const results = audioOnly ? [] : places.filter(p => `${p.title} ${p.address ?? ""}`.toLocaleLowerCase("ru-RU").includes(query.trim().toLocaleLowerCase("ru-RU")));
  useEffect(() => { const observer = new ResizeObserver(([entry]) => setScale(Math.max(entry!.contentRect.width / 402, entry!.contentRect.height / 874))); observer.observe(area.current!); return () => observer.disconnect(); }, []);
  return <main ref={area} className="map-page" aria-label="Предпросмотр карты Казани из Figma" data-figma-node="6:964">
    <div className="map-artwork-wrap"><div className="map-artwork" style={{ transform: `scale(${scale})` }}>
      <OriginalAsset asset="map.imgMapGreenPng" className="map-background" />
      <div className="map-path-halo"><OriginalAsset asset="map.img2" /></div><div className="map-path-line"><OriginalAsset asset="map.img3" /></div>
      <button className="map-marker marker-kul" aria-label="Открыть мечеть Кул-Шариф" onClick={() => onOpen("kul-sharif")}><OriginalAsset asset="map.img1" /></button>
      <button className="map-marker marker-church" aria-label="Храм на карте" onClick={() => notice("Карточка храма будет добавлена с каталогом мест.")}><OriginalAsset asset="map.img" /></button>
      <button className="map-marker marker-suyumbike" aria-label="Башня Сююмбике" onClick={() => notice("Карточка башни Сююмбике будет добавлена с каталогом мест.")}><OriginalAsset asset="map.img4" /></button>
      <button className="map-marker marker-museum" aria-label="Музей на карте" onClick={() => notice("Карточка музея будет добавлена с каталогом мест.")}><OriginalAsset asset="map.img5" /></button>
      <button className="map-marker marker-route" aria-label="Выбранный маршрут" onClick={() => notice("Это схема из макета. Расчёт пешеходного пути ещё не подключён.")}><OriginalAsset asset="map.imgNavigationArrow" /></button>
    </div></div>
    <div className="map-top-controls"><div className="map-search"><OriginalAsset asset="map.imgMagnifyingGlass" /><input ref={search} aria-label="Поиск места" placeholder="Что рядом?" value={query} maxLength={100} onFocus={() => setSearching(true)} onChange={event => setQuery(event.target.value)} onKeyDown={event => { if (event.key === "Escape") { setSearching(false); search.current?.blur(); } }} /></div><button className="round-action white-action filter-map" type="button" aria-label="Фильтры карты" onClick={onFilters}><OriginalAsset asset="map.imgSlidersHorizontal" /></button></div>
    <button className={`audio-filter ${audioOnly ? "filter-selected" : ""}`} type="button" aria-pressed={audioOnly} onClick={() => { setAudioOnly(value => !value); setSearching(true); }}><OriginalAsset asset="map.imgHeadphones" /><span>Аудиогид</span></button>
    {searching && <div className="map-search-results"><div className="search-results-heading"><span>Места</span><button type="button" onClick={() => { setSearching(false); search.current?.blur(); }} aria-label="Закрыть результаты поиска">×</button></div>{results.length ? results.map(result => <button type="button" key={result.id} onClick={() => onOpen(result.id)}><span>{result.title}</span><OriginalAsset asset="profile.imgArrowRight" /></button>) : <p>{audioOnly ? "Готовые аудиозаписи пока не добавлены." : "Ничего не нашлось. Попробуй другое название."}</p>}</div>}
    <button className="round-action white-action locate-map" type="button" aria-label="Моё местоположение" onClick={() => notice("Это предпросмотр карты. GPS будет подключён вместе с интерактивной картой.")}><OriginalAsset asset="map.imgNavigationArrow1" /></button>
    <a className="map-attribution" href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">© OpenStreetMap contributors</a>
    <section className="next-stop-card" aria-label="Следующая остановка">
      <button className="next-stop-photo" type="button" aria-label={`Открыть ${place.title}`} onClick={() => onOpen(place.id)}><OriginalAsset asset={place.photo} alt={place.title} /></button>
      <button className="next-stop-copy" type="button" onClick={() => onOpen(place.id)}><span className="next-stop-eyebrow">БЛИЖАЙШАЯ ИСТОРИЯ</span><span className="next-stop-title">{place.id === "kul-sharif" ? <>Мечеть<br />Кул-Шариф</> : place.title}</span><span className="next-stop-duration">{Math.floor(place.durationSeconds / 60)} минуты истории</span></button>
      <button className="listen-next-stop" type="button" onClick={() => onListen(place.id)}><OriginalAsset asset="map.imgPlay" /><span>Слушать</span></button>
    </section>
  </main>;
}
