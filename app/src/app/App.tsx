import { useEffect, useRef, useState } from "react";
import type { Destination, HomeContent, HomeRepository } from "../domain/home";
import { localHomeRepository } from "../data/localHomeRepository";
import { platformKind } from "../platform/runtime";
import { HomePage } from "../features/home/HomePage";
import { BottomNavigation } from "../components/BottomNavigation";
export function App({
  repository = localHomeRepository,
}: {
  repository?: HomeRepository;
}) {
  const [content, setContent] = useState<HomeContent>();
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [notice, setNotice] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => {
    const controller = new AbortController();
    setFailed(false);
    repository
      .getHome(controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) setContent(data);
      })
      .catch(() => {
        if (!controller.signal.aborted) setFailed(true);
      });
    return () => controller.abort();
  }, [repository, attempt]);
  useEffect(() => () => clearTimeout(timer.current), []);
  function navigate(destination: Destination) {
    clearTimeout(timer.current);
    if (destination === "home") {
      setNotice(false);
      window.scrollTo({ top: 0, behavior: "instant" });
      return;
    }
    setNotice(true);
    timer.current = setTimeout(() => setNotice(false), 4500);
  }
  return (
    <div className={`app-shell platform-${platformKind}`}>
      {content ? (
        <HomePage content={content} onNavigate={navigate} />
      ) : failed ? (
        <main className="load-state">
          <h1>Не получилось загрузить главную</h1>
          <p>Попробуй ещё раз.</p>
          <button
            type="button"
            className="retry-button"
            onClick={() => setAttempt((x) => x + 1)}
          >
            Повторить
          </button>
        </main>
      ) : (
        <main
          className="load-state"
          aria-label="Загрузка главной"
          aria-busy="true"
        >
          <div className="loading-block" />
          <p>Город скоро появится…</p>
        </main>
      )}
      <div
        className="notice-slot"
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        {notice && (
          <div className="notice">
            <span>Раздел в разработке</span>
            <button
              type="button"
              onClick={() => setNotice(false)}
              aria-label="Закрыть сообщение"
            >
              ×
            </button>
          </div>
        )}
      </div>
      <BottomNavigation onNavigate={navigate} />
    </div>
  );
}
