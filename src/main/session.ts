import { vadSegment } from "../core/vad";
import { planCorrection } from "../core/differ";
import { createInjector, applyCorrection } from "./injector";
import { VoskStream, transcribeWhisper } from "./stt";
import { mkdtempSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import type { DexsSettings, SessionState } from "../core/types";

export interface SessionCallbacks {
  onState(s: SessionState): void;
  onPartial(text: string): void;
}

export class Session {
  private vosk: VoskStream | null = null;
  private typedForSegment = "";
  private allTyped = "";
  private segmentAudio: number[] = [];
  private cb: SessionCallbacks;
  private running = false;

  constructor(
    private settings: DexsSettings,
    cb: SessionCallbacks,
  ) {
    this.cb = cb;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.typedForSegment = "";
    this.allTyped = "";
    this.segmentAudio = [];
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
        const injector = createInjector();
        injector.type(c.text).then(() => {
          this.typedForSegment += c.text;
          this.allTyped += c.text;
        });
      });
      this.vosk.start();
    } catch {
      this.vosk = null;
    }
  }

  feed(pcm16: Int16Array): void {
    if (!this.running) return;
    this.segmentAudio.push(...pcm16);
    this.vosk?.feed(pcm16);
  }

  async stop(): Promise<void> {
    if (!this.running) return;
    this.running = false;
    this.cb.onState("working");
    await this.vosk?.stop();
    this.vosk = null;

    const audio = new Int16Array(this.segmentAudio);
    const segments = vadSegment(audio);
    for (const seg of segments) {
      const slice = audio.slice(seg.startSample, seg.endSample);
      const wavPath = writeWav(slice);
      try {
        const text = await transcribeWhisper(
          this.settings.whisperBin,
          this.settings.whisperModel,
          wavPath,
          this.settings.language,
        );
        const correction = planCorrection(
          this.typedForSegment.trim(),
          text.trim(),
        );
        if (correction) {
          const injector = createInjector();
          await applyCorrection(
            injector,
            correction.backspaces,
            correction.insert,
          );
        }
        this.typedForSegment = "";
      } catch {
        /* whisper unavailable: keep vosk text */
      }
    }
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
