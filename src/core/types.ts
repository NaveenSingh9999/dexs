export type SessionState = "idle" | "listening" | "working" | "error";

export interface DexsSettings {
  hotkey: string;
  language: string;
  whisperModel: string;
  whisperBin: string;
  voskBin: string;
  voskModelDir: string;
  modelsDir: string;
  dockSide: "bottom" | "top" | "left" | "right" | "free";
}

export const defaultSettings: DexsSettings = {
  hotkey: "CommandOrControl+Shift+Space",
  language: "en",
  whisperModel: "whisper-base.en",
  whisperBin: "whisper-cli",
  voskBin: "vosk-cli",
  voskModelDir: "",
  modelsDir: "",
  dockSide: "bottom",
};
