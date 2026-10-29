import { useEffect, useRef, useState } from "react";
import type { Destination, HomeContent, HomeRepository } from "../domain/home";
import { localHomeRepository } from "../data/homeRepository";
import { HomePage } from "../features/home/HomePage";
import { BottomNavigation } from "../components/BottomNavigation";
import { platform } from "../platform/runtime";

export function App({ repository = localHomeRepository }: { repository?: HomeRepository }) {
  const [content, setContent] = useState<HomeContent>();
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [notice, setNotice] = useState(false);
  const timeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    const controller = new AbortController();
    setFailed(false);
    repository.getHome(controller.signal).then((result) => {
      if (!controller.signal.aborted) setContent(result);
    }).catch(() => { if (!controller.signal.aborted) setFailed(true); });
    return () => controller.abort();
  }, [repository, attempt]);
  useEffect(() => () => clearTimeout(timeout.current), []);

  function navigate(destination: Destination) {
    clearTimeout(timeout.current);
    if (destination === "home") {
      setNotice(false);
      window.scrollTo({ top: 0, behavior: "auto" });
      return;
    }
    setNotice(true);
    timeout.current = setTimeout(() => setNotice(false), 5000);
  }

  return (
    <div className={`app-shell platform-${platform}`}>
      {content ? <HomePage content={content} onNavigate={navigate} /> : (
        <main className="content-state" aria-busy={!failed}>
          <h1>{failed ? "Не получилось загрузить главную" : "Загружаем главную…"}</h1>
          {failed && <><p>Попробуй ещё раз.</p><button type="button" onClick={() => setAttempt((value) => value + 1)}>Повторить</button></>}
        </main>
      )}
      <div className="navigation-gap" aria-hidden="true" />
      <BottomNavigation onNavigate={navigate} />
      <div className="notice-region" role="status" aria-live="polite" aria-atomic="true">
        {notice && <div className="notice"><span>Раздел в разработке</span><button type="button" aria-label="Закрыть сообщение" onClick={() => setNotice(false)}>×</button></div>}
      </div>
    </div>
  );
}
