import type { DexsSettings } from "../../core/settings";
import type { DeliverySummary } from "../../core/delivery";
import type { DownloadProgress } from "../../main/models";
/// <reference types="vite/client" />

export interface DexsApi {
  toggle(): void;
  sendPcm(buf: ArrayBuffer): void;
  onState(cb: (s: string) => void): void;
  onPartial(cb: (t: string) => void): void;
  onUtterance(cb: (t: string) => void): void;
  onError(cb: (m: string) => void): void;
  onDone(cb: (back: string, result: DeliverySummary | null) => void): void;
  onSettings(cb: (s: DexsSettings) => void): void;
  onAnchor(cb: (slot: { h: string; v: string }) => void): void;
  abort(): void;
  log(m: string): void;
  dragBy(dx: number, dy: number): void;
  resize(w: number, h: number): void;
  dragStart(): void;
  dragEnd(): void;
  getSettings(): Promise<unknown>;
  setSettings(s: unknown): void;
  getHistory(): Promise<unknown>;
  clearHistory(): void;
  copyHistory(id: string): Promise<void>;
  getModels(): Promise<unknown>;
  downloadModel(id: string): void;
  cancelModel(id: string): void;
  removeModel(id: string): void;
  getDiagnostics(): Promise<unknown>;
  onProgress(cb: (p: DownloadProgress) => void): void;
  openMain(): void;
}

declare global {
  interface Window {
    api: DexsApi;
  }
}
