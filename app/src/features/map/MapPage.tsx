import { useEffect, useRef, useState } from "react";
import { Map, Marker, setWorkerUrl, type GeoJSONSource } from "maplibre-gl";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import "maplibre-gl/dist/maplibre-gl.css";
import { OriginalAsset } from "../../components/OriginalAsset";
import { figmaAssets } from "../../data/figmaAssets";
import { calculateWalkingRoute } from "../../data/api";
import type { Place, PlaceId, ShowNotice, WalkingRoute } from "../../domain/demo";

setWorkerUrl(workerUrl);
const distance = (m: number) => m < 1000 ? `${Math.round(m)} м` : `${(m / 1000).toLocaleString("ru-RU", { maximumFractionDigits: 1 })} км`;
const inKazan = ([x, y]: [number, number]) => x >= 48.8 && x <= 49.4 && y >= 55.6 && y <= 56;
type Props = { places: readonly Place[]; selected: PlaceId; routePlaceIds: PlaceId[]; routeTitle: string; onSelect: (id: PlaceId) => void; onOpen: (id: PlaceId) => void; onListen: (id: PlaceId) => void; onFilters: () => void; notice: ShowNotice };

export function MapPage({ places, selected, routePlaceIds, routeTitle, onSelect, onOpen, onListen, onFilters, notice }: Props) {
  const container = useRef<HTMLDivElement>(null), search = useRef<HTMLInputElement>(null);
  const map = useRef<Map | undefined>(undefined), userMarker = useRef<Marker | undefined>(undefined);
  const watch = useRef<number | undefined>(undefined);
  const [query, setQuery] = useState(""), [searching, setSearching] = useState(false), [audioOnly, setAudioOnly] = useState(false);
  const [ready, setReady] = useState(false), [mapError, setMapError] = useState(false), [mapAttempt, setMapAttempt] = useState(0);
  const [route, setRoute] = useState<WalkingRoute>(), [routeError, setRouteError] = useState("");
  const [routeBusy, setRouteBusy] = useState(false), [routeAttempt, setRouteAttempt] = useState(0);
  const [position, setPosition] = useState<[number, number]>(), [start, setStart] = useState<[number, number]>();
  const [toSelected, setToSelected] = useState(false);
  const place = places.find(p => p.id === selected) ?? places[0]!;
  const results = places.filter(p => (!audioOnly || p.audioUrl) && `${p.title} ${p.address ?? ""}`.toLocaleLowerCase("ru-RU").includes(query.trim().toLocaleLowerCase("ru-RU")));
  const routeKey = routePlaceIds.join(",");
  const walkingTarget = toSelected ? selected : "";

  useEffect(() => {
    setReady(false); setMapError(false); let active = true;
    const view = new Map({ container: container.current!, style: "https://tiles.openfreemap.org/styles/positron", center: [49.1098, 55.7978], zoom: 14.8, attributionControl: false, fadeDuration: 0, dragRotate: false, pitchWithRotate: false, renderWorldCopies: false, localIdeographFontFamily: false });
    map.current = view; view.touchZoomRotate.disableRotation();
    view.on("load", () => {
      if (!active) return;
      // Style real vector geometry with the approved Figma palette.
      for (const layer of view.getStyle().layers) {
        if (layer.type === "background") view.setPaintProperty(layer.id, "background-color", "#f0f7f2");
        if (layer.type === "fill" && /park|wood|landcover|landuse/.test(layer.id)) view.setPaintProperty(layer.id, "fill-color", "#def4e5");
        if (layer.type === "fill" && /building/.test(layer.id)) view.setPaintProperty(layer.id, "fill-color", "#dce9e1");
        if (layer.type === "symbol" && (JSON.stringify(layer.layout?.["text-field"]) ?? "").includes("name")) view.setLayoutProperty(layer.id, "text-field", ["coalesce", ["get", "name:ru"], ["get", "name"], ["get", "name:latin"]]);
      }
      setReady(true); setMapError(false);
    });
    view.on("error", () => { if (active) setMapError(true); });
    const observer = new ResizeObserver(() => view.resize()); observer.observe(container.current!);
    return () => { active = false; observer.disconnect(); view.remove(); map.current = undefined; userMarker.current = undefined; };
  }, [mapAttempt]);

  useEffect(() => {
    if (!ready || !map.current) return;
    const view = map.current;
    const markers = places.filter(p => p.coordinates && (!audioOnly || p.audioUrl)).map(p => {
      const element = document.createElement("button"); element.type = "button";
      element.className = `map-marker real-map-marker ${p.id === selected ? "selected-marker" : ""}`;
      element.setAttribute("aria-label", `Выбрать ${p.title}`); element.dataset.placeId = p.id;
      const asset = figmaAssets[p.category === "mosque" ? "map.img1" : p.category === "church" ? "map.img" : p.id === "suyumbike" ? "map.img4" : "map.img5"];
      const image = document.createElement("img"); image.src = asset.src; image.width = asset.width; image.height = asset.height; image.alt = ""; element.append(image);
      element.onclick = () => { onSelect(p.id); setToSelected(false); view.jumpTo({ center: p.coordinates!, padding: { top: 170, bottom: 340, left: 25, right: 25 } }); };
      return new Marker({ element }).setLngLat(p.coordinates!).addTo(view);
    });
    return () => { for (const marker of markers) marker.remove(); };
  }, [places, ready, selected, audioOnly, onSelect]);

  useEffect(() => {
    const controller = new AbortController(); setRoute(undefined); setRouteError(""); setRouteBusy(true);
    const ids = toSelected ? [selected] : routePlaceIds;
    if (ids.length < 2 && !start) { setRouteBusy(false); return; }
    calculateWalkingRoute(ids, controller.signal, toSelected ? start : undefined).then(value => { if (!controller.signal.aborted) setRoute(value); }).catch(error => { if (!controller.signal.aborted) setRouteError(navigator.onLine ? error.message : "Нет сети. Новые пути рассчитываются онлайн."); }).finally(() => { if (!controller.signal.aborted) setRouteBusy(false); });
    return () => controller.abort();
  }, [routeKey, toSelected, walkingTarget, start, routeAttempt]);

  useEffect(() => {
    if (!ready || !map.current) return;
    const view = map.current;
    if (!route) {
      for (const id of ["walking-line", "walking-halo"]) if (view.getLayer(id)) view.removeLayer(id);
      if (view.getSource("walking-route")) view.removeSource("walking-route");
      return;
    }
    const data = { type: "Feature" as const, properties: {}, geometry: route.geometry };
    if (view.getSource("walking-route")) (view.getSource("walking-route") as GeoJSONSource).setData(data);
    else {
      view.addSource("walking-route", { type: "geojson", data });
      view.addLayer({ id: "walking-halo", type: "line", source: "walking-route", paint: { "line-color": "#ffffff", "line-width": 8 }, layout: { "line-join": "round", "line-cap": "round" } });
      view.addLayer({ id: "walking-line", type: "line", source: "walking-route", paint: { "line-color": "#08734f", "line-width": 4 }, layout: { "line-join": "round", "line-cap": "round" } });
    }
    const lngs = route.geometry.coordinates.map(c => c[0]), lats = route.geometry.coordinates.map(c => c[1]);
    view.fitBounds([[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]], { padding: { top: 185, bottom: Math.min(350, container.current!.clientHeight * .45), left: 46, right: 46 }, maxZoom: 16, animate: false });
  }, [route, ready]);

  useEffect(() => {
    if (!ready || !map.current || !position) return;
    if (!userMarker.current) {
      const element = document.createElement("span"); element.className = "real-user-position"; element.setAttribute("aria-label", "Твоё реальное местоположение");
      userMarker.current = new Marker({ element }).setLngLat(position).addTo(map.current);
    } else userMarker.current.setLngLat(position);
  }, [position, ready]);
  useEffect(() => () => { if (watch.current !== undefined) navigator.geolocation.clearWatch(watch.current); }, []);

  function locate() {
    if (!navigator.geolocation) return notice("В этом браузере геолокация недоступна. Просмотр Казани и маршрутов работает.");
    if (watch.current !== undefined) navigator.geolocation.clearWatch(watch.current);
    let first = true;
    watch.current = navigator.geolocation.watchPosition(value => {
      const real: [number, number] = [value.coords.longitude, value.coords.latitude]; setPosition(real);
      if (first && inKazan(real)) map.current?.jumpTo({ center: real, zoom: 16 });
      else if (first) notice("Ты сейчас вне Казани. Показываю Казань и её маршруты; твои координаты не подменяются.");
      first = false;
    }, error => notice(error.code === 1 ? "Геолокация не разрешена. Карта и маршруты остаются доступны." : "Не удалось определить местоположение. Карта доступна; попробуй ещё раз."), { enableHighAccuracy: true, timeout: 15000, maximumAge: 10000 });
  }

  return <main className="map-page" aria-label="Интерактивная карта Казани" data-figma-node="6:964" data-map-ready={ready} data-route-source={route ? "foot" : undefined}>
    <div ref={container} className="real-map" />
    <div className="map-top-controls"><div className="map-search"><OriginalAsset asset="map.imgMagnifyingGlass" /><input ref={search} aria-label="Поиск места" placeholder="Что рядом?" value={query} maxLength={100} onFocus={() => setSearching(true)} onChange={event => setQuery(event.target.value)} onKeyDown={event => { if (event.key === "Escape") { setSearching(false); search.current?.blur(); } }} /></div><button className="round-action white-action filter-map" type="button" aria-label="Фильтры карты" onClick={onFilters}><OriginalAsset asset="map.imgSlidersHorizontal" /></button></div>
    <button className={`audio-filter ${audioOnly ? "filter-selected" : ""}`} type="button" aria-pressed={audioOnly} onClick={() => { setAudioOnly(value => !value); setSearching(true); }}><OriginalAsset asset="map.imgHeadphones" /><span>Аудиогид</span></button>
    {(mapError || !ready) && <div className="map-load-state" role="status">{mapError ? <><span>Карта не загрузилась. Список мест доступен.</span><button type="button" onClick={() => setMapAttempt(n => n + 1)}>Повторить</button></> : "Загружаем карту…"}</div>}
    {searching && <div className="map-search-results"><div className="search-results-heading"><span>Места · {results.length}</span><button type="button" onClick={() => { setSearching(false); search.current?.blur(); }} aria-label="Закрыть результаты поиска">×</button></div>{results.length ? results.map(result => <button type="button" key={result.id} onClick={() => onOpen(result.id)}><span>{result.title}</span><OriginalAsset asset="profile.imgArrowRight" /></button>) : <p>{audioOnly ? "Готовые аудиозаписи пока не добавлены." : "Ничего не нашлось. Попробуй другое название."}</p>}</div>}
    <button className="round-action white-action locate-map" type="button" aria-label="Моё местоположение" onClick={locate}><OriginalAsset asset="map.imgNavigationArrow1" /></button>
    <div className="walking-summary" aria-live="polite"><strong>{toSelected ? `К месту: ${place.title}` : routeTitle}</strong>{routeBusy ? <span>Рассчитываем пешеходный путь…</span> : routeError ? <><span>{routeError}</span><button type="button" onClick={() => setRouteAttempt(n => n + 1)}>Повторить расчёт</button></> : route ? <span>{distance(route.distanceMeters)} · {Math.ceil(route.durationSeconds / 60)} мин пешком · {route.placeIds.length} мест</span> : null}<button type="button" onClick={() => { if (!position) return notice("Разреши геолокацию кнопкой со стрелкой, чтобы проложить путь от тебя."); if (!inKazan(position)) return notice("Путь от тебя доступен в Казани. Сейчас можно просматривать готовые прогулки."); setStart(position); setToSelected(true); setRouteAttempt(n => n + 1); }}>Идти к этому месту</button></div>
    <div className="map-attribution"><a href="https://openfreemap.org" target="_blank" rel="noreferrer">OpenFreeMap</a> · <a href="https://www.openmaptiles.org" target="_blank" rel="noreferrer">OpenMapTiles</a> · <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">© OpenStreetMap</a> · <a href="https://routing.openstreetmap.de/about.html" target="_blank" rel="noreferrer">FOSSGIS</a> · <a href="https://www.openstreetmap.org/fixthemap" target="_blank" rel="noreferrer">Исправить</a></div>
    <section className="next-stop-card" aria-label="Следующая остановка"><button className="next-stop-photo" type="button" aria-label={`Открыть ${place.title}`} onClick={() => onOpen(place.id)}>{place.photo ? <OriginalAsset asset={place.photo} alt={place.title} /> : <span className="photo-pending">Фото<br />скоро</span>}</button><button className="next-stop-copy" type="button" onClick={() => onOpen(place.id)}><span className="next-stop-eyebrow">{route ? "НА ТВОЕЙ ПРОГУЛКЕ" : "МЕСТО В КАЗАНИ"}</span><span className="next-stop-title">{place.id === "kul-sharif" ? <>Мечеть<br />Кул-Шариф</> : place.title}</span><span className="next-stop-duration">{toSelected && route ? `${distance(route.distanceMeters)} · ${Math.ceil(route.durationSeconds / 60)} мин пешком` : place.audioUrl ? `${Math.ceil(place.durationSeconds / 60)} мин истории` : "Открыть карточку места"}</span></button><button className="listen-next-stop" type="button" onClick={() => place.audioUrl ? onListen(place.id) : onOpen(place.id)}><OriginalAsset asset={place.audioUrl ? "map.imgPlay" : "profile.imgArrowRight"} /><span>{place.audioUrl ? "Слушать" : "О месте"}</span></button></section>
  </main>;
}
