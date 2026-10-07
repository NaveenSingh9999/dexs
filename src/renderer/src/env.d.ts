/// <reference types="vite/client" />

export interface DexsApi {
  toggle(): void;
  sendPcm(buf: ArrayBuffer): void;
  onState(cb: (s: string) => void): void;
  onPartial(cb: (t: string) => void): void;
  getSettings(): Promise<unknown>;
  setSettings(s: unknown): void;
}

declare global {
  interface Window {
    api: DexsApi;
  }
}
