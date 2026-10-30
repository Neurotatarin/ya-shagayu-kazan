import { useState } from "react";
import { OriginalAsset, ZilantAvatar } from "../../components/OriginalAsset";
import { LayeredArt } from "../../components/LayeredArt";
import type { ZilantAnswer } from "../../domain/demo";
import type { AssetKey } from "../../data/figmaAssets";

export type ChatMode = "zilant" | "dialog" | "waiting";

export function ZilantPage({ mode, question, answer, routePhoto, error, turns, onSend, onNew, onStop, onMap, onAlternative }: { mode: ChatMode; question: string; answer?: ZilantAnswer; routePhoto?: AssetKey; error: string; turns: { question: string; answer: string }[]; onSend: (text: string) => void; onNew: () => void; onStop: () => void; onMap: () => void; onAlternative: () => void }) {
  const [draft, setDraft] = useState("");
  const waiting = mode === "waiting";
  const send = () => { const value = draft.trim(); if (value) { onSend(value); setDraft(""); } };
  return <main className={`chat-page chat-${mode}`} data-figma-node={mode === "zilant" ? "9:3048" : waiting ? "38:6309" : "9:3617"}>
    <header className="chat-header"><div className="chat-avatar"><ZilantAvatar /></div><div><h1>Зилант</h1><p>Чат о Казани</p></div><button className="round-action new-chat" type="button" aria-label="Новый разговор" onClick={onNew}><OriginalAsset asset="dialog.imgFrame" /></button></header>
    {mode === "zilant" ? <>
      <div className="greeting-figure" role="img" aria-label="Зилант приветствует тебя"><LayeredArt name="greeting" /></div>
      <h2 className="greeting-title">Привет!<br />О чём поговорим?</h2><p className="greeting-description">Расскажу о месте или помогу<br />придумать прогулку по Казани.</p>
      <div className="chat-prompts">
        <button type="button" onClick={() => onSend("У меня час. Что посмотреть рядом с Кремлём?")}><OriginalAsset asset="zilant-prompt.imgFrame" /><span>Куда пойти на час?</span><OriginalAsset asset="zilant-prompt.imgArrowUpRight" /></button>
        <button type="button" onClick={() => onSend("Что интересного рядом? Подбери прогулку рядом с Кремлём.")}><OriginalAsset asset="zilant-nearby.imgFrame" /><span>Что интересного рядом?</span><OriginalAsset asset="zilant-nearby.imgArrowUpRight" /></button>
        <button type="button" onClick={() => onSend("Расскажи про это место — Дом Ушковой.")}><OriginalAsset asset="zilant-place-prompt.imgHeadphones" /><span>Расскажи про это место</span><OriginalAsset asset="zilant-place-prompt.imgArrowUpRight" /></button>
      </div>
    </> : waiting ? <div className="waiting-content" aria-busy="true">
      <div className="question-bubble">{question || "Спроси Зиланта о Казани"}</div>
      <OriginalAsset asset="waiting.img" className="waiting-figure" alt="Зилант собирает прогулку" />
      <div className="waiting-status"><h2>Собираю прогулку…</h2><p>Подбираю места под твой запрос</p></div>
      <button className="stop-request" type="button" onClick={onStop}>Остановить</button>
    </div> : <div className="conversation">
      <p className="chat-date">Сегодня</p>
      {turns.map((turn, index) => <div key={index} className="previous-chat-turn"><div className="question-bubble">{turn.question}</div><div className="answer-row"><ZilantAvatar small /><div className="answer-bubble"><p>{turn.answer}</p></div></div></div>)}
      {question && <div className="question-bubble">{question}</div>}
      <div className="answer-row"><ZilantAvatar small /><div className="answer-bubble"><p>{answer?.message || error || "Спроси меня о Казани — помогу выбрать места и прогулку."}</p>{error && <button type="button" onClick={() => onSend(question)}>Повторить запрос</button>}</div></div>
      {answer && answer.placeIds.length >= 2 && <>
        <section className="chat-route-card" aria-label={answer.routeTitle}>{routePhoto ? <OriginalAsset asset={routePhoto} alt="Место на прогулке" /> : <span className="route-photo-pending">Фото мест<br />скоро</span>}<div><h2>{answer.routeTitle}</h2><p>{answer.placeIds.length} мест · пешком</p><button className="primary-action" type="button" onClick={onMap}><OriginalAsset asset="dialog.imgArrowUpRight" /><span>Посмотреть</span></button></div></section>
        <div className="chat-route-actions"><button type="button" onClick={onMap}><OriginalAsset asset="dialog.imgMapTrifold1" /><span>На карте</span></button><button type="button" onClick={onAlternative}>Другой вариант</button></div>
      </>}
    </div>}
    <form className="chat-composer" onSubmit={event => { event.preventDefault(); send(); }}><input aria-label="Сообщение Зиланту" placeholder={waiting ? "Зилант готовит ответ…" : "Спроси Зиланта…"} disabled={waiting} maxLength={1000} value={draft} onChange={event => setDraft(event.target.value)} /><button type="submit" aria-label="Отправить сообщение" disabled={waiting || !draft.trim()}><OriginalAsset asset="dialog.imgFrame1" /></button></form>
  </main>;
}
