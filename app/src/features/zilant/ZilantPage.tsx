import { t } from "../../i18n";
import { useState } from "react";
import { OriginalAsset, ZilantAvatar } from "../../components/OriginalAsset";
import { LayeredArt } from "../../components/LayeredArt";
import { countPlaces, type ZilantAnswer } from "../../domain/demo";
import type { Place } from "../../domain/demo";
import { PlacePhoto } from "../../components/PlacePhoto";

export type ChatMode = "zilant" | "dialog" | "waiting";

export function ZilantPage({ mode, question, answer, routePlace, error, turns, onSend, onNew, onStop, onMap, onAlternative }: { mode: ChatMode; question: string; answer?: ZilantAnswer; routePlace?: Place; error: string; turns: { question: string; answer: string }[]; onSend: (text: string) => void; onNew: () => void; onStop: () => void; onMap: () => void; onAlternative: () => void }) {
  const [draft, setDraft] = useState("");
  const waiting = mode === "waiting";
  const send = () => { const value = draft.trim(); if (value) { onSend(value); setDraft(""); } };
  return <main className={`chat-page chat-${mode}`} data-figma-node={mode === "zilant" ? "9:3048" : waiting ? "38:6309" : "9:3617"}>
    <header className="chat-header"><div className="chat-avatar"><ZilantAvatar /></div><div><h1>{t("Зилант")}</h1><p>{t("Чат о Казани")}</p></div><button className="round-action new-chat" type="button" aria-label={t("Новый разговор")} onClick={onNew}><OriginalAsset asset="dialog.imgFrame" /></button></header>
    {mode === "zilant" ? <>
      <div className="greeting-figure" role="img" aria-label={t("Зилант приветствует тебя")}><LayeredArt name="greeting" /></div>
      <h2 className="greeting-title">{t("Привет!")}<br />{t("О чём поговорим?")}</h2><p className="greeting-description">{t("Расскажу о месте или помогу")}<br />{t("придумать прогулку по Казани.")}</p>
      <div className="chat-prompts">
        <button type="button" onClick={() => onSend(t("У меня час. Что посмотреть рядом с Кремлём?"))}><OriginalAsset asset="zilant-prompt.imgFrame" /><span>{t("Куда пойти на час?")}</span><OriginalAsset asset="zilant-prompt.imgArrowUpRight" /></button>
        <button type="button" onClick={() => onSend(t("Что интересного рядом? Подбери прогулку рядом с Кремлём."))}><OriginalAsset asset="zilant-nearby.imgFrame" /><span>{t("Что интересного рядом?")}</span><OriginalAsset asset="zilant-nearby.imgArrowUpRight" /></button>
        <button type="button" onClick={() => onSend(t("Расскажи про это место — Дом Ушковой."))}><OriginalAsset asset="zilant-place-prompt.imgHeadphones" /><span>{t("Расскажи про это место")}</span><OriginalAsset asset="zilant-place-prompt.imgArrowUpRight" /></button>
      </div>
    </> : waiting ? <div className="waiting-content" aria-busy="true">
      <div className="question-bubble">{question || t("Спроси Зиланта о Казани")}</div>
      <OriginalAsset asset="waiting.img" className="waiting-figure" alt={t("Зилант собирает прогулку")} />
      <div className="waiting-status"><h2>{t("Собираю прогулку…")}</h2><p>{t("Подбираю места под твой запрос")}</p></div>
      <button className="stop-request" type="button" onClick={onStop}>{t("Остановить")}</button>
    </div> : <div className="conversation">
      <p className="chat-date">{t("Сегодня")}</p>
      {turns.map((turn, index) => <div key={index} className="previous-chat-turn"><div className="question-bubble">{turn.question}</div><div className="answer-row"><ZilantAvatar small /><div className="answer-bubble"><p>{turn.answer}</p></div></div></div>)}
      {question && <div className="question-bubble">{question}</div>}
      <div className="answer-row"><ZilantAvatar small /><div className="answer-bubble"><p>{answer?.message || (error && t(error)) || t("Спроси меня о Казани — помогу выбрать места и прогулку.")}</p>{error && <button type="button" onClick={() => onSend(question)}>{t("Повторить запрос")}</button>}</div></div>
      {answer && answer.placeIds.length >= 2 && <>
        <section className="chat-route-card" aria-label={answer.routeTitle}>{routePlace ? <PlacePhoto place={routePlace} alt={t("Место на прогулке")} /> : <span className="route-photo-pending">{t("Фото мест")}<br />{t("скоро")}</span>}<div><h2>{answer.routeTitle}</h2><p>{countPlaces(answer.placeIds.length)}{answer.walkingSeconds !== undefined ? t(" · {0} мин пешком", {0: Math.ceil(answer.walkingSeconds / 60)}) : t(" · пешком")}</p><button className="primary-action" type="button" onClick={onMap}><OriginalAsset asset="dialog.imgArrowUpRight" /><span>{t("Посмотреть")}</span></button></div></section>
        <div className="chat-route-actions"><button type="button" onClick={onMap}><OriginalAsset asset="dialog.imgMapTrifold1" /><span>{t("На карте")}</span></button><button type="button" onClick={onAlternative}>{t("Другой вариант")}</button></div>
      </>}
    </div>}
    <form className="chat-composer" onSubmit={event => { event.preventDefault(); send(); }}><input aria-label={t("Сообщение Зиланту")} placeholder={waiting ? t("Зилант готовит ответ…") : t("Спроси Зиланта…")} disabled={waiting} maxLength={1000} value={draft} onChange={event => setDraft(event.target.value)} /><button type="submit" aria-label={t("Отправить сообщение")} disabled={waiting || !draft.trim()}><OriginalAsset asset="dialog.imgFrame1" /></button></form>
  </main>;
}
