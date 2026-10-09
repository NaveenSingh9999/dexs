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
    onUtterance: () => {},
    onError: () => {},
    onDone: () => {},
    onSettings: () => {},
    onAnchor: () => {},
    abort: () => {},
    log: () => {},
    dragBy: () => {},
    resize: () => {},
    dragStart: () => {},
    dragEnd: () => {},
    getSettings: async () => ({}),
    setSettings: () => {},
    getHistory: async () => [],
    clearHistory: () => {},
    copyHistory: async () => {},
    getModels: async () => [],
    downloadModel: () => {},
    cancelModel: () => {},
    removeModel: () => {},
    getDiagnostics: async () => ({ lines: [] }),
    onProgress: () => {},
    openMain: () => {},
  };
}

if (location.search.includes("qa") || location.search.includes("dark")) {
  document.body.style.background = "#1c1c1e";
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
