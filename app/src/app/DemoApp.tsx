import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { Destination, HomeContent, HomeRepository } from "../domain/home";
import { readScreen, type DemoCatalog, type PlaceId, type Screen, type ThemeRoute } from "../domain/demo";
import { localHomeRepository } from "../data/homeRepository";
import { localCatalogRepository } from "../data/demoRepository";
import { HomePage } from "../features/home/HomePage";
import { MapPage } from "../features/map/MapPage";
import { PlacePage } from "../features/place/PlacePage";
import { PlayerPage } from "../features/player/PlayerPage";
import { RoutesPage } from "../features/routes/RoutesPage";
import { ProfilePage, type ProfileSheet } from "../features/profile/ProfilePage";
import { ZilantPage } from "../features/zilant/ZilantPage";
import { BottomNavigation } from "../components/BottomNavigation";
import { DetailSheet } from "../components/DetailSheet";
import { OriginalAsset } from "../components/OriginalAsset";
import { platform } from "../platform/runtime";
import { loadLocalProgress, saveLocalProgress } from "../platform/localProgress";

type Sheet = ProfileSheet | "map-filters" | "player-actions";
const sheetTitles: Record<Sheet, string> = { favorites: "Избранное", offline: "Офлайн-маршруты", settings: "Настройки", awards: "Награды", account: "Твоя Казань", "map-filters": "Фильтры карты", "player-actions": "Аудиоистория" };

export function App({ repository = localHomeRepository }: { repository?: HomeRepository }) {
  const [content, setContent] = useState<HomeContent>();
  const [catalog, setCatalog] = useState<DemoCatalog>();
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [screen, setScreen] = useState<Screen>(() => readScreen(location.hash));
  const [placeId, setPlaceId] = useState<PlaceId>(() => location.hash.endsWith("/kul-sharif") ? "kul-sharif" : "ushkova");
  const [mapSelection, setMapSelection] = useState<PlaceId>("kul-sharif");
  const [progress, setProgress] = useState(loadLocalProgress);
  const [question, setQuestion] = useState("");
  const [sheet, setSheet] = useState<Sheet>();
  const [notice, setNotice] = useState("");
  const noticeTimeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const pendingRequest = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    const controller = new AbortController(); setFailed(false);
    Promise.all([repository.getHome(controller.signal), localCatalogRepository.getCatalog(controller.signal)]).then(([home, data]) => { if (!controller.signal.aborted) { setContent(home); setCatalog(data); } }).catch(() => { if (!controller.signal.aborted) setFailed(true); });
    return () => controller.abort();
  }, [repository, attempt]);
  useEffect(() => {
    function onHashChange() { setScreen(readScreen(location.hash)); if (location.hash.endsWith("/ushkova")) setPlaceId("ushkova"); else if (location.hash.endsWith("/kul-sharif")) setPlaceId("kul-sharif"); setSheet(undefined); }
    window.addEventListener("hashchange", onHashChange);
    return () => { window.removeEventListener("hashchange", onHashChange); clearTimeout(noticeTimeout.current); clearTimeout(pendingRequest.current); };
  }, []);
  useLayoutEffect(() => { window.scrollTo({ top: 0, behavior: "instant" }); }, [screen]);
  useEffect(() => { if (screen !== "waiting") clearTimeout(pendingRequest.current); }, [screen]);

  function showNotice(message: string) { clearTimeout(noticeTimeout.current); setNotice(message); noticeTimeout.current = setTimeout(() => setNotice(""), 6500); }
  function go(target: Screen, id?: PlaceId) {
    if (target !== "waiting") clearTimeout(pendingRequest.current);
    if (id) setPlaceId(id);
    setNotice(""); setSheet(undefined);
    location.hash = `/${target}${id ? `/${id}` : ""}`;
    setScreen(target);
    if (target === screen) window.scrollTo({ top: 0, behavior: "instant" });
  }
  function navigate(destination: Destination) { go(destination); }
  function openPlace(id: PlaceId) { go("place", id); }
  function chooseRoute(route: ThemeRoute) { setMapSelection(route.id === "imperial" ? "ushkova" : "kul-sharif"); go("map"); showNotice("Показана схема из Figma. Параметры маршрута демонстрационные; путь пока не рассчитан."); }
  function updateProgress(next: typeof progress) { setProgress(next); if (!saveLocalProgress(next)) showNotice("Браузер не разрешил сохранение. Изменения доступны до закрытия страницы."); }
  function sendDemoQuestion(text: string) {
    clearTimeout(pendingRequest.current); setQuestion(text); go("waiting");
    pendingRequest.current = setTimeout(() => { go("dialog"); showNotice("Это пример диалога из макета. OpenAI ещё не подключён."); }, 1400);
  }

  const place = catalog?.places.find(p => p.id === placeId);
  const chat = screen === "zilant" || screen === "dialog" || screen === "waiting";
  const current: Destination = chat ? "zilant" : screen === "map" || screen === "routes" || screen === "profile" ? screen : "home";
  const withNavigation = screen !== "place" && screen !== "player";

  return <div className={`app-shell platform-${platform} screen-${screen} ${screen === "home" ? "" : "additional-screen"}`}>
    {content && catalog && place ? <>
      {screen === "home" && <HomePage content={content} onNavigate={navigate} />}
      {screen === "map" && <MapPage places={catalog.places} selected={mapSelection} onOpen={openPlace} onListen={id => go("player", id)} onFilters={() => setSheet("map-filters")} notice={showNotice} />}
      {screen === "place" && <PlacePage place={place} favorite={progress.favorites.includes(place.id)} onFavorite={() => updateProgress({ ...progress, favorites: progress.favorites.includes(place.id) ? progress.favorites.filter(id => id !== place.id) : [...progress.favorites, place.id] })} onBack={() => go("map")} onListen={() => go("player", place.id)} />}
      {screen === "player" && <PlayerPage key={place.id} place={place} position={progress.positions[place.id] ?? 78} onPosition={seconds => updateProgress({ ...progress, positions: { ...progress.positions, [place.id]: seconds } })} onBack={() => go("place", place.id)} onMap={() => { setMapSelection(place.id); go("map"); }} onMore={() => setSheet("player-actions")} notice={showNotice} />}
      {screen === "routes" && <RoutesPage routes={catalog.routes} onSelect={chooseRoute} onZilant={() => go("zilant")} />}
      {screen === "profile" && <ProfilePage onOpen={setSheet} />}
      {chat && <ZilantPage key={screen} mode={screen as "zilant" | "dialog" | "waiting"} question={question} onSend={sendDemoQuestion} onNew={() => { setQuestion(""); go("zilant"); }} onStop={() => { clearTimeout(pendingRequest.current); go("zilant"); showNotice("Запрос остановлен."); }} onMap={() => { setMapSelection("kul-sharif"); go("map"); }} onAlternative={() => go("routes")} />}
    </> : <main className="content-state" aria-busy={!failed}><h1>{failed ? "Не получилось загрузить приложение" : "Загружаем Казань…"}</h1>{failed && <><p>Попробуй ещё раз.</p><button type="button" onClick={() => setAttempt(value => value + 1)}>Повторить</button></>}</main>}
    {withNavigation && <><div className="navigation-gap" aria-hidden="true" /><BottomNavigation current={current} onNavigate={navigate} /></>}
    <div className="notice-region" role="status" aria-live="polite" aria-atomic="true">{notice && <div className="notice"><span>{notice}</span><button type="button" aria-label="Закрыть сообщение" onClick={() => setNotice("")}>×</button></div>}</div>
    {sheet && catalog && place && <DetailSheet title={sheetTitles[sheet]} onClose={() => setSheet(undefined)}>
      {sheet === "favorites" ? <>{catalog.places.filter(p => progress.favorites.includes(p.id)).map(p => <button className="saved-place-row" key={p.id} type="button" onClick={() => openPlace(p.id)}><OriginalAsset asset={p.photo} alt={p.title} /><span>{p.title}</span><OriginalAsset asset="profile.imgArrowRight" /></button>)}{!progress.favorites.length && <p>Пока ничего нет. Сохрани понравившееся место с помощью закладки.</p>}</>
        : sheet === "map-filters" ? <><p>В предпросмотре доступны два места из макета.</p><button type="button" className="sheet-option" onClick={() => openPlace("ushkova")}>Дом Ушковой</button><button type="button" className="sheet-option" onClick={() => { setMapSelection("kul-sharif"); setSheet(undefined); }}>Мечеть Кул-Шариф</button></>
        : sheet === "player-actions" ? <><button className="sheet-option" type="button" onClick={() => openPlace(place.id)}>Открыть место</button><p>Плеер сейчас показывает данные макета. Готовая аудиозапись ещё не загружена.</p></>
        : sheet === "awards" ? <><div className="sheet-medal"><OriginalAsset asset="profile.imgFrame" /></div><p>За прогулки и новые открытия.</p><p>Коллекция и правила выдачи наград будут добавлены отдельно.</p></>
        : sheet === "offline" ? <><p>Скачанных маршрутов пока нет.</p><p>Полноценная загрузка карты, текстов, фотографий и аудио ещё не подключена.</p><button className="primary-action" type="button" onClick={() => go("routes")}>Выбрать маршрут</button></>
        : sheet === "account" ? <><p>Ты знакомишься с Казанью как гость.</p><p>Избранное и выбранная позиция истории сохраняются на этом устройстве. Вход по email и синхронизация ещё не подключены.</p></>
        : <><p>Казань · Русский язык</p><p>Предпросмотр дизайна на локальных данных.</p><button className="sheet-option" type="button" onClick={() => setSheet("account")}>Аккаунт и синхронизация</button></>}
    </DetailSheet>}
  </div>;
}
