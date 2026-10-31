import { t, useI18n, type Language } from "../i18n";
import { lazy, Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { localizeCatalog, localizeHome } from "../i18n/catalog";
import { LanguageControl } from "../components/LanguageControl";
import type { Destination, HomeContent, HomeRepository } from "../domain/home";
import { readScreen, type DemoCatalog, type PlaceId, type Screen, type ThemeRoute, type ZilantAnswer, type WalkingRoute } from "../domain/demo";
import type { OfflinePackage } from "../domain/offline";
import { localHomeRepository } from "../data/homeRepository";
import { apiCatalogRepository, askZilant, getServerProgress, putServerProgress } from "../data/api";
import { HomePage } from "../features/home/HomePage";
import { PlacePage } from "../features/place/PlacePage";
import { PlayerPage } from "../features/player/PlayerPage";
import { MiniPlayer } from "../features/player/MiniPlayer";
import { RoutesPage } from "../features/routes/RoutesPage";
import { ProfilePage, type ProfileSheet } from "../features/profile/ProfilePage";
import { ZilantPage } from "../features/zilant/ZilantPage";
import { BottomNavigation } from "../components/BottomNavigation";
import { DetailSheet } from "../components/DetailSheet";
import { PlacePhoto, hasPlacePhoto } from "../components/PlacePhoto";
import { OriginalAsset } from "../components/OriginalAsset";
import { platform } from "../platform/runtime";
import { acknowledgeProgress, audioPosition, withAudioPosition, hasPendingProgress, loadLocalProgress, saveLocalProgress } from "../platform/localProgress";
import { clearAudioForLanguageChange, closeAudio, useAudioPlayback } from "../platform/audioPlayback";
import { backgroundMusic } from "../data/backgroundMusic";
import { hasDownloadedAudio, nativeDownloads, nativeOnline, removeOffline, useOfflineState } from "../platform/offlineStore";
import { OfflineDownloadSheet, OfflineSavedPackages, type OfflineContext } from "../features/offline/OfflineDownloadSheet";

type Sheet = ProfileSheet | "map-filters" | "player-actions";
const sheetTitles: Record<Sheet, string> = { favorites: "Избранное", offline: "Офлайн-маршруты", settings: "Настройки", awards: "Награды", account: "Твоя Казань", "map-filters": "Фильтры карты", "player-actions": "Аудиоистория" };
const MapPage = lazy(() => import("../features/map/MapPage").then(module => ({ default: module.MapPage })));

export function App({ repository = localHomeRepository }: { repository?: HomeRepository }) {
  const { language } = useI18n();
  const downloads = useOfflineState();
  const [sourceContent, setContent] = useState<HomeContent>();
  const [sourceCatalog, setCatalog] = useState<DemoCatalog>();
  const content = useMemo(() => sourceContent && localizeHome(sourceContent, language), [sourceContent, language]);
  const catalog = useMemo(() => {
    if (!sourceCatalog) return undefined;
    const localized = localizeCatalog(sourceCatalog, language);
    return nativeDownloads && !downloads.connected ? { ...localized, places: localized.places.map(place => ({ ...place, audioOfflineMissing: !!place.audioUrl && !hasDownloadedAudio(place.audioUrl) })) } : localized;
  }, [sourceCatalog, language, downloads.connected, downloads.packages]);
  const [languageOpen, setLanguageOpen] = useState(false);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [screen, setScreen] = useState<Screen>(() => readScreen(location.hash));
  const [placeId, setPlaceId] = useState<PlaceId>(() => location.hash.split("/")[2] || "ushkova");
  const [mapSelection, setMapSelection] = useState<PlaceId>();
  const [mapQuiet, setMapQuiet] = useState(false);
  const [progress, setProgress] = useState(loadLocalProgress);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<ZilantAnswer>();
  const [chatError, setChatError] = useState("");
  const [conversation, setConversation] = useState(() => crypto.randomUUID());
  const [turns, setTurns] = useState<{ question: string; answer: string }[]>([]);
  const [routePlaceIds, setRoutePlaceIds] = useState<PlaceId[]>([]);
  const [routeTitle, setRouteTitle] = useState(t("Кремль и Кремлёвская улица"));
  const [progressReady, setProgressReady] = useState(false);
  const [sheet, setSheet] = useState<Sheet>();
  const [offlineContext, setOfflineContext] = useState<OfflineContext>();
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
    function onHashChange() { setScreen(readScreen(location.hash)); const id = location.hash.split("/")[2]; if (id && /^[a-z][a-z0-9-]{0,50}$/.test(id)) setPlaceId(id); setSheet(undefined); setOfflineContext(undefined); }
    window.addEventListener("hashchange", onHashChange);
    return () => { window.removeEventListener("hashchange", onHashChange); clearTimeout(noticeTimeout.current); pendingRequest.current?.abort(); };
  }, []);
  useLayoutEffect(() => { window.scrollTo({ top: 0, behavior: "auto" }); setMapQuiet(false); }, [screen]);
  useEffect(() => { if (screen !== "waiting") pendingRequest.current?.abort(); }, [screen]);
  useEffect(() => {
    let active = true;
    getServerProgress().then(remote => { if (active && !dirtyProgress.current) { const local = loadLocalProgress(); const value = hasPendingProgress() || (!remote.favorites.length && !remote.visited?.length && Object.keys(remote.positions).length === 0) ? local : remote; setProgress(value); saveLocalProgress(value, false); } }).catch(() => { if (active) showNotice(t("Нет связи с сервером прогресса. Изменения пока сохраняются на устройстве.")); }).finally(() => { if (active) setProgressReady(true); });
    return () => { active = false; };
  }, []);
  useEffect(() => {
    if (!progressReady || !nativeOnline()) return;
    const timeout = setTimeout(() => { syncQueue.current = syncQueue.current.catch(() => {}).then(async () => { await putServerProgress(progress); acknowledgeProgress(progress); }).catch(() => showNotice(t("Не удалось сохранить прогресс на сервере. Копия осталась на этом устройстве."))); }, 900);
    return () => clearTimeout(timeout);
  }, [progress, progressReady, downloads.connected]);
  useEffect(() => {
    if (!playback.placeId) return;
    dirtyProgress.current = true;
    setProgress(previous => { const next = withAudioPosition(previous, playback.placeId, playback.language, playback.position); saveLocalProgress(next); return next; });
  }, [playback.placeId, playback.language, Math.floor(playback.position / 5), playback.playing]);
  useEffect(() => { if (playback.placeId && playback.language !== language) void clearAudioForLanguageChange(); }, [language, playback.placeId, playback.language]);

  function showNotice(message: string) { clearTimeout(noticeTimeout.current); setNotice(message); noticeTimeout.current = setTimeout(() => setNotice(""), 6500); }
  function go(target: Screen, id?: PlaceId) {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    if (target !== "waiting") pendingRequest.current?.abort();
    if (id) setPlaceId(id);
    setNotice(""); setSheet(undefined); setOfflineContext(undefined); setLanguageOpen(false);
    location.hash = `/${target}${id ? `/${id}` : ""}`;
    setScreen(target);
    if (target === screen) window.scrollTo({ top: 0, behavior: "auto" });
  }
  function navigate(destination: Destination) { go(destination); }
  useEffect(() => {
    if (platform !== "android") return;
    const host = window as Window & { kazanAndroidBack?: () => boolean };
    host.kazanAndroidBack = () => {
      if (offlineContext) setOfflineContext(undefined);
      else if (sheet) setSheet(undefined);
      else if (languageOpen) setLanguageOpen(false);
      else if (screen === "map" && mapQuiet) setMapQuiet(false);
      else if (screen === "player") go("map");
      else if (screen === "place") go("map");
      else if (screen !== "home") go("home");
      else return false;
      return true;
    };
    return () => { delete host.kazanAndroidBack; };
  }, [screen, sheet, offlineContext, languageOpen, mapQuiet]);
  function openPlace(id: PlaceId) { go("place", id); }
  function chooseRoute(route: ThemeRoute) { if (!route.placeIds?.length) return showNotice(t("Остановки этой прогулки ещё проверяются.")); setRoutePlaceIds(route.placeIds); setRouteTitle(sourceCatalog?.routes.find(item => item.id === route.id)?.title ?? route.title); setMapSelection(undefined); go("map"); }
  function updateProgress(next: typeof progress) { dirtyProgress.current = true; setProgress(next); if (!saveLocalProgress(next)) showNotice(t("Браузер не разрешил сохранение. Изменения доступны до закрытия страницы.")); }
  function changeLanguage(_next: Language) {
    if (playback.placeId) updateProgress(withAudioPosition(progress, playback.placeId, playback.language, playback.position));
    void clearAudioForLanguageChange();
    if (screen === "waiting") { pendingRequest.current?.abort(); setChatError("Язык изменён. Отправь вопрос ещё раз."); go("dialog"); }
  }
  function closeExcursion() {
    if (playback.placeId) {
      dirtyProgress.current = true;
      setProgress(previous => { const next = withAudioPosition(previous, playback.placeId, playback.language, playback.position); saveLocalProgress(next); return next; });
    }
    void closeAudio().catch(() => showNotice(t("Не удалось закрыть экскурсию. Попробуй ещё раз.")));
  }
  function openDownloaded(pack: OfflinePackage) {
    if (pack.kind === "city-map") { setRoutePlaceIds([]); setRouteTitle(""); setMapSelection(undefined); go("map"); }
    else if (pack.route) { setRoutePlaceIds(pack.placeIds); setRouteTitle(pack.title); setMapSelection(undefined); go("map"); }
    else { setRoutePlaceIds([]); go("player", pack.placeIds[0]); }
  }
  async function removeDownloaded(pack: OfflinePackage) {
    if (pack.kind !== "city-map" && pack.language === playback.language && pack.placeIds.includes(playback.placeId)) {
      updateProgress(withAudioPosition(progress, playback.placeId, playback.language, playback.position));
      await closeAudio();
    }
    await removeOffline(pack.id);
  }
  async function downloadRoute(route: WalkingRoute) {
    if (!sourceCatalog) return;
    const bytes = new TextEncoder().encode(route.placeIds.join(","));
    const hash = [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))].slice(0, 8).map(value => value.toString(16).padStart(2, "0")).join("");
    setOfflineContext({ id: "route-" + hash, title: catalog?.routes.find(item => item.placeIds?.join(",") === route.placeIds.join(","))?.title ?? routeTitle, language, placeIds: route.placeIds, catalog: sourceCatalog, route });
  }
  async function sendQuestion(text: string) {
    pendingRequest.current?.abort();
    if (answer) setTurns(previous => [...previous, { question, answer: answer.message }].slice(-7));
    setQuestion(text); setAnswer(undefined); setChatError(""); go("waiting");
    const controller = new AbortController(); pendingRequest.current = controller;
    try { const result = await askZilant(text, conversation, controller.signal, language); if (!controller.signal.aborted) { setAnswer(result); go("dialog"); } }
    catch (error) { if (!controller.signal.aborted) { setChatError(error instanceof Error ? error.message : t("Нет связи с Зилантом. Попробуй ещё раз.")); go("dialog"); } }
  }

  const place = catalog?.places.find(p => p.id === placeId) ?? catalog?.places[0];
  const chat = screen === "zilant" || screen === "dialog" || screen === "waiting";
  const current: Destination = chat ? "zilant" : screen === "map" || screen === "routes" || screen === "profile" ? screen : "home";
  const withNavigation = screen !== "place" && screen !== "player";
  const playingPlace = catalog?.places.find(p => p.id === playback.placeId && p.audioLanguage === playback.language);
  const showMiniPlayer = !!playingPlace && (screen !== "player" || place?.id !== playback.placeId);

  return <div className={`app-shell platform-${platform} screen-${screen} ${screen === "home" ? "" : "additional-screen"} ${showMiniPlayer ? `has-mini-player ${withNavigation ? "" : "mini-player-without-navigation"}` : ""} ${screen === "map" && mapQuiet ? "map-chrome-hidden" : ""}`}>
    {content && catalog && place ? <>
      {screen === "home" && <HomePage content={content} onNavigate={navigate} />}
      {screen === "map" && <Suspense fallback={<main className="map-page content-state" aria-busy="true"><p>{t("Загружаем карту…")}</p></main>}><MapPage places={catalog.places} selected={mapSelection} routePlaceIds={routePlaceIds} routeTitle={(catalog.routes.find(item => item.placeIds?.join(",") === routePlaceIds.join(","))?.title ?? t(routeTitle)).replace(/\n/g, " ")} quiet={mapQuiet} onQuietChange={setMapQuiet} onSelect={setMapSelection} onOpen={openPlace} onListen={id => go("player", id)} onFilters={() => setSheet("map-filters")} onDownload={route => { void downloadRoute(route).catch(() => showNotice(t("Не удалось подготовить офлайн-пакет. Попробуй ещё раз."))); }} notice={showNotice} /></Suspense>}
      {screen === "place" && <PlacePage place={place} visited={progress.visited?.includes(place.id) ?? false} onVisit={() => updateProgress({ ...progress, visited: progress.visited?.includes(place.id) ? progress.visited.filter(id => id !== place.id) : [...(progress.visited ?? []), place.id] })} favorite={progress.favorites.includes(place.id)} onFavorite={() => updateProgress({ ...progress, favorites: progress.favorites.includes(place.id) ? progress.favorites.filter(id => id !== place.id) : [...progress.favorites, place.id] })} onBack={() => { setMapSelection(place.id); go("map"); }} onListen={() => go("player", place.id)} />}
      {screen === "player" && <PlayerPage key={place.id} place={place} position={audioPosition(progress, place.id, language)} onPosition={seconds => updateProgress(withAudioPosition(progress, place.id, language, seconds))} onBack={() => go("place", place.id)} onMap={() => { setMapSelection(place.id); go("map"); }} onMore={() => setSheet("player-actions")} onOffline={() => { if (sourceCatalog) setOfflineContext({ id: "place-" + place.id, title: place.title, language, placeIds: [place.id], catalog: sourceCatalog }); }} notice={showNotice} />}
      {screen === "routes" && <RoutesPage routes={catalog.routes} onSelect={chooseRoute} onZilant={() => go("zilant")} />}
      {screen === "profile" && <ProfilePage onOpen={setSheet} />}
      {chat && <ZilantPage key={screen} mode={screen as "zilant" | "dialog" | "waiting"} question={question} answer={answer} routePlace={catalog.places.find(p => answer?.placeIds.includes(p.id) && hasPlacePhoto(p))} error={chatError} turns={turns} onSend={sendQuestion} onNew={() => { setQuestion(""); setAnswer(undefined); setTurns([]); setChatError(""); setConversation(crypto.randomUUID()); go("zilant"); }} onStop={() => { pendingRequest.current?.abort(); go("zilant"); showNotice(t("Ожидание ответа остановлено.")); }} onMap={() => { if (!answer?.placeIds.length) return; setRoutePlaceIds(answer.placeIds); setRouteTitle(answer.routeTitle); setMapSelection(undefined); go("map"); }} onAlternative={() => go("routes")} />}
    </> : <main className="content-state" aria-busy={!failed}><h1>{failed ? t("Не получилось загрузить приложение") : t("Загружаем Казань…")}</h1>{failed && <><p>{t("Попробуй ещё раз.")}</p><button type="button" onClick={() => setAttempt(value => value + 1)}>{t("Повторить")}</button></>}</main>}
    {withNavigation && <div className="navigation-gap" aria-hidden="true" />}
    {showMiniPlayer && playingPlace && <MiniPlayer place={playingPlace} compact={screen === "map"} onOpen={() => go("player", playingPlace.id)} onClose={closeExcursion} notice={showNotice} />}
    {withNavigation && <BottomNavigation current={current} onNavigate={navigate} concealed={screen === "map" && mapQuiet} />}
    <LanguageControl concealed={screen === "map" && mapQuiet} open={languageOpen} onOpen={() => { setSheet(undefined); setOfflineContext(undefined); setLanguageOpen(true); }} onClose={() => setLanguageOpen(false)} onChange={changeLanguage} />
    <div className="notice-region" role="status" aria-live="polite" aria-atomic="true">{notice && <div className="notice"><span>{t(notice)}</span><button type="button" aria-label={t("Закрыть сообщение")} onClick={() => setNotice("")}>×</button></div>}</div>
    {sheet && catalog && place && <DetailSheet title={t(sheetTitles[sheet])} onClose={() => setSheet(undefined)}>
      {sheet === "favorites" ? <>{catalog.places.filter(p => progress.favorites.includes(p.id)).map(p => <button className="saved-place-row" key={p.id} type="button" onClick={() => openPlace(p.id)}>{hasPlacePhoto(p) && <PlacePhoto place={p} />}<span>{p.title}</span><OriginalAsset asset="profile.imgArrowRight" /></button>)}{!progress.favorites.length && <p>{t("Пока ничего нет. Сохрани понравившееся место с помощью закладки.")}</p>}</>
        : sheet === "map-filters" ? <><p>{t("В каталоге {0} мест. Выбери место, чтобы открыть его карточку.", {0: catalog.places.length})}</p>{catalog.places.map(p => <button key={p.id} type="button" className="sheet-option" onClick={() => openPlace(p.id)}>{p.title}</button>)}</>
        : sheet === "player-actions" ? <><button className="sheet-option" type="button" onClick={() => openPlace(place.id)}>{t("Открыть место")}</button><p>{place.audioUrl ? t("Готовая аудиоистория. Позиция сохраняется, пока ты гуляешь по Казани.") : t("Готовая аудиозапись для этого места ещё не загружена.")}</p><p>{t("Музыкальный фон включается кнопкой «Фон» и играет только вместе с рассказом.")}</p><p className="music-credit">«{backgroundMusic.title}» — {backgroundMusic.author} (<a href={backgroundMusic.sourceUrl} target="_blank" rel="noreferrer">incompetech.com</a>{t("). Лицензия")} <a href={backgroundMusic.licenseUrl} target="_blank" rel="noreferrer">{backgroundMusic.license}</a>{t(". Оригинальная запись; при воспроизведении уменьшена громкость и включён повтор.")}</p></>
        : sheet === "awards" ? <><div className="sheet-medal"><OriginalAsset asset="profile.imgFrame" /></div><p>{t("Ты отметил посещение {0} мест.", {0: progress.visited?.length ?? 0})}</p>{catalog.places.filter(p => progress.visited?.includes(p.id)).map(p => <p key={p.id}>{p.title}</p>)}<p>{t("Правила выдачи наград ещё согласуются.")}</p></>
        : sheet === "offline" ? <OfflineSavedPackages onOpen={openDownloaded} onRemove={removeDownloaded} onChoose={() => go("routes")} onCity={() => { if (sourceCatalog) { setSheet(undefined); setOfflineContext({ id: "kazan-city-map", title: t("Карта Казани"), language, placeIds: sourceCatalog.places.map(place => place.id), catalog: sourceCatalog, cityOnly: true }); } }} />
        : sheet === "account" ? <><p>{t("Ты знакомишься с Казанью как гость.")}</p><p>{t("Избранное, посещения и позиция истории сохраняются на устройстве и сервере для этой гостевой сессии. Вход по email и объединение устройств ещё не подключены.")}</p></>
        : <><p>{t("Казань · Русский язык")}</p><p>{t("Рабочая демоверсия: интерактивная карта и Зилант через OpenAI.")}</p><button className="sheet-option" type="button" onClick={() => setSheet("account")}>{t("Аккаунт и синхронизация")}</button></>}
    </DetailSheet>}
    {offlineContext && <OfflineDownloadSheet context={offlineContext} onClose={() => setOfflineContext(undefined)} onOpen={openDownloaded} onRemove={removeDownloaded} />}
  </div>;
}
