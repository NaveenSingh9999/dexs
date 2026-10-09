import { planCorrection } from "../core/differ";
import { createInjector, applyCorrection, type Injector } from "./injector";
import { SherpaStream, transcribeWhisper } from "./stt";
import { cleanText } from "./llm";
import { mkdtempSync, writeFileSync, unlinkSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import type { DexsSettings, SessionState } from "../core/types";

export type DoneTarget = "listening" | "idle";

export interface SessionCallbacks {
  onState(s: SessionState): void;
  onPartial(text: string): void;
  onUtterance(text: string): void;
  onError(msg: string): void;
  /** Fired once a transcription+correction pass lands; the renderer shows a
   *  brief finish flash, then returns to `back`. Never followed by onState,
   *  so it is safe to fire-and-forget. */
  onDone(back: DoneTarget): void;
}

const RMS_THRESHOLD = 500;
const HANGOVER_FRAMES = 14; // ~420ms at 30ms frames
const MAX_UTTERANCE_MS = 15000;
const FRAME = 480; // 30ms @ 16kHz

export class Session {
  private sherpa: SherpaStream | null = null;
  private injector: Injector = createInjector();
  private typedThisUtterance = "";
  private buffer: number[] = [];
  private speaking = false;
  private silenceFrames = 0;
  private running = false;
  private queue: Promise<void> = Promise.resolve();
  private sherpaDead = false;

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
    this.sherpaDead = false;
    this.cb.onState("listening");
    try {
      this.sherpa = new SherpaStream(this.settings);
      this.sherpa.onChunk((c) => {
        if (!c.final) {
          this.cb.onPartial(c.text);
          return;
        }
        console.log(`[dexs] streaming final: ${JSON.stringify(c.text)}`);
        this.enqueueType(c.text);
      });
      this.sherpa.start();
      this.sherpa.onError(() => {
        this.sherpaDead = true;
        this.sherpa = null;
        this.cb.onError("Streaming recognizer unavailable, using basic mode");
      });
    } catch (e) {
      console.error("[dexs] streaming recogniser init failed:", e);
      this.sherpa = null;
      this.sherpaDead = true;
      this.cb.onError("Streaming recognizer unavailable, using basic mode");
    }
  }

  feed(pcm16: Int16Array): void {
    if (!this.running) return;
    this.sherpa?.feed(pcm16);
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
    if (audio.length < 16000 * 0.25) return; // too short
    // Flush the pending partial so its text types now, then queue the review
    // pass behind it on the same serial chain.
    this.sherpa?.flush();
    this.enqueue(audio);
  }

  /** Type streamed text on the same serial chain as the corrections, so an
   *  utterance's text is always in place before its correction runs. */
  private enqueueType(text: string): void {
    this.queue = this.queue
      .then(() => this.injector.type(text))
      .then(() => {
        this.typedThisUtterance += text;
      })
      .catch(() => this.cb.onError("type failed"));
  }

  private enqueue(audio: Int16Array): void {
    this.queue = this.queue
      .then(() => this.correct(audio))
      .catch(() => this.cb.onError("failed"));
  }

  private async correct(audio: Int16Array): Promise<void> {
    // Runs on the serial chain, after this utterance's streamed text has been
    // typed: the accumulated text is exactly what sits in the target now.
    const typed = this.typedThisUtterance;
    this.typedThisUtterance = "";
    const wavPath = writeWav(audio);
    try {
      const text = await transcribeWhisper(
        this.settings,
        wavPath,
        this.settings.language,
      );
      this.cb.onUtterance(text);

      if (this.sherpaDead) {
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
        this.finish();
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
      this.finish();
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

  /** A transcription+correction pass landed on a live session:
   *  flash "done", then keep listening. */
  private finish(): void {
    if (this.running) this.cb.onDone("listening");
  }

  async stop(opts?: { silent?: boolean }): Promise<void> {
    if (!this.running) return;
    this.running = false;
    if (!opts?.silent) this.cb.onState("working");
    await this.sherpa?.stop();
    if (this.speaking && this.buffer.length > 0) {
      const audio = new Int16Array(this.buffer);
      this.buffer = [];
      this.sherpa?.flush();
      this.enqueue(audio);
    }
    this.sherpa = null;
    await this.queue;
    if (!opts?.silent) this.cb.onDone("idle");
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
