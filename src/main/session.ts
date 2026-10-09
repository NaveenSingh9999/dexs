import { createInjector, type Injector } from "./injector";
import { SherpaStream, transcribeWhisper } from "./stt";
import { joinUtterances, type DeliverySummary } from "../core/delivery";
import { mkdtempSync, writeFileSync, unlinkSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import type { DexsSettings, SessionState } from "../core/settings";

export type DoneTarget = "listening" | "idle";

export interface SessionCallbacks {
  onState(s: SessionState): void;
  /** Live streaming text for the pill (not typed anywhere). */
  onPartial(text: string): void;
  /** Reviewed text for one finished utterance. */
  onUtterance(text: string): void;
  onError(msg: string): void;
  /** A take ended. `result` is where the transcript went, if it had one. */
  onDone(back: DoneTarget, result?: DeliverySummary): void;
}

const RMS_THRESHOLD = 500;
const HANGOVER_FRAMES = 14; // ~420ms at 30ms frames
const MAX_UTTERANCE_MS = 15000;
const FRAME = 480; // 30ms @ 16kHz

/**
 * One dictation run.
 *
 * Audio (microphone or a dropped file) is segmented by energy, the streaming
 * recogniser shows partials in the pill, and every finished utterance is sent
 * through the review pass. Nothing is typed while you speak: the accumulated
 * transcript is delivered once, when the take ends.
 */
export class Session {
  private sherpa: SherpaStream | null = null;
  private injector: Injector = createInjector();
  private reviewed: string[] = [];
  /** Latest streaming text, used when the review pass is switched off. */
  private sherpaTail = "";
  private buffer: number[] = [];
  private speaking = false;
  private silenceFrames = 0;
  private running = false;
  private queue: Promise<void> = Promise.resolve();

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
    this.reviewed = [];
    this.cb.onState("listening");
    try {
      this.sherpa = new SherpaStream(this.settings);
      this.sherpa.onChunk((c) => {
        if (c.final) this.sherpaTail = c.text;
        this.cb.onPartial(c.text);
      });
      this.sherpa.start();
      this.sherpa.onError(() => {
        this.sherpa = null;
        this.cb.onError("Streaming recognizer unavailable, using basic mode");
      });
    } catch (e) {
      console.error("[dexs] streaming recogniser init failed:", e);
      this.sherpa = null;
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
    this.sherpa?.flush();
    this.enqueue(audio);
  }

  private enqueue(audio: Int16Array): void {
    this.queue = this.queue
      .then(() => this.review(audio))
      .catch(() => this.cb.onError("failed"));
  }

  private async review(audio: Int16Array): Promise<void> {
    if (!this.settings.reviewEnabled) {
      // No review pass: the streaming text for this utterance is what we
      // deliver. Sherpa's endpoint fires late, so take the tail of the buffer
      // rather than waiting for a final that may never come.
      const text = this.sherpaTail.trim();
      this.sherpaTail = "";
      if (text) {
        this.reviewed.push(text);
        this.cb.onUtterance(text);
      }
      return;
    }
    const wavPath = writeWav(audio);
    try {
      const text = await transcribeWhisper(
        this.settings,
        wavPath,
        this.settings.language,
      );
      if (!text.trim()) return;
      this.reviewed.push(text);
      this.cb.onUtterance(text);
    } catch {
      this.cb.onError("review failed");
    } finally {
      try {
        unlinkSync(wavPath);
      } catch {
        /* ignore */
      }
    }
  }

  /** The transcript this run has produced so far. */
  get transcript(): string {
    return joinUtterances(this.reviewed);
  }

  /** Deliver the transcript, if there is one. */
  async deliver(): Promise<DeliverySummary | null> {
    const text = this.transcript;
    if (!text) return null;
    if (!this.settings.pasteOnFinish) {
      await this.injector.copy(text);
      return { where: "clipboard", message: "Copied to clipboard" };
    }
    const r = await this.injector.deliver(text, {
      clipboardFallback: this.settings.clipboardFallback,
    });
    if (!r) return null;
    return { where: r.where, message: r.message };
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
    if (!opts?.silent) {
      const result = await this.deliver();
      this.cb.onDone("idle", result ?? undefined);
    }
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
