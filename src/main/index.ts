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
  const { x: ax, y: ay, width, height } = display.workArea;
  overlay = new BrowserWindow({
    width: 132,
    height: 40,
    x: ax + Math.round((width - 132) / 2),
    y: ay + height - 40,
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
      onUtterance: live(mine, (t: string) => {
        console.log(`[dexs] utterance: ${t}`);
        overlay?.webContents.send("dexs:utterance", t);
      }),
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
  ipcMain.on("dexs:log", (_e, m: string) => console.log(`[renderer] ${m}`));
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
