import React from "react";
import { createRoot } from "react-dom/client";
import "@fontsource/onest/400.css";
import "@fontsource/onest/500.css";
import "@fontsource/onest/600.css";
import "@fontsource/tenor-sans/400.css";
import { App } from "./app/App";
import "./styles/tokens.css";
import "./styles/home.css";

createRoot(document.getElementById("root")!).render(
  <React.StrictMode><App /></React.StrictMode>,
);
