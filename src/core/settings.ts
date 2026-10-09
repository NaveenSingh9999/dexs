/**
 * Dexs settings: the single source of truth for the main app UI, the
 * main process and the persisted settings.json. Everything is plain data so
 * it can be validated, migrated and diffed without touching Electron.
 */
import type { SlotH, SlotV } from "../renderer/src/pillLayout";

/** Pipeline states the pill renders. */
export type SessionState = "idle" | "listening" | "working" | "done" | "error";

export interface DexsSettings {
  /** Global push-to-talk style hotkey. */
  hotkey: string;
  language: string;

  /** Where the models live and which ones are selected. */
  modelsDir: string;
  streamingModel: string;
  reviewModel: string;
  /** Review pass: clean up punctuation/casing after the streaming text. */
  reviewEnabled: boolean;
  /** Model to auto-download on first run. */
  autoDownloadModels: boolean;

  /** Pill behaviour. */
  slot: { h: SlotH; v: SlotV };
  /** Extra gap from the screen edge, in px. */
  edgeMargin: number;
  /** Grow the pill to fit the live text. */
  dynamicSize: boolean;
  /** Dim the streaming partials until the review settles them. */
  dimPartials: boolean;
  /** Show the stop control while transcribing. */
  showStopButton: boolean;

  /** Typing in the pill without spelling every word out loud. */
  playbackRate: number;

  /** Deliver finished text by pasting into the focused field when verified. */
  pasteOnFinish: boolean;
  /** Fall back to the clipboard when no editable field is focused. */
  clipboardFallback: boolean;

  /** Show diagnostics in the main app. */
  verboseLogging: boolean;
  hotkeyEnabled: boolean;
}

export const defaultSettings: DexsSettings = {
  hotkey: "CommandOrControl+Shift+Space",
  language: "en",

  modelsDir: "",
  streamingModel: "sherpa-onnx-streaming-zipformer-en-2023-06-26",
  reviewModel: "sherpa-onnx-whisper-tiny.en",
  reviewEnabled: true,
  autoDownloadModels: true,

  slot: { h: "h-center", v: "v-bottom" },
  edgeMargin: 0,
  dynamicSize: true,
  dimPartials: true,
  showStopButton: true,

  playbackRate: 1,

  pasteOnFinish: true,
  clipboardFallback: true,

  verboseLogging: false,
  hotkeyEnabled: true,
};

/** Playback rates the pill cycles through, slowest first. */
export const RATES = [0.5, 1, 1.5, 2, 4] as const;

export function nextRate(current: number): number {
  const i = RATES.indexOf(current as (typeof RATES)[number]);
  return RATES[(i + 1 + RATES.length) % RATES.length];
}

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/**
 * Merge stored JSON over the defaults, dropping anything with the wrong
 * shape so a hand-edited or older settings file can never crash startup.
 */
export function migrateSettings(stored: unknown): DexsSettings {
  if (!isObject(stored)) return { ...defaultSettings };
  const out: DexsSettings = { ...defaultSettings };

  const str = (key: keyof DexsSettings): void => {
    const v = stored[key];
    if (typeof v === "string") (out[key] as unknown) = v;
  };
  const bool = (key: keyof DexsSettings): void => {
    const v = stored[key];
    if (typeof v === "boolean") (out[key] as unknown) = v;
  };
  const num = (key: keyof DexsSettings, lo: number, hi: number): void => {
    const v = stored[key];
    if (typeof v === "number" && Number.isFinite(v)) {
      (out[key] as unknown) = Math.min(Math.max(v, lo), hi);
    }
  };

  for (const k of [
    "hotkey",
    "language",
    "modelsDir",
    "streamingModel",
    "reviewModel",
  ] as const) {
    str(k);
  }
  for (const k of [
    "reviewEnabled",
    "autoDownloadModels",
    "dynamicSize",
    "dimPartials",
    "showStopButton",
    "pasteOnFinish",
    "clipboardFallback",
    "verboseLogging",
    "hotkeyEnabled",
  ] as const) {
    bool(k);
  }
  num("edgeMargin", 0, 64);
  num("playbackRate", 0.25, 4);

  if (isObject(stored.slot)) {
    const h = stored.slot.h;
    const v = stored.slot.v;
    if (h === "h-left" || h === "h-center" || h === "h-right") {
      out.slot.h = h;
    }
    if (v === "v-top" || v === "v-middle" || v === "v-bottom") {
      out.slot.v = v;
    }
  }
  return out;
}

export interface HistoryEntry {
  id: string;
  at: number;
  text: string;
  source: "mic" | "file" | "paste";
  delivered: "window" | "clipboard" | "none";
}

export const HISTORY_LIMIT = 200;

/** Newest first, capped, no blank entries. */
export function pushHistory(
  history: HistoryEntry[],
  entry: HistoryEntry,
): HistoryEntry[] {
  if (!entry.text.trim()) return history;
  return [entry, ...history].slice(0, HISTORY_LIMIT);
}
