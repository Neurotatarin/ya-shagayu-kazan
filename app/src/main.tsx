import React from "react";
import { createRoot } from "react-dom/client";
import "@fontsource/onest/400.css";
import "@fontsource/onest/500.css";
import "@fontsource/onest/600.css";
import "@fontsource/tenor-sans/400.css";
import { App } from "./app/DemoApp";
import { AppErrorBoundary } from "./app/AppErrorBoundary";
import "./styles/tokens.css";
import "./styles/home.css";
import "./styles/screens.css";
import "./styles/i18n.css";
import "./styles/mini-player.css";
import "./styles/map-context.css";
import "./styles/native-shell.css";

createRoot(document.getElementById("root")!).render(
  <React.StrictMode><AppErrorBoundary><App /></AppErrorBoundary></React.StrictMode>,
);
