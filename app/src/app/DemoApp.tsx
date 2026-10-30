import { lazy, Suspense, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { Destination, HomeContent, HomeRepository } from "../domain/home";
import { readScreen, type DemoCatalog, type PlaceId, type Screen, type ThemeRoute, type ZilantAnswer } from "../domain/demo";
import { localHomeRepository } from "../data/homeRepository";
import { apiCatalogRepository, askZilant, getServerProgress, putServerProgress } from "../data/api";
import { HomePage } from "../features/home/HomePage";
import { PlacePage } from "../features/place/PlacePage";
import { PlayerPage } from "../features/player/PlayerPage";
import { RoutesPage } from "../features/routes/RoutesPage";
import { ProfilePage, type ProfileSheet } from "../features/profile/ProfilePage";
import { ZilantPage } from "../features/zilant/ZilantPage";
import { BottomNavigation } from "../components/BottomNavigation";
import { DetailSheet } from "../components/DetailSheet";
import { OriginalAsset } from "../components/OriginalAsset";
import { platform } from "../platform/runtime";
import { acknowledgeProgress, hasPendingProgress, loadLocalProgress, saveLocalProgress } from "../platform/localProgress";
import { useAudioPlayback } from "../platform/audioPlayback";

type Sheet = ProfileSheet | "map-filters" | "player-actions";
const sheetTitles: Record<Sheet, string> = { favorites: "Избранное", offline: "Офлайн-маршруты", settings: "Настройки", awards: "Награды", account: "Твоя Казань", "map-filters": "Фильтры карты", "player-actions": "Аудиоистория" };
const MapPage = lazy(() => import("../features/map/MapPage").then(module => ({ default: module.MapPage })));

export function App({ repository = localHomeRepository }: { repository?: HomeRepository }) {
  const [content, setContent] = useState<HomeContent>();
  const [catalog, setCatalog] = useState<DemoCatalog>();
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [screen, setScreen] = useState<Screen>(() => readScreen(location.hash));
  const [placeId, setPlaceId] = useState<PlaceId>(() => location.hash.split("/")[2] || "ushkova");
  const [mapSelection, setMapSelection] = useState<PlaceId>("kul-sharif");
  const [progress, setProgress] = useState(loadLocalProgress);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<ZilantAnswer>();
  const [chatError, setChatError] = useState("");
  const [conversation, setConversation] = useState(() => crypto.randomUUID());
  const [turns, setTurns] = useState<{ question: string; answer: string }[]>([]);
  const [routePlaceIds, setRoutePlaceIds] = useState<PlaceId[]>(["kul-sharif", "ushkova"]);
  const [routeTitle, setRouteTitle] = useState("Кремль и Кремлёвская улица");
  const [progressReady, setProgressReady] = useState(false);
  const [sheet, setSheet] = useState<Sheet>();
  const [notice, setNotice] = useState("");
  const noticeTimeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const pendingRequest = useRef<AbortController | undefined>(undefined);
  const syncQueue = useRef(Promise.resolve());
  const dirtyProgress = useRef(false);
  const playback = useAudioPlayback();

  useEffect(() => {
    const controller = new AbortController(); setFailed(false);
    Promise.all([repository.getHome(controller.signal), apiCatalogRepository.getCatalog(controller.signal)]).then(([home, data]) => { if (!controller.signal.aborted) { setContent(home); setCatalog(data); } }).catch(() => { if (!controller.signal.aborted) setFailed(true); });
    return () => controller.abort();
  }, [repository, attempt]);
  useEffect(() => {
    function onHashChange() { setScreen(readScreen(location.hash)); const id = location.hash.split("/")[2]; if (id && /^[a-z][a-z0-9-]{0,50}$/.test(id)) setPlaceId(id); setSheet(undefined); }
    window.addEventListener("hashchange", onHashChange);
    return () => { window.removeEventListener("hashchange", onHashChange); clearTimeout(noticeTimeout.current); pendingRequest.current?.abort(); };
  }, []);
  useLayoutEffect(() => { window.scrollTo({ top: 0, behavior: "auto" }); }, [screen]);
  useEffect(() => { if (screen !== "waiting") pendingRequest.current?.abort(); }, [screen]);
  useEffect(() => {
    let active = true;
    getServerProgress().then(remote => { if (active && !dirtyProgress.current) { const local = loadLocalProgress(); const value = hasPendingProgress() || (!remote.favorites.length && !remote.visited?.length && Object.keys(remote.positions).length === 0) ? local : remote; setProgress(value); saveLocalProgress(value, false); } }).catch(() => { if (active) showNotice("Нет связи с сервером прогресса. Изменения пока сохраняются на устройстве."); }).finally(() => { if (active) setProgressReady(true); });
    return () => { active = false; };
  }, []);
  useEffect(() => {
    if (!progressReady) return;
    const timeout = setTimeout(() => { syncQueue.current = syncQueue.current.catch(() => {}).then(async () => { await putServerProgress(progress); acknowledgeProgress(progress); }).catch(() => showNotice("Не удалось сохранить прогресс на сервере. Копия осталась на этом устройстве.")); }, 900);
    return () => clearTimeout(timeout);
  }, [progress, progressReady]);
  useEffect(() => {
    if (!playback.placeId) return;
    dirtyProgress.current = true;
    setProgress(previous => { const next = { ...previous, positions: { ...previous.positions, [playback.placeId]: playback.position } }; saveLocalProgress(next); return next; });
  }, [playback.placeId, Math.floor(playback.position / 5), playback.playing]);

  function showNotice(message: string) { clearTimeout(noticeTimeout.current); setNotice(message); noticeTimeout.current = setTimeout(() => setNotice(""), 6500); }
  function go(target: Screen, id?: PlaceId) {
    if (target !== "waiting") pendingRequest.current?.abort();
    if (id) setPlaceId(id);
    setNotice(""); setSheet(undefined);
    location.hash = `/${target}${id ? `/${id}` : ""}`;
    setScreen(target);
    if (target === screen) window.scrollTo({ top: 0, behavior: "auto" });
  }
  function navigate(destination: Destination) { go(destination); }
  function openPlace(id: PlaceId) { go("place", id); }
  function chooseRoute(route: ThemeRoute) { if (!route.placeIds?.length) return showNotice("Остановки этой прогулки ещё проверяются."); setRoutePlaceIds(route.placeIds); setRouteTitle(route.title.replace(/\n/g, " ")); setMapSelection(route.placeIds[0]!); go("map"); }
  function updateProgress(next: typeof progress) { dirtyProgress.current = true; setProgress(next); if (!saveLocalProgress(next)) showNotice("Браузер не разрешил сохранение. Изменения доступны до закрытия страницы."); }
  async function sendQuestion(text: string) {
    pendingRequest.current?.abort();
    if (answer) setTurns(previous => [...previous, { question, answer: answer.message }].slice(-7));
    setQuestion(text); setAnswer(undefined); setChatError(""); go("waiting");
    const controller = new AbortController(); pendingRequest.current = controller;
    try { const result = await askZilant(text, conversation, controller.signal); if (!controller.signal.aborted) { setAnswer(result); go("dialog"); } }
    catch (error) { if (!controller.signal.aborted) { setChatError(error instanceof Error ? error.message : "Нет связи с Зилантом. Попробуй ещё раз."); go("dialog"); } }
  }

  const place = catalog?.places.find(p => p.id === placeId) ?? catalog?.places[0];
  const chat = screen === "zilant" || screen === "dialog" || screen === "waiting";
  const current: Destination = chat ? "zilant" : screen === "map" || screen === "routes" || screen === "profile" ? screen : "home";
  const withNavigation = screen !== "place" && screen !== "player";

  return <div className={`app-shell platform-${platform} screen-${screen} ${screen === "home" ? "" : "additional-screen"}`}>
    {content && catalog && place ? <>
      {screen === "home" && <HomePage content={content} onNavigate={navigate} />}
      {screen === "map" && <Suspense fallback={<main className="map-page content-state" aria-busy="true"><p>Загружаем карту…</p></main>}><MapPage places={catalog.places} selected={mapSelection} routePlaceIds={routePlaceIds} routeTitle={routeTitle} onSelect={setMapSelection} onOpen={openPlace} onListen={id => go("player", id)} onFilters={() => setSheet("map-filters")} notice={showNotice} /></Suspense>}
      {screen === "place" && <PlacePage place={place} visited={progress.visited?.includes(place.id) ?? false} onVisit={() => updateProgress({ ...progress, visited: progress.visited?.includes(place.id) ? progress.visited.filter(id => id !== place.id) : [...(progress.visited ?? []), place.id] })} favorite={progress.favorites.includes(place.id)} onFavorite={() => updateProgress({ ...progress, favorites: progress.favorites.includes(place.id) ? progress.favorites.filter(id => id !== place.id) : [...progress.favorites, place.id] })} onBack={() => { setMapSelection(place.id); go("map"); }} onListen={() => go("player", place.id)} />}
      {screen === "player" && <PlayerPage key={place.id} place={place} position={progress.positions[place.id] ?? 0} onPosition={seconds => updateProgress({ ...progress, positions: { ...progress.positions, [place.id]: seconds } })} onBack={() => go("place", place.id)} onMap={() => { setMapSelection(place.id); go("map"); }} onMore={() => setSheet("player-actions")} notice={showNotice} />}
      {screen === "routes" && <RoutesPage routes={catalog.routes} onSelect={chooseRoute} onZilant={() => go("zilant")} />}
      {screen === "profile" && <ProfilePage onOpen={setSheet} />}
      {chat && <ZilantPage key={screen} mode={screen as "zilant" | "dialog" | "waiting"} question={question} answer={answer} routePhoto={catalog.places.find(p => answer?.placeIds.includes(p.id) && p.photo)?.photo} error={chatError} turns={turns} onSend={sendQuestion} onNew={() => { setQuestion(""); setAnswer(undefined); setTurns([]); setChatError(""); setConversation(crypto.randomUUID()); go("zilant"); }} onStop={() => { pendingRequest.current?.abort(); go("zilant"); showNotice("Ожидание ответа остановлено."); }} onMap={() => { if (!answer?.placeIds.length) return; setRoutePlaceIds(answer.placeIds); setRouteTitle(answer.routeTitle); setMapSelection(answer.placeIds[0]!); go("map"); }} onAlternative={() => go("routes")} />}
    </> : <main className="content-state" aria-busy={!failed}><h1>{failed ? "Не получилось загрузить приложение" : "Загружаем Казань…"}</h1>{failed && <><p>Попробуй ещё раз.</p><button type="button" onClick={() => setAttempt(value => value + 1)}>Повторить</button></>}</main>}
    {withNavigation && <><div className="navigation-gap" aria-hidden="true" /><BottomNavigation current={current} onNavigate={navigate} /></>}
    <div className="notice-region" role="status" aria-live="polite" aria-atomic="true">{notice && <div className="notice"><span>{notice}</span><button type="button" aria-label="Закрыть сообщение" onClick={() => setNotice("")}>×</button></div>}</div>
    {sheet && catalog && place && <DetailSheet title={sheetTitles[sheet]} onClose={() => setSheet(undefined)}>
      {sheet === "favorites" ? <>{catalog.places.filter(p => progress.favorites.includes(p.id)).map(p => <button className="saved-place-row" key={p.id} type="button" onClick={() => openPlace(p.id)}>{p.photo && <OriginalAsset asset={p.photo} alt={p.title} />}<span>{p.title}</span><OriginalAsset asset="profile.imgArrowRight" /></button>)}{!progress.favorites.length && <p>Пока ничего нет. Сохрани понравившееся место с помощью закладки.</p>}</>
        : sheet === "map-filters" ? <><p>В каталоге {catalog.places.length} мест. Выбери место, чтобы открыть его карточку.</p>{catalog.places.map(p => <button key={p.id} type="button" className="sheet-option" onClick={() => openPlace(p.id)}>{p.title}</button>)}</>
        : sheet === "player-actions" ? <><button className="sheet-option" type="button" onClick={() => openPlace(place.id)}>Открыть место</button><p>{place.audioUrl ? "Готовая аудиоистория. Позиция сохраняется, пока ты гуляешь по Казани." : "Готовая аудиозапись для этого места ещё не загружена."}</p></>
        : sheet === "awards" ? <><div className="sheet-medal"><OriginalAsset asset="profile.imgFrame" /></div><p>Ты отметил посещение {progress.visited?.length ?? 0} мест.</p>{catalog.places.filter(p => progress.visited?.includes(p.id)).map(p => <p key={p.id}>{p.title}</p>)}<p>Правила выдачи наград ещё согласуются.</p></>
        : sheet === "offline" ? <><p>Скачанных маршрутов пока нет.</p><p>Полноценная загрузка карты, текстов, фотографий и аудио ещё не подключена.</p><button className="primary-action" type="button" onClick={() => go("routes")}>Выбрать маршрут</button></>
        : sheet === "account" ? <><p>Ты знакомишься с Казанью как гость.</p><p>Избранное, посещения и позиция истории сохраняются на устройстве и сервере для этой гостевой сессии. Вход по email и объединение устройств ещё не подключены.</p></>
        : <><p>Казань · Русский язык</p><p>Рабочая демоверсия: интерактивная карта и Зилант через OpenAI.</p><button className="sheet-option" type="button" onClick={() => setSheet("account")}>Аккаунт и синхронизация</button></>}
    </DetailSheet>}
  </div>;
}
