import {
  app,
  BrowserWindow,
  globalShortcut,
  ipcMain,
  screen,
  Tray,
  Menu,
  nativeImage,
} from "electron";
import { join } from "path";
import { electronApp } from "@electron-toolkit/utils";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { Session } from "./session";
import {
  defaultSettings,
  type DexsSettings,
  type SessionState,
} from "../core/types";

let overlay: BrowserWindow | null = null;
let tray: Tray | null = null;
let session: Session | null = null;
let settings: DexsSettings = loadSettings();

function settingsPath(): string {
  return join(app.getPath("userData"), "settings.json");
}

function loadSettings(): DexsSettings {
  try {
    if (existsSync(settingsPath())) {
      return {
        ...defaultSettings,
        ...JSON.parse(readFileSync(settingsPath(), "utf8")),
      };
    }
  } catch {
    /* fall through */
  }
  return { ...defaultSettings };
}

function saveSettings(): void {
  try {
    mkdirSync(app.getPath("userData"), { recursive: true });
    writeFileSync(settingsPath(), JSON.stringify(settings, null, 2));
  } catch {
    /* non-fatal */
  }
}

function createOverlay(): void {
  const display = screen.getPrimaryDisplay();
  const { width, height } = display.workAreaSize;
  overlay = new BrowserWindow({
    width: 360,
    height: 72,
    x: Math.round((width - 360) / 2),
    y: height - 96,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    hasShadow: false,
    backgroundColor: "#00000000",
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      sandbox: false,
    },
  });
  overlay.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  if (process.env["ELECTRON_RENDERER_URL"]) {
    overlay.loadURL(process.env["ELECTRON_RENDERER_URL"]);
  } else {
    overlay.loadFile(join(__dirname, "../renderer/index.html"));
  }
}

function toggle(): void {
  if (!session || session.state === "idle") {
    session = new Session(settings, {
      onState: (s: SessionState) => overlay?.webContents.send("dexs:state", s),
      onPartial: (t) => overlay?.webContents.send("dexs:partial", t),
      onUtterance: (t) => overlay?.webContents.send("dexs:utterance", t),
      onError: (m) => overlay?.webContents.send("dexs:error", m),
    });
    session.start();
  } else {
    void session.stop();
  }
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId("com.dexs.app");
  createOverlay();
  const empty = nativeImage.createEmpty();
  tray = new Tray(empty);
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: "Toggle dictation", click: toggle },
      { label: "Quit", click: () => app.quit() },
    ]),
  );
  const ok = globalShortcut.register(settings.hotkey, toggle);
  if (!ok) console.error(`hotkey conflict: ${settings.hotkey}`);

  ipcMain.on("dexs:pcm", (_e, buf: ArrayBuffer) => {
    session?.feed(new Int16Array(buf));
  });
  ipcMain.handle("dexs:settings", () => settings);
  ipcMain.on("dexs:settings:set", (_e, s: DexsSettings) => {
    settings = s;
    saveSettings();
  });
  ipcMain.on("dexs:toggle", toggle);
});

app.on("will-quit", () => {
  globalShortcut.unregisterAll();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
