import React from "react";
import { createRoot } from "react-dom/client";
import "@fontsource/onest/400.css";
import "@fontsource/onest/500.css";
import "@fontsource/onest/600.css";
import "@fontsource/tenor-sans/400.css";
import { App } from "./app/DemoApp";
import { AppErrorBoundary } from "./app/AppErrorBoundary";
import { initializeOffline, nativeDownloads } from "./platform/offlineStore";
import { t } from "./i18n";
import "./styles/tokens.css";
import "./styles/home.css";
import "./styles/screens.css";
import "./styles/i18n.css";
import "./styles/mini-player.css";
import "./styles/map-context.css";
import "./styles/native-shell.css";
import "./styles/offline.css";

const root = createRoot(document.getElementById("root")!);
if (nativeDownloads) root.render(<div className="app-shell"><main className="content-state" aria-busy="true"><h1>{t("Загружаем Казань…")}</h1></main></div>);
void initializeOffline().then(() => root.render(
  <React.StrictMode><AppErrorBoundary><App /></AppErrorBoundary></React.StrictMode>,
));
