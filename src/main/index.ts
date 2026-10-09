import {
  app,
  BrowserWindow,
  session as electronSession,
  globalShortcut,
  ipcMain,
  screen,
  Tray,
  Menu,
  nativeImage,
} from "electron";
import { join } from "path";
import { electronApp } from "@electron-toolkit/utils";
import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  existsSync,
  appendFileSync,
} from "fs";
import { Session, type DoneTarget } from "./session";
import { createInjector } from "./injector";
import { ModelDownloader } from "./models";
import { findModel, isInstalled as isInstalledModel } from "../core/models";
import { modelsRoot, sherpaVersion } from "./stt";
import {
  migrateSettings,
  pushHistory,
  type DexsSettings,
  type HistoryEntry,
  type SessionState,
} from "../core/settings";
import type { DeliverySummary } from "../core/delivery";

let overlay: BrowserWindow | null = null;
let tray: Tray | null = null;
let session: Session | null = null;
/** Geometry of the resting/open pill, shared with the renderer. */
const OPEN_PILL = { width: 66, height: 44 } as const;

let settings: DexsSettings = loadSettings();
let history: HistoryEntry[] = loadHistory();
let mainWindow: BrowserWindow | null = null;
const downloader = new ModelDownloader();
const recentLogs: { at: number; level: string; line: string }[] = [];
const LOG_LIMIT = 400;
let historySeq = 0;
let resultText = "";

function appIcon(): Electron.NativeImage {
  return nativeImage.createFromPath(
    join(__dirname, "../../resources/icon.png"),
  );
}

function slotBounds(
  h: string,
  v: string,
  wa: Electron.Rectangle,
  w: number,
  hgt: number,
): { x: number; y: number } {
  const x =
    h === "h-left"
      ? wa.x
      : h === "h-right"
        ? wa.x + wa.width - w
        : Math.round(wa.x + (wa.width - w) / 2);
  const y =
    v === "v-top"
      ? wa.y
      : v === "v-bottom"
        ? wa.y + wa.height - hgt
        : Math.round(wa.y + (wa.height - hgt) / 2);
  return { x, y };
}

/**
 * Everything the user can see about what happened, newest last. Also appended
 * to a log file: stdout is buffered when piped, so the Diagnostics pane and
 * bug reports need a file they can read without waiting on a flush.
 */
function note(level: string, line: string): void {
  const entry = { at: Date.now(), level, line };
  recentLogs.push(entry);
  if (recentLogs.length > LOG_LIMIT) recentLogs.shift();
  try {
    appendFileSync(
      join(app.getPath("userData"), "dexs.log"),
      `${new Date(entry.at).toISOString()} [${level}] ${line}\n`,
    );
  } catch {
    /* non-fatal */
  }
}

function applySettings(): void {
  globalShortcut.unregisterAll();
  if (!settings.hotkeyEnabled) return;
  if (
    process.argv.includes("--settings") ||
    process.argv.includes("settings")
  ) {
    openMainWindow();
  }
  if (settings.autoDownloadModels) void autoFetchModels();
  const ok = globalShortcut.register(settings.hotkey, toggle);
  if (!ok) note("error", `hotkey already taken: ${settings.hotkey}`);
  else note("info", `hotkey registered: ${settings.hotkey}`);
  if (overlay && !overlay.isDestroyed()) {
    const display = screen.getPrimaryDisplay();
    const { x: ax, y: ay, width, height } = display.workArea;
    const cur = overlay.getBounds();
    const w = Math.min(cur.width, width);
    const h = Math.min(cur.height, height);
    const { x, y } = slotBounds(
      settings.slot.h,
      settings.slot.v,
      { x: ax, y: ay, width, height },
      w,
      h,
    );
    overlay.setBounds({ x, y, width: w, height: h });
    overlay.webContents.send("dexs:settings", settings);
  }
}

/** Fetch any model the user selected but has not installed yet. */
async function autoFetchModels(): Promise<void> {
  const root = modelsRoot(settings);
  for (const spec of findModel(settings.streamingModel)
    ? [findModel(settings.streamingModel)!]
    : []) {
    if (isInstalledModel(spec, root)) continue;
    try {
      await downloader.download(spec.id, root, (p) =>
        overlay?.webContents.send("dexs:progress", p),
      );
      note("info", `downloaded ${spec.id}`);
    } catch (e) {
      note("error", `${spec.id}: ${(e as Error)?.message ?? e}`);
    }
  }
}

function settingsPath(): string {
  return join(app.getPath("userData"), "settings.json");
}

function loadSettings(): DexsSettings {
  try {
    if (existsSync(settingsPath())) {
      return migrateSettings(JSON.parse(readFileSync(settingsPath(), "utf8")));
    }
  } catch {
    /* fall through */
  }
  return migrateSettings(undefined);
}

function historyPath(): string {
  return join(app.getPath("userData"), "history.json");
}

function loadHistory(): HistoryEntry[] {
  try {
    if (existsSync(historyPath())) {
      const parsed = JSON.parse(readFileSync(historyPath(), "utf8"));
      return Array.isArray(parsed) ? (parsed as HistoryEntry[]) : [];
    }
  } catch {
    /* fall through */
  }
  return [];
}

function saveHistory(): void {
  try {
    mkdirSync(app.getPath("userData"), { recursive: true });
    writeFileSync(historyPath(), JSON.stringify(history));
  } catch {
    /* non-fatal */
  }
}

function saveSettings(): void {
  try {
    mkdirSync(app.getPath("userData"), { recursive: true });
    writeFileSync(settingsPath(), JSON.stringify(settings, null, 2));
  } catch {
    /* non-fatal */
  }
}

function openMainWindow(): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.show();
    mainWindow.focus();
    return;
  }
  mainWindow = new BrowserWindow({
    width: 880,
    height: 620,
    minWidth: 720,
    minHeight: 520,
    show: false,
    backgroundColor: "#101012",
    title: "Dexs",
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      sandbox: false,
      contextIsolation: true,
    },
  });
  mainWindow.once("ready-to-show", () => mainWindow?.show());
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
  mainWindow.webContents.on("did-fail-load", (_e, code, desc, url) => {
    note("error", `main window failed to load ${url}: ${desc} (${code})`);
    mainWindow?.show();
  });
  mainWindow.webContents.on("render-process-gone", (_e, d) =>
    note("error", `main window renderer gone: ${d.reason}`),
  );
  note("info", "main window opening");
  const mainUrl = process.env["ELECTRON_RENDERER_URL"]
    ? `${process.env["ELECTRON_RENDERER_URL"]}/main.html`
    : `file://${join(__dirname, "../renderer/main.html")}`;
  note("info", `main window url: ${mainUrl}`);
  if (process.env["ELECTRON_RENDERER_URL"]) {
    void mainWindow.loadURL(mainUrl);
  } else {
    void mainWindow.loadFile(join(__dirname, "../renderer/main.html"));
  }
}

function createOverlay(): void {
  const display = screen.getPrimaryDisplay();
  const { x: ax, y: ay, width, height } = display.workArea;
  overlay = new BrowserWindow({
    width: OPEN_PILL.width,
    height: OPEN_PILL.height,
    x: ax + Math.round((width - OPEN_PILL.width) / 2),
    y: ay + height - OPEN_PILL.height,
    frame: false,
    transparent: true,
    // Never take keyboard focus: xdotool types into the *focused* window, so
    // a focusable pill would swallow every dictated character.
    focusable: false,
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

  // Drag + snap: the renderer streams pointer deltas while a long-press drag
  // is active; on release the window eases into the nearest of the 9 slots.
  let dragging = false;
  let moveDebounce: ReturnType<typeof setTimeout> | undefined;
  let lastSlot = { h: "h-center", v: "v-bottom" } as {
    h: string;
    v: string;
  };

  const snap = (): void => {
    if (!overlay || dragging) return;
    const b = overlay.getBounds();
    const display = screen.getDisplayNearestPoint({
      x: Math.round(b.x + b.width / 2),
      y: Math.round(b.y + b.height / 2),
    });
    const wa = display.workArea;
    const cx = b.x + b.width / 2;
    const cy = b.y + b.height / 2;
    const h =
      cx < wa.x + wa.width / 3
        ? "h-left"
        : cx > wa.x + (2 * wa.width) / 3
          ? "h-right"
          : "h-center";
    const v =
      cy < wa.y + wa.height / 3
        ? "v-top"
        : cy > wa.y + (2 * wa.height) / 3
          ? "v-bottom"
          : "v-middle";
    const key = `${h} ${v}`;
    if (key !== `${lastSlot.h} ${lastSlot.v}`) {
      lastSlot = { h, v };
      overlay.webContents.send("dexs:anchor", { h, v });
    }
    const { x: wx, y: wy } = slotBounds(h, v, wa, 132, 40);
    const steps = 12;
    for (let i = 1; i <= steps; i++) {
      const step = i;
      setTimeout(
        () => {
          if (!overlay) return;
          const t = step / steps;
          const eased = 1 - Math.pow(1 - t, 3);
          overlay.setPosition(
            Math.round(b.x + (wx - b.x) * eased),
            Math.round(b.y + (wy - b.y) * eased),
          );
        },
        (step * 200) / steps,
      );
    }
  };

  overlay.on("move", () => {
    if (moveDebounce) clearTimeout(moveDebounce);
    if (dragging) return;
    moveDebounce = setTimeout(snap, 240);
  });
  // The pill widens while a dropped file plays (rate control + time), then
  // returns to its compact size; keep it glued to the same slot meanwhile.
  ipcMain.on("dexs:resize", (_e, w: number, hgt: number) => {
    if (!overlay) return;
    const wa = screen.getPrimaryDisplay().workArea;
    const { x, y } = slotBounds(lastSlot.h, lastSlot.v, wa, w, hgt);
    overlay.setBounds({ x, y, width: w, height: hgt });
  });
  ipcMain.on("dexs:drag:start", () => {
    dragging = true;
  });
  ipcMain.on("dexs:drag:end", () => {
    dragging = false;
    snap();
  });
  overlay.webContents.once("did-finish-load", () => {
    overlay?.webContents.send("dexs:anchor", { h: "h-center", v: "v-bottom" });
  });
  // QA: `dexs --dropdemo` runs a bundled speech clip through the full
  // pipeline, so dictation can be exercised without a microphone.
  const search = process.argv.includes("--dropdemo") ? "?dropdemo=1" : "";
  if (process.env["ELECTRON_RENDERER_URL"]) {
    overlay.loadURL(
      `${process.env["ELECTRON_RENDERER_URL"]}/index.html${search}`,
    );
  } else {
    void overlay.loadFile(join(__dirname, "../renderer/index.html"), {
      search,
    });
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
    resultText = "";
    session = new Session(settings, {
      onState: live(mine, (s: SessionState) =>
        overlay?.webContents.send("dexs:state", s),
      ),
      onPartial: live(mine, (t: string) =>
        overlay?.webContents.send("dexs:partial", t),
      ),
      onUtterance: live(mine, (t: string) => {
        note("info", `utterance: ${t}`);
        resultText = resultText ? `${resultText} ${t}` : t;
        overlay?.webContents.send("dexs:utterance", t);
      }),
      onError: live(mine, (m: string) =>
        overlay?.webContents.send("dexs:error", m),
      ),
      onDone: live(mine, (b: DoneTarget, result?: DeliverySummary) => {
        if (result) {
          note("info", `delivered: ${result.where} — ${result.message}`);
          history = pushHistory(history, {
            id: String(++historySeq),
            at: Date.now(),
            text: resultText,
            source: "mic",
            delivered: result.where,
          });
          saveHistory();
        }
        overlay?.webContents.send("dexs:done", b, result ?? null);
      }),
    });
    session.start();
  } else {
    const stopping = session;
    session = null;
    void stopping.stop();
  }
}

app.whenReady().then(() => {
  note("info", `argv: ${process.argv.join(" ")}`);
  electronApp.setAppUserModelId("com.dexs.app");
  createOverlay();
  tray = new Tray(appIcon().resize({ width: 22, height: 22 }));
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: "Toggle dictation", click: toggle },
      { label: "Settings…", click: () => openMainWindow() },
      { label: "Quit", click: () => app.quit() },
    ]),
  );
  if (
    process.argv.includes("--settings") ||
    process.argv.includes("settings")
  ) {
    openMainWindow();
  }
  if (settings.autoDownloadModels) void autoFetchModels();
  const ok = globalShortcut.register(settings.hotkey, toggle);
  if (!ok) console.error(`hotkey conflict: ${settings.hotkey}`);

  ipcMain.on("dexs:pcm", (_e, buf: ArrayBuffer) => {
    session?.feed(new Int16Array(buf));
  });
  ipcMain.handle("dexs:settings", () => settings);
  ipcMain.on("dexs:settings:set", (_e, s: unknown) => {
    settings = migrateSettings(s);
    saveSettings();
    applySettings();
    if (settings.autoDownloadModels) void autoFetchModels();
  });
  ipcMain.handle("dexs:history", () => history);
  ipcMain.on("dexs:history:clear", () => {
    history = [];
    saveHistory();
  });
  ipcMain.handle("dexs:history:copy", (_e, id: string) => {
    const entry = history.find((h) => h.id === id);
    if (entry) void createInjector().copy(entry.text);
  });
  ipcMain.handle("dexs:models", () =>
    downloader
      .statuses(modelsRoot(settings))
      .map((s) => ({ ...s, spec: findModel(s.id) })),
  );
  ipcMain.on("dexs:models:download", (_e, id: string) => {
    void downloader
      .download(id, modelsRoot(settings), (p) => {
        overlay?.webContents.send("dexs:progress", p);
        mainWindow?.webContents.send("dexs:progress", p);
      })
      .then(() => {
        mainWindow?.webContents.send("dexs:progress", {
          modelId: id,
          file: "",
          progress: 1,
          receivedBytes: 0,
          totalBytes: 0,
          done: true,
          installed: true,
        });
      })
      .catch((e: Error) => {
        mainWindow?.webContents.send("dexs:progress", {
          modelId: id,
          file: "",
          progress: 0,
          receivedBytes: 0,
          totalBytes: 0,
          done: true,
          error: e.message,
        });
      });
  });
  ipcMain.on("dexs:models:cancel", (_e, id: string) => downloader.cancel(id));
  ipcMain.on("dexs:models:remove", (_e, id: string) => {
    downloader.remove(id, modelsRoot(settings));
  });
  ipcMain.handle("dexs:diagnostics", () => ({
    platform: process.platform,
    arch: process.arch,
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
    modelsDir: modelsRoot(settings),
    hotkey: settings.hotkey,
    hotkeyRegistered: globalShortcut.isRegistered(settings.hotkey),
    sherpa: sherpaVersion(),
    session: session?.state ?? "idle",
    lines: recentLogs,
    settings,
  }));
  ipcMain.on("dexs:open-main", () => openMainWindow());
  // Windows can hand the renderer a denied or prompt-less permission state;
  // grant media explicitly for our own overlay so input detection is not the
  // thing that fails.
  electronSession.defaultSession.setPermissionRequestHandler(
    (_wc, permission, done) => {
      done(permission === "media");
    },
  );
  electronSession.defaultSession.setPermissionCheckHandler(
    (_wc, permission) => {
      return permission === "media";
    },
  );

  ipcMain.on("dexs:toggle", toggle);
  // Renderer diagnostics (console output is not forwarded to the terminal).
  ipcMain.on("dexs:log", (_e, m: string) => {
    note("renderer", m);
    if (settings.verboseLogging) console.log(`[renderer] ${m}`);
  });
  // The renderer aborts (e.g. mic unavailable). Tear the session down without
  // emitting working/done, so the next toggle starts a fresh listen instead of
  // replaying the previous session's stop animation.
  ipcMain.on("dexs:abort", () => {
    const stopping = session;
    session = null;
    if (stopping) void stopping.stop({ silent: true });
  });
  ipcMain.on("dexs:drag", (_e, dx: number, dy: number) => {
    if (!overlay) return;
    const b = overlay.getBounds();
    overlay.setPosition(b.x + dx, b.y + dy);
  });
});

app.on("will-quit", () => {
  globalShortcut.unregisterAll();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
