import { t, getLanguage, useI18n, numberLocale } from "../../i18n";
import { useEffect, useRef, useState, type CSSProperties, type PointerEvent } from "react";
import { Map, Marker, setWorkerUrl, type GeoJSONSource } from "maplibre-gl";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import "maplibre-gl/dist/maplibre-gl.css";
import { PlacePhoto, hasPlacePhoto } from "../../components/PlacePhoto";
import { OriginalAsset } from "../../components/OriginalAsset";
import { DetailSheet } from "../../components/DetailSheet";
import { figmaAssets } from "../../data/figmaAssets";
import { calculateWalkingRoute } from "../../data/api";
import { countPlaces, type Place, type PlaceId, type ShowNotice, type WalkingRoute } from "../../domain/demo";

setWorkerUrl(workerUrl);
const distance = (m: number) => m < 1000 ? t("{0} м", {0: Math.round(m)}) : t("{0} км", {0: (m / 1000).toLocaleString(numberLocale(), { maximumFractionDigits: 1 })});
function localizeMap(view: Map) {
  for (const layer of view.getStyle().layers) if (layer.type === "symbol" && (JSON.stringify(layer.layout?.["text-field"]) ?? "").includes("name")) view.setLayoutProperty(layer.id, "text-field", ["coalesce", ["get", `name:${getLanguage()}`], ["get", getLanguage() === "ru" ? "name" : "name:en"], ["get", "name:latin"], ["get", "name"]]);
}
const inKazan = ([x, y]: [number, number]) => x >= 48.8 && x <= 49.4 && y >= 55.6 && y <= 56;
type Props = { places: readonly Place[]; selected?: PlaceId; routePlaceIds: PlaceId[]; routeTitle: string; quiet: boolean; onQuietChange: (quiet: boolean) => void; onSelect: (id?: PlaceId) => void; onOpen: (id: PlaceId) => void; onListen: (id: PlaceId) => void; onFilters: () => void; notice: ShowNotice };

export function MapPage({ places, selected, routePlaceIds, routeTitle, quiet, onQuietChange, onSelect, onOpen, onListen, onFilters, notice }: Props) {
  const { language } = useI18n();
  const container = useRef<HTMLDivElement>(null), search = useRef<HTMLInputElement>(null);
  const map = useRef<Map | undefined>(undefined), userMarker = useRef<Marker | undefined>(undefined);
  const watch = useRef<number | undefined>(undefined);
  const [query, setQuery] = useState(""), [searching, setSearching] = useState(false), [audioOnly, setAudioOnly] = useState(false);
  const [ready, setReady] = useState(false), [mapError, setMapError] = useState(false), [mapAttempt, setMapAttempt] = useState(0);
  const [route, setRoute] = useState<WalkingRoute>(), [routeError, setRouteError] = useState("");
  const [routeBusy, setRouteBusy] = useState(false), [routeAttempt, setRouteAttempt] = useState(0);
  const [position, setPosition] = useState<[number, number]>(), [start, setStart] = useState<[number, number]>();
  const [walkingTarget, setWalkingTarget] = useState<PlaceId>();
  const [routeDetails, setRouteDetails] = useState(false);
  const quietRef = useRef(quiet); quietRef.current = quiet;
  const cardDown = useRef<{ x: number; y: number } | undefined>(undefined), cardSwiped = useRef(false);
  const place = places.find(p => p.id === selected) ?? places[0]!;
  const results = places.filter(p => (!audioOnly || p.audioUrl) && `${p.title} ${p.address ?? ""}`.toLocaleLowerCase("ru-RU").includes(query.trim().toLocaleLowerCase("ru-RU")));
  const routeKey = routePlaceIds.join(",");
  const hasRoute = !!walkingTarget || routePlaceIds.length >= 2;
  const selectedPlace = places.find(p => p.id === selected);
  const title = walkingTarget ? t("К месту: {0}", {0: places.find(p => p.id === walkingTarget)?.title ?? ""}) : routeTitle;
  const summary = routeBusy ? t("Рассчитываем пешеходный путь…") : routeError ? t(routeError) : route ? `${distance(route.distanceMeters)} · ${Math.ceil(route.durationSeconds / 60)} ${t("мин пешком ·")} ${countPlaces(route.placeIds.length)}` : "";
  const dockHeight = quiet ? 0 : selectedPlace ? 182 : hasRoute ? 56 : 0;
  const mapActions = useRef({ onSelect, onQuietChange }); mapActions.current = { onSelect, onQuietChange };

  function setQuiet(value: boolean) {
    quietRef.current = value; onQuietChange(value); setSearching(false); search.current?.blur();
    if (value) onSelect(undefined);
  }
  function closeCard() { onSelect(undefined); cardDown.current = undefined; }
  function endCardSwipe(event: PointerEvent) {
    if (!cardDown.current) return;
    const dx = event.clientX - cardDown.current.x, dy = event.clientY - cardDown.current.y; cardDown.current = undefined;
    if (dy > 45 && dy > Math.abs(dx)) { cardSwiped.current = true; closeCard(); }
  }
  function walkHere() {
    if (!position) return notice(t("Разреши геолокацию кнопкой со стрелкой, чтобы проложить путь от тебя."));
    if (!inKazan(position)) return notice(t("Путь от тебя доступен в Казани. Сейчас можно просматривать готовые прогулки."));
    setStart(position); setWalkingTarget(place.id); setRouteAttempt(n => n + 1);
  }
  function cameraPadding(point = false) {
    const height = container.current!.clientHeight;
    const shell = container.current!.closest(".app-shell")!;
    const audioHeight = shell.classList.contains("has-mini-player") ? 68 : 0;
    return { top: Math.min(150, height * .25), bottom: Math.min(116 + audioHeight + (point ? 182 : hasRoute ? 56 : 0), height * .55), left: 36, right: 36 };
  }

  useEffect(() => {
    setReady(false); setMapError(false); let active = true;
    const initialZoom = 14.3 + Math.log2(Math.max(280, container.current!.clientWidth) / 402);
    const initialPlace = places.find(p => p.id === selected);
    const view = new Map({ container: container.current!, style: "https://tiles.openfreemap.org/styles/positron", center: initialPlace?.coordinates ?? [49.1098, 55.7978], zoom: initialZoom, attributionControl: false, fadeDuration: 0, dragRotate: false, pitchWithRotate: false, renderWorldCopies: false, localIdeographFontFamily: false });
    map.current = view; view.touchZoomRotate.disableRotation();
    view.on("load", () => {
      if (!active) return;
      // Style real vector geometry with the approved Figma palette.
      for (const layer of view.getStyle().layers) {
        if (layer.type === "background") view.setPaintProperty(layer.id, "background-color", "#f0f7f2");
        if (layer.type === "fill" && /park|wood|landcover|landuse/.test(layer.id)) view.setPaintProperty(layer.id, "fill-color", "#def4e5");
        if (layer.type === "fill" && /building/.test(layer.id)) view.setPaintProperty(layer.id, "fill-color", "#dce9e1");
      }
      localizeMap(view); setReady(true); setMapError(false);
      if (initialPlace?.coordinates) view.jumpTo({ center: initialPlace.coordinates, padding: cameraPadding(true) });
    });
    view.on("error", () => { if (active) setMapError(true); });
    view.on("click", () => {
      const next = !quietRef.current; quietRef.current = next;
      mapActions.current.onSelect(undefined); mapActions.current.onQuietChange(next);
      setSearching(false); search.current?.blur();
    });
    view.on("movestart", event => {
      if (!event.originalEvent) return;
      quietRef.current = true; mapActions.current.onSelect(undefined); mapActions.current.onQuietChange(true);
      setSearching(false); search.current?.blur();
    });
    const observer = new ResizeObserver(() => view.resize()); observer.observe(container.current!);
    return () => { active = false; observer.disconnect(); view.remove(); map.current = undefined; userMarker.current = undefined; };
  }, [mapAttempt]);
  useEffect(() => { if (ready && map.current) localizeMap(map.current); }, [ready, language]);

  useEffect(() => {
    if (!ready || !map.current) return;
    const view = map.current;
    const markers = places.filter(p => p.coordinates && (!audioOnly || p.audioUrl)).map(p => {
      const element = document.createElement("button"); element.type = "button";
      element.className = `map-marker real-map-marker ${p.id === selected ? "selected-marker" : ""}`;
      element.setAttribute("aria-label", t("Выбрать {0}", {0: p.title})); element.dataset.placeId = p.id;
      const asset = figmaAssets[p.category === "mosque" ? "map.img1" : p.category === "church" ? "map.img" : p.id === "suyumbike" ? "map.img4" : "map.img5"];
      const image = document.createElement("img"); image.src = asset.src; image.width = asset.width; image.height = asset.height; image.alt = ""; element.append(image);
      element.onclick = event => { event.stopPropagation(); onSelect(p.id); quietRef.current = false; onQuietChange(false); setSearching(false); view.jumpTo({ center: p.coordinates!, padding: cameraPadding(true) }); };
      return new Marker({ element }).setLngLat(p.coordinates!).addTo(view);
    });
    return () => { for (const marker of markers) marker.remove(); };
  }, [places, ready, selected, audioOnly, onSelect, onQuietChange]);

  useEffect(() => {
    const controller = new AbortController(); setRoute(undefined); setRouteError(""); setRouteBusy(true);
    const ids = walkingTarget ? [walkingTarget] : routePlaceIds;
    if (!walkingTarget && ids.length < 2) { setRouteBusy(false); return; }
    calculateWalkingRoute(ids, controller.signal, walkingTarget ? start : undefined).then(value => { if (!controller.signal.aborted) setRoute(value); }).catch(error => { if (!controller.signal.aborted) setRouteError(navigator.onLine ? error.message : t("Нет сети. Новые пути рассчитываются онлайн.")); }).finally(() => { if (!controller.signal.aborted) setRouteBusy(false); });
    return () => controller.abort();
  }, [routeKey, walkingTarget, start, routeAttempt]);

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
    // A selected place already sets persistent camera padding. In MapLibre 6
    // fitBounds otherwise ADDS its padding, which can consume the whole phone
    // viewport and throw Invalid LngLat (NaN) when returning from the player.
    view.fitBounds([[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]], { padding: cameraPadding(!!selectedPlace), absolutePadding: true, maxZoom: 16, animate: false });
  }, [route, ready]);

  useEffect(() => {
    if (!ready || !map.current || !position) return;
    if (!userMarker.current) {
      const element = document.createElement("span"); element.className = "real-user-position"; element.setAttribute("aria-label", t("Твоё реальное местоположение"));
      userMarker.current = new Marker({ element }).setLngLat(position).addTo(map.current);
    } else userMarker.current.setLngLat(position);
  }, [position, ready]);
  useEffect(() => () => { if (watch.current !== undefined) navigator.geolocation.clearWatch(watch.current); }, []);

  function locate() {
    if (!navigator.geolocation) return notice(t("В этом браузере геолокация недоступна. Просмотр Казани и маршрутов работает."));
    if (watch.current !== undefined) navigator.geolocation.clearWatch(watch.current);
    let first = true;
    watch.current = navigator.geolocation.watchPosition(value => {
      const real: [number, number] = [value.coords.longitude, value.coords.latitude]; setPosition(real);
      if (first && inKazan(real)) map.current?.jumpTo({ center: real, zoom: 16 });
      else if (first) notice(t("Ты сейчас вне Казани. Показываю Казань и её маршруты; твои координаты не подменяются."));
      first = false;
    }, error => notice(error.code === 1 ? t("Геолокация не разрешена. Карта и маршруты остаются доступны.") : t("Не удалось определить местоположение. Карта доступна; попробуй ещё раз.")), { enableHighAccuracy: true, timeout: 15000, maximumAge: 10000 });
  }

  return <main className="map-page" aria-label={t("Интерактивная карта Казани")} data-figma-node="2022:7008" data-map-ready={ready} data-route-source={route ? "foot" : undefined} data-map-quiet={quiet} data-card-open={!!selectedPlace && !quiet}
    style={{ "--map-dock-height": `${dockHeight}px` } as CSSProperties} onKeyDown={event => { if (event.key === "Escape") { closeCard(); setQuiet(false); } }}>
    <div ref={container} className="real-map" />
    <div className="map-control-layer" inert={quiet} aria-hidden={quiet || undefined}>
      <div className="map-top-controls"><div className="map-search"><OriginalAsset asset="map.imgMagnifyingGlass" /><input ref={search} aria-label={t("Поиск места")} placeholder={t("Что рядом?")} value={query} maxLength={100} onFocus={() => setSearching(true)} onChange={event => setQuery(event.target.value)} onKeyDown={event => { if (event.key === "Escape") { setSearching(false); search.current?.blur(); } }} /></div><button className="round-action white-action filter-map" type="button" aria-label={t("Фильтры карты")} onClick={onFilters}><OriginalAsset asset="map.imgSlidersHorizontal" /></button></div>
      <button className={`audio-filter ${audioOnly ? "filter-selected" : ""}`} type="button" aria-pressed={audioOnly} onClick={() => { setAudioOnly(value => !value); setSearching(true); }}><OriginalAsset asset="map.imgHeadphones" /><span>{t("Аудиогид")}</span></button>
      {searching && <div className="map-search-results"><div className="search-results-heading"><span>{t("Места ·")}{results.length}</span><button type="button" onClick={() => { setSearching(false); search.current?.blur(); }} aria-label={t("Закрыть результаты поиска")}>×</button></div>{results.length ? results.map(result => <button type="button" key={result.id} onClick={() => onOpen(result.id)}><span>{result.title}</span><OriginalAsset asset="profile.imgArrowRight" /></button>) : <p>{audioOnly ? t("Готовые аудиозаписи пока не добавлены.") : t("Ничего не нашлось. Попробуй другое название.")}</p>}</div>}
    </div>
    {(mapError || !ready) && <div className="map-load-state" role="status">{mapError ? <><span>{t("Карта не загрузилась. Список мест доступен.")}</span><button type="button" onClick={() => setMapAttempt(n => n + 1)}>{t("Повторить")}</button></> : t("Загружаем карту…")}</div>}
    <button className="round-action white-action locate-map" type="button" aria-label={t("Моё местоположение")} onClick={locate}><OriginalAsset asset="map.imgNavigationArrow1" /></button>
    <div className="map-attribution"><a href="https://openfreemap.org" target="_blank" rel="noreferrer">OpenFreeMap</a> · <a href="https://www.openmaptiles.org" target="_blank" rel="noreferrer">OpenMapTiles</a> · <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">© OpenStreetMap</a> · <a href="https://routing.openstreetmap.de/about.html" target="_blank" rel="noreferrer">FOSSGIS</a> · <a href="https://www.openstreetmap.org/fixthemap" target="_blank" rel="noreferrer">{t("Исправить")}</a></div>
    <div className="map-context-dock">
      <button className="map-route-peek" type="button" data-visible={!quiet && !selectedPlace && hasRoute} inert={quiet || !!selectedPlace || !hasRoute} aria-hidden={quiet || !!selectedPlace || !hasRoute || undefined} aria-label={t("Открыть сведения о маршруте")} onClick={() => setRouteDetails(true)} data-figma-node="2022:7001"><span><strong>{title}</strong><small>{summary}</small></span><OriginalAsset asset="map.imgNavigationArrow1" /></button>
      <section className="next-stop-card" aria-label={t("Выбранное место")} data-visible={!quiet && !!selectedPlace} inert={quiet || !selectedPlace} aria-hidden={quiet || !selectedPlace || undefined}
        onPointerDown={event => { cardSwiped.current = false; cardDown.current = { x: event.clientX, y: event.clientY }; }} onPointerUp={endCardSwipe} onPointerCancel={() => { cardDown.current = undefined; }}
        onClickCapture={event => { if (cardSwiped.current) { event.preventDefault(); event.stopPropagation(); cardSwiped.current = false; } }}>
        <span className="map-card-handle" aria-hidden="true" />
        <button className="next-stop-photo" type="button" aria-label={t("Открыть {0}", {0: place.title})} onClick={() => onOpen(place.id)}>{hasPlacePhoto(place) ? <PlacePhoto place={place} /> : <span className="photo-pending">{t("Фото")}<br />{t("скоро")}</span>}</button>
        <button className="next-stop-copy" type="button" onClick={() => onOpen(place.id)}><span className="next-stop-eyebrow">{route?.placeIds.includes(place.id) ? t("НА ТВОЕЙ ПРОГУЛКЕ") : t("МЕСТО В КАЗАНИ")}</span><span className="next-stop-title">{place.id === "kul-sharif" ? <>{t("Мечеть")}<br />{t("Кул-Шариф")}</> : place.title}</span><span className="next-stop-duration">{walkingTarget === place.id && route ? t("{0} · {1} мин пешком", {0: distance(route.distanceMeters), 1: Math.ceil(route.durationSeconds / 60)}) : place.audioUrl ? t("{0} мин истории", {0: Math.ceil(place.durationSeconds / 60)}) : t("Открыть карточку места")}</span></button>
        <button className="listen-next-stop" type="button" onClick={() => place.audioUrl ? onListen(place.id) : onOpen(place.id)}><OriginalAsset asset={place.audioUrl ? "map.imgPlay" : "profile.imgArrowRight"} /><span>{place.audioUrl ? t("Слушать") : t("О месте")}</span></button>
        <button className="map-card-close" type="button" aria-label={t("Закрыть карточку места")} onClick={closeCard}>×</button>
        <button className="map-walk-here" type="button" aria-label={t("Идти к этому месту")} onClick={walkHere} data-figma-node="2022:6996"><OriginalAsset asset="map.imgNavigationArrow1" /><span>{t("Идти")}</span></button>
      </section>
    </div>
    {routeDetails && <DetailSheet title={title} onClose={() => setRouteDetails(false)}>
      <p>{summary}</p>
      {routeError && <button className="sheet-option" type="button" onClick={() => setRouteAttempt(n => n + 1)}>{t("Повторить расчёт")}</button>}
      {(walkingTarget ? [walkingTarget] : routePlaceIds).map(id => places.find(p => p.id === id)).filter((p): p is Place => !!p).map(p => <button key={p.id} className="sheet-option" type="button" onClick={() => { setRouteDetails(false); setQuiet(false); onSelect(p.id); map.current?.jumpTo({ center: p.coordinates!, padding: cameraPadding(true) }); }}>{p.title}</button>)}
    </DetailSheet>}
  </main>;
}
