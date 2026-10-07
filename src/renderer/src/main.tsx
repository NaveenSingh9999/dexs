import "./assets/main.css";

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";

if (!window.api) {
  window.api = {
    toggle: () => {},
    sendPcm: () => {},
    onState: () => {},
    onPartial: () => {},
    getSettings: async () => ({}),
    setSettings: () => {},
  };
}

if (location.search.includes("qa")) {
  document.body.style.background = "#1c1c1e";
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
