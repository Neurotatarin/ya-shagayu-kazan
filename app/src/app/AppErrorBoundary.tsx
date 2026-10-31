import { Component, type ReactNode } from "react";
import { t } from "../i18n";
import { platform } from "../platform/runtime";

export class AppErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() { return { failed: true }; }

  componentDidCatch(error: Error) {
    // Retain only an error category and bundled-code locations. Never persist
    // exception text, chat, coordinates, account data or full request URLs.
    const name = ["TypeError", "RangeError", "SyntaxError", "ChunkLoadError"].includes(error.name) ? error.name : "Error";
    const frames = error.stack?.match(/\/assets\/[\w.-]+\.js:\d+:\d+/g)?.slice(0, 4) ?? [];
    try { localStorage.setItem("kazan:runtime-error:v1", JSON.stringify({ name, frames, time: new Date().toISOString() })); } catch { /* Recovery does not require storage. */ }
  }

  render() {
    if (!this.state.failed) return this.props.children;
    // Reuse the existing loading-error state and button rather than leaving
    // React's entire root blank after a screen or lazy-chunk render failure.
    return <div className={`app-shell platform-${platform}`}><main className="content-state" role="alert">
      <h1>{t("Не получилось загрузить приложение")}</h1><p>{t("Попробуй ещё раз.")}</p>
      <button type="button" onClick={() => { location.hash = "/home"; location.reload(); }}>{t("Повторить")}</button>
    </main></div>;
  }
}
