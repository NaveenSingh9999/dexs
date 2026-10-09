"use strict";
const electron = require("electron");
const preload = require("@electron-toolkit/preload");
const api = {
  toggle: () => electron.ipcRenderer.send("dexs:toggle"),
  sendPcm: (buf) => electron.ipcRenderer.send("dexs:pcm", buf),
  onState: (cb) => electron.ipcRenderer.on("dexs:state", (_e, s) => cb(s)),
  onPartial: (cb) => electron.ipcRenderer.on("dexs:partial", (_e, t) => cb(t)),
  onUtterance: (cb) => electron.ipcRenderer.on("dexs:utterance", (_e, t) => cb(t)),
  onError: (cb) => electron.ipcRenderer.on("dexs:error", (_e, m) => cb(m)),
  onDone: (cb) => electron.ipcRenderer.on("dexs:done", (_e, back) => cb(back)),
  onAnchor: (cb) => electron.ipcRenderer.on("dexs:anchor", (_e, slot) => cb(slot)),
  abort: () => electron.ipcRenderer.send("dexs:abort"),
  log: (m) => electron.ipcRenderer.send("dexs:log", m),
  dragBy: (dx, dy) => electron.ipcRenderer.send("dexs:drag", dx, dy),
  resize: (w, h) => electron.ipcRenderer.send("dexs:resize", w, h),
  dragStart: () => electron.ipcRenderer.send("dexs:drag:start"),
  dragEnd: () => electron.ipcRenderer.send("dexs:drag:end"),
  getSettings: () => electron.ipcRenderer.invoke("dexs:settings"),
  setSettings: (s) => electron.ipcRenderer.send("dexs:settings:set", s)
};
if (process.contextIsolated) {
  try {
    electron.contextBridge.exposeInMainWorld("electron", preload.electronAPI);
    electron.contextBridge.exposeInMainWorld("api", api);
  } catch (error) {
    console.error(error);
  }
} else {
  window.electron = preload.electronAPI;
  window.api = api;
}
