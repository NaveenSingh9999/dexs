import { spawn } from "child_process";

export interface SttChunk {
  text: string;
  final: boolean;
}

export interface StreamingStt {
  start(): void;
  feed(pcm16: Int16Array): void;
  onChunk(cb: (c: SttChunk) => void): void;
  stop(): Promise<string>;
}

export class VoskStream implements StreamingStt {
  private proc: ReturnType<typeof spawn> | null = null;
  private cb: ((c: SttChunk) => void) | null = null;
  private buf = "";
  private errCb: (() => void) | null = null;

  constructor(
    private bin: string,
    private modelDir: string,
    private lang: string,
  ) {}

  start(): void {
    this.buf = "";
    this.proc = spawn(
      this.bin,
      ["--model", this.modelDir, "--lang", this.lang],
      {
        stdio: ["pipe", "pipe", "inherit"],
      },
    );
    this.proc.on("error", () => {
      this.errCb?.();
    });
    this.proc.stdout!.on("data", (d: Buffer) => {
      this.buf += d.toString("utf8");
      let idx: number;
      while ((idx = this.buf.indexOf("\n")) >= 0) {
        const line = this.buf.slice(0, idx);
        this.buf = this.buf.slice(idx + 1);
        this.handleLine(line);
      }
    });
  }

  private handleLine(line: string): void {
    try {
      const obj = JSON.parse(line);
      if (obj.partial) this.cb?.({ text: obj.partial, final: false });
      if (obj.text) this.cb?.({ text: obj.text, final: true });
    } catch {
      /* partial json line */
    }
  }

  feed(pcm16: Int16Array): void {
    this.proc?.stdin?.write(
      Buffer.from(pcm16.buffer, pcm16.byteOffset, pcm16.byteLength),
    );
  }

  onChunk(cb: (c: SttChunk) => void): void {
    this.cb = cb;
  }

  onError(cb: () => void): void {
    this.errCb = cb;
  }

  async stop(): Promise<string> {
    return new Promise((resolve) => {
      if (!this.proc) return resolve("");
      this.proc.stdin?.end();
      this.proc.on("close", () => resolve(""));
      setTimeout(() => {
        this.proc?.kill();
        resolve("");
      }, 5000);
    });
  }
}

export function transcribeWhisper(
  whisperBin: string,
  modelPath: string,
  wavPath: string,
  lang: string,
  timeoutMs = 30000,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const to = setTimeout(() => {
      p.kill();
      reject(new Error("whisper timeout"));
    }, timeoutMs);
    const args = [
      "-m",
      modelPath,
      "-f",
      wavPath,
      "-l",
      lang,
      "--no-timestamps",
      "-otxt",
    ];
    const p = spawn(whisperBin, args, { stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    p.stdout.on("data", (d) => (out += d.toString()));
    p.on("close", (code) => {
      clearTimeout(to);
      if (code === 0) resolve(out.trim());
      else reject(new Error(`whisper exit ${code}`));
    });
    p.on("error", (e) => {
      clearTimeout(to);
      reject(e);
    });
  });
}
