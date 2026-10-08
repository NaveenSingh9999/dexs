import { contextBridge, ipcRenderer } from "electron";

declare global {
  interface Window {
    electron: typeof electronAPI;
    api: typeof api;
  }
}

import { electronAPI } from "@electron-toolkit/preload";

const api = {
  toggle: () => ipcRenderer.send("dexs:toggle"),
  sendPcm: (buf: ArrayBuffer) => ipcRenderer.send("dexs:pcm", buf),
  onState: (cb: (s: string) => void) =>
    ipcRenderer.on("dexs:state", (_e, s) => cb(s)),
  onPartial: (cb: (t: string) => void) =>
    ipcRenderer.on("dexs:partial", (_e, t) => cb(t)),
  onUtterance: (cb: (t: string) => void) =>
    ipcRenderer.on("dexs:utterance", (_e, t) => cb(t)),
  onError: (cb: (m: string) => void) =>
    ipcRenderer.on("dexs:error", (_e, m) => cb(m)),
  onDone: (cb: (back: string) => void) =>
    ipcRenderer.on("dexs:done", (_e, back) => cb(back)),
  onAnchor: (cb: (slot: { h: string; v: string }) => void) =>
    ipcRenderer.on("dexs:anchor", (_e, slot) => cb(slot)),
  abort: () => ipcRenderer.send("dexs:abort"),
  getSettings: () => ipcRenderer.invoke("dexs:settings"),
  setSettings: (s: unknown) => ipcRenderer.send("dexs:settings:set", s),
};

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld("electron", electronAPI);
    contextBridge.exposeInMainWorld("api", api);
  } catch (error) {
    console.error(error);
  }
} else {
  window.electron = electronAPI;

  window.api = api;
}
