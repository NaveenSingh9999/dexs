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
import { Session, type DoneTarget } from "./session";
import {
  defaultSettings,
  type DexsSettings,
  type SessionState,
} from "../core/types";

let overlay: BrowserWindow | null = null;
let tray: Tray | null = null;
let session: Session | null = null;
let settings: DexsSettings = loadSettings();

function appIcon(): Electron.NativeImage {
  return nativeImage.createFromPath(
    join(__dirname, "../../resources/icon.png"),
  );
}

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
    icon: appIcon(),
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

let generation = 0;

/** Drops events from a session that a newer toggle has superseded, so a
 *  draining old session can never overwrite the live one's pill state. */
function live<T extends unknown[]>(
  mine: number,
  fn: (...args: T) => void,
): (...args: T) => void {
  return (...args: T) => {
    if (mine === generation) fn(...args);
  };
}

function toggle(): void {
  if (!session) {
    const mine = ++generation;
    session = new Session(settings, {
      onState: live(mine, (s: SessionState) =>
        overlay?.webContents.send("dexs:state", s),
      ),
      onPartial: live(mine, (t: string) =>
        overlay?.webContents.send("dexs:partial", t),
      ),
      onUtterance: live(mine, (t: string) =>
        overlay?.webContents.send("dexs:utterance", t),
      ),
      onError: live(mine, (m: string) =>
        overlay?.webContents.send("dexs:error", m),
      ),
      onDone: live(mine, (b: DoneTarget) =>
        overlay?.webContents.send("dexs:done", b),
      ),
    });
    session.start();
  } else {
    const stopping = session;
    session = null;
    void stopping.stop();
  }
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId("com.dexs.app");
  createOverlay();
  tray = new Tray(appIcon().resize({ width: 22, height: 22 }));
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
