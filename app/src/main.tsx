import React from "react";
import ReactDOM from "react-dom/client";
import "@fontsource/onest/cyrillic-400.css";
import "@fontsource/onest/cyrillic-500.css";
import "@fontsource/onest/cyrillic-600.css";
import "@fontsource/onest/latin-400.css";
import "@fontsource/onest/latin-500.css";
import "@fontsource/onest/latin-600.css";
import "@fontsource/tenor-sans/cyrillic-400.css";
import "@fontsource/tenor-sans/latin-400.css";
import { App } from "./app/App";
import "./styles/tokens.css";
import "./styles/app.css";
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
