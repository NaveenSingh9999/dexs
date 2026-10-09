/// <reference types="vite/client" />

export interface DexsApi {
  toggle(): void;
  sendPcm(buf: ArrayBuffer): void;
  onState(cb: (s: string) => void): void;
  onPartial(cb: (t: string) => void): void;
  onUtterance(cb: (t: string) => void): void;
  onError(cb: (m: string) => void): void;
  onDone(cb: (back: string) => void): void;
  onAnchor(cb: (slot: { h: string; v: string }) => void): void;
  abort(): void;
  log(m: string): void;
  dragBy(dx: number, dy: number): void;
  resize(w: number, h: number): void;
  dragStart(): void;
  dragEnd(): void;
  getSettings(): Promise<unknown>;
  setSettings(s: unknown): void;
}

declare global {
  interface Window {
    api: DexsApi;
  }
}
