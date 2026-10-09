import os from "os";
import path from "path";
import type { DexsSettings } from "../core/types";

export interface SttChunk {
  text: string;
  final: boolean;
}

export interface StreamingStt {
  start(): void;
  feed(pcm16: Int16Array): void;
  onChunk(cb: (c: SttChunk) => void): void;
  onError(cb: () => void): void;
  /** Emit whatever the recogniser has decoded so far as a final chunk and
   *  reset its stream. The session calls this when *its* VAD ends an
   *  utterance, because that happens sooner than the model's own endpoint
   *  rules and would otherwise never surface the partial text. */
  flush(): void;
  stop(): Promise<string>;
}

let sherpaCached: SherpaModule | null = null;

function getSherpa(): SherpaModule {
  if (!sherpaCached) {
    // Native addon — resolved at runtime from node_modules. Electron
    // externalises dependencies, and asarUnpack puts the real files under
    // app.asar.unpacked so process.dlopen() can load them.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    sherpaCached = require("sherpa-onnx-node") as SherpaModule;
  }
  return sherpaCached;
}

function modelsRoot(settings: DexsSettings): string {
  return settings.modelsDir || path.join(os.homedir(), ".dexs", "models");
}

interface SherpaModule {
  OnlineRecognizer: new (config: unknown) => OnlineRecognizer;
  OfflineRecognizer: new (config: unknown) => OfflineRecognizer;
  readWave: (
    p: string,
    // false => copy into a normal ArrayBuffer. Electron's Node rejects the
    // external buffer the addon uses by default.
    external?: boolean,
  ) => { samples: Float32Array; sampleRate: number };
}

interface OnlineRecognizer {
  createStream(): OnlineStream;
  isReady(stream: OnlineStream): boolean;
  decode(stream: OnlineStream): void;
  isEndpoint(stream: OnlineStream): boolean;
  reset(stream: OnlineStream): void;
  getResult(stream: OnlineStream): { text?: string } | null;
}

interface OnlineStream {
  acceptWaveform(obj: { samples: Float32Array; sampleRate: number }): void;
  inputFinished(): void;
}

interface OfflineRecognizer {
  createStream(): OfflineStream;
  decode(stream: OfflineStream): void;
  getResult(stream: OfflineStream): { text?: string } | null;
}

interface OfflineStream {
  acceptWaveform(obj: { samples: Float32Array; sampleRate: number }): void;
}

/** Live streaming recognizer (sherpa-onnx zipformer, English). */
export class SherpaStream implements StreamingStt {
  private recognizer: OnlineRecognizer | null = null;
  private stream: OnlineStream | null = null;
  private cb: ((c: SttChunk) => void) | null = null;
  private errCb: (() => void) | null = null;

  constructor(private settings: DexsSettings) {}

  start(): void {
    try {
      const sherpa = getSherpa();
      const dir = path.join(
        modelsRoot(this.settings),
        "sherpa-onnx-streaming-zipformer-en-2023-06-26",
      );
      this.recognizer = new sherpa.OnlineRecognizer({
        featConfig: { sampleRate: 16000, featureDim: 80 },
        modelConfig: {
          transducer: {
            encoder: path.join(
              dir,
              "encoder-epoch-99-avg-1-chunk-16-left-128.int8.onnx",
            ),
            decoder: path.join(
              dir,
              "decoder-epoch-99-avg-1-chunk-16-left-128.onnx",
            ),
            joiner: path.join(
              dir,
              "joiner-epoch-99-avg-1-chunk-16-left-128.int8.onnx",
            ),
          },
          tokens: path.join(dir, "tokens.txt"),
          numThreads: 2,
          debug: 0,
        },
        decodingMethod: "greedy_search",
        enableEndpoint: true,
        rule1MinTrailingSilence: 1.2,
        rule2MinTrailingSilence: 0.8,
        rule3MinUtteranceLength: 20,
      });
      this.stream = this.recognizer.createStream();
    } catch (e) {
      console.error("streaming recognizer init failed:", e);
      this.recognizer = null;
      this.stream = null;
      this.errCb?.();
    }
  }

  feed(pcm16: Int16Array): void {
    if (!this.recognizer || !this.stream) return;
    const samples = new Float32Array(pcm16.length);
    for (let i = 0; i < pcm16.length; i++) samples[i] = pcm16[i] / 32768;
    try {
      this.stream.acceptWaveform({ samples, sampleRate: 16000 });
      while (this.recognizer.isReady(this.stream)) {
        this.recognizer.decode(this.stream);
      }
      const result = this.recognizer.getResult(this.stream);
      const text = (result?.text ?? "").trim();
      if (text) this.cb?.({ text, final: false });
      if (this.recognizer.isEndpoint(this.stream)) {
        if (text) this.cb?.({ text, final: true });
        this.recognizer.reset(this.stream);
      }
    } catch (e) {
      console.error("streaming decode failed:", e);
    }
  }

  flush(): void {
    const rec = this.recognizer;
    const st = this.stream;
    if (!rec || !st) return;
    try {
      while (rec.isReady(st)) rec.decode(st);
      const text = (rec.getResult(st)?.text ?? "").trim();
      if (text) this.cb?.({ text, final: true });
      rec.reset(st);
    } catch (e) {
      console.error("streaming flush failed:", e);
    }
  }

  onChunk(cb: (c: SttChunk) => void): void {
    this.cb = cb;
  }

  onError(cb: () => void): void {
    this.errCb = cb;
  }

  async stop(): Promise<string> {
    if (!this.recognizer || !this.stream) return "";
    try {
      this.stream.inputFinished();
      while (this.recognizer.isReady(this.stream)) {
        this.recognizer.decode(this.stream);
      }
      const result = this.recognizer.getResult(this.stream);
      const text = (result?.text ?? "").trim();
      if (text) this.cb?.({ text, final: true });
      this.recognizer.reset(this.stream);
      this.recognizer = null;
      this.stream = null;
      return text;
    } catch {
      this.recognizer = null;
      this.stream = null;
      return "";
    }
  }
}

/** Offline whisper review-pass over a stored segment. */
export async function transcribeWhisper(
  settings: DexsSettings,
  wavPath: string,
  lang: string,
): Promise<string> {
  const sherpa = getSherpa();
  const dir = path.join(modelsRoot(settings), "sherpa-onnx-whisper-tiny.en");
  const recognizer = new sherpa.OfflineRecognizer({
    featConfig: { sampleRate: 16000, featureDim: 80 },
    modelConfig: {
      whisper: {
        encoder: path.join(dir, "tiny.en-encoder.int8.onnx"),
        decoder: path.join(dir, "tiny.en-decoder.int8.onnx"),
        ...(lang && lang !== "en" ? { language: lang } : {}),
        task: "transcribe",
      },
      tokens: path.join(dir, "tiny.en-tokens.txt"),
      numThreads: 2,
      debug: 0,
    },
  });
  const stream = recognizer.createStream();
  const wave = sherpa.readWave(wavPath, false);
  stream.acceptWaveform({
    samples: wave.samples,
    sampleRate: wave.sampleRate,
  });
  recognizer.decode(stream);
  const result = recognizer.getResult(stream);
  return (result?.text ?? "").trim();
}
