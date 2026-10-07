import { planCorrection } from "../core/differ";
import { createInjector, applyCorrection, type Injector } from "./injector";
import { VoskStream, transcribeWhisper } from "./stt";
import { cleanText } from "./llm";
import { mkdtempSync, writeFileSync, unlinkSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import type { DexsSettings, SessionState } from "../core/types";

export interface SessionCallbacks {
  onState(s: SessionState): void;
  onPartial(text: string): void;
  onUtterance(text: string): void;
  onError(msg: string): void;
}

const RMS_THRESHOLD = 500;
const HANGOVER_FRAMES = 14; // ~420ms at 30ms frames
const MAX_UTTERANCE_MS = 15000;
const FRAME = 480; // 30ms @ 16kHz

export class Session {
  private vosk: VoskStream | null = null;
  private injector: Injector = createInjector();
  private typedThisUtterance = "";
  private buffer: number[] = [];
  private speaking = false;
  private silenceFrames = 0;
  private running = false;
  private queue: Promise<void> = Promise.resolve();
  private voskDead = false;

  constructor(
    private settings: DexsSettings,
    private cb: SessionCallbacks,
  ) {}

  start(): void {
    if (this.running) return;
    this.running = true;
    this.speaking = false;
    this.silenceFrames = 0;
    this.buffer = [];
    this.typedThisUtterance = "";
    this.voskDead = false;
    this.cb.onState("listening");
    try {
      this.vosk = new VoskStream(
        this.settings.voskBin,
        this.settings.voskModelDir,
        this.settings.language,
      );
      this.vosk.onChunk((c) => {
        if (!c.final) {
          this.cb.onPartial(c.text);
          return;
        }
        this.injector
          .type(c.text)
          .then(() => {
            this.typedThisUtterance += c.text;
          })
          .catch(() => this.cb.onError("type failed"));
      });
      this.vosk.start();
      this.vosk.onError(() => {
        this.voskDead = true;
        this.vosk = null;
        this.cb.onError("Vosk unavailable, using basic mode");
      });
    } catch {
      this.vosk = null;
      this.voskDead = true;
      this.cb.onError("Vosk unavailable, using basic mode");
    }
  }

  feed(pcm16: Int16Array): void {
    if (!this.running) return;
    this.vosk?.feed(pcm16);
    this.buffer.push(...pcm16);
    if (!this.speaking && this.buffer.length > 16000) {
      this.buffer.splice(0, this.buffer.length - 16000);
    }

    for (let i = 0; i + FRAME <= pcm16.length; i += FRAME) {
      let sum = 0;
      for (let j = 0; j < FRAME; j++) sum += pcm16[i + j] * pcm16[i + j];
      const rms = Math.sqrt(sum / FRAME);
      if (rms >= RMS_THRESHOLD) {
        this.speaking = true;
        this.silenceFrames = 0;
      } else if (this.speaking) {
        this.silenceFrames++;
        if (this.silenceFrames >= HANGOVER_FRAMES) {
          void this.endUtterance();
        }
      }
    }

    if (this.speaking && this.buffer.length >= MAX_UTTERANCE_MS * 16) {
      void this.endUtterance();
    }
  }

  private async endUtterance(): Promise<void> {
    if (!this.speaking) return;
    this.speaking = false;
    this.silenceFrames = 0;
    const audio = new Int16Array(this.buffer);
    this.buffer = [];
    const typed = this.typedThisUtterance;
    this.typedThisUtterance = "";
    if (audio.length < 16000 * 0.25) return; // too short
    this.enqueue(audio, typed);
  }

  private enqueue(audio: Int16Array, typed: string): void {
    this.queue = this.queue.then(() =>
      this.correct(audio, typed).catch(() => this.cb.onError("failed")),
    );
  }

  private async correct(audio: Int16Array, typed: string): Promise<void> {
    const wavPath = writeWav(audio);
    try {
      const text = await transcribeWhisper(
        this.settings.whisperBin,
        this.settings.whisperModel,
        wavPath,
        this.settings.language,
      );
      this.cb.onUtterance(text);

      if (this.voskDead) {
        // basic mode: type the whisper result, with llm cleanup if configured
        let finalText = text;
        try {
          finalText = await cleanText(
            this.settings.llmBin,
            this.settings.llmModel,
            text,
          );
        } catch {
          /* keep */
        }
        await this.injector.type(finalText);
        return;
      }

      let finalText = text;
      try {
        finalText = await cleanText(
          this.settings.llmBin,
          this.settings.llmModel,
          text,
        );
      } catch {
        /* llm unavailable, keep whisper text */
      }
      const correction = planCorrection(typed.trim(), finalText.trim());
      if (correction) {
        await applyCorrection(
          this.injector,
          correction.backspaces,
          correction.insert,
        );
      }
    } catch {
      this.cb.onError("whisper failed");
    } finally {
      try {
        unlinkSync(wavPath);
      } catch {
        /* ignore */
      }
    }
  }

  async stop(): Promise<void> {
    if (!this.running) return;
    this.running = false;
    this.cb.onState("working");
    await this.vosk?.stop();
    this.vosk = null;
    if (this.speaking && this.buffer.length > 0) {
      const audio = new Int16Array(this.buffer);
      const typed = this.typedThisUtterance;
      this.buffer = [];
      this.typedThisUtterance = "";
      this.enqueue(audio, typed);
    }
    await this.queue;
    this.cb.onState("idle");
  }

  get state(): "idle" | "running" {
    return this.running ? "running" : "idle";
  }
}

function writeWav(pcm: Int16Array): string {
  const dir = mkdtempSync(join(tmpdir(), "dexs-"));
  const path = join(dir, "seg.wav");
  const header = wavHeader(pcm.length * 2, 16000, 1, 16);
  writeFileSync(
    path,
    Buffer.concat([
      header,
      Buffer.from(pcm.buffer, pcm.byteOffset, pcm.byteLength),
    ]),
  );
  return path;
}

function wavHeader(
  dataLen: number,
  sampleRate: number,
  channels: number,
  bits: number,
): Buffer {
  const byteRate = (sampleRate * channels * bits) / 8;
  const blockAlign = (channels * bits) / 8;
  const h = Buffer.alloc(44);
  h.write("RIFF", 0);
  h.writeUInt32LE(36 + dataLen, 4);
  h.write("WAVE", 8);
  h.write("fmt ", 12);
  h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20);
  h.writeUInt16LE(channels, 22);
  h.writeUInt32LE(sampleRate, 24);
  h.writeUInt32LE(byteRate, 28);
  h.writeUInt16LE(blockAlign, 32);
  h.writeUInt16LE(bits, 34);
  h.write("data", 36);
  h.writeUInt32LE(dataLen, 40);
  return h;
}
