import {
  createWriteStream,
  existsSync,
  mkdirSync,
  renameSync,
  statSync,
  unlinkSync,
} from "fs";
import { pipeline } from "stream/promises";
import { Readable, Transform } from "stream";
import { join } from "path";
import {
  findModel,
  isInstalled,
  modelStatuses,
  partialName,
  planDownload,
  type ModelFile,
} from "../core/models";

export interface DownloadProgress {
  modelId: string;
  file: string;
  /** 0..1 for the whole model, not just this file. */
  progress: number;
  receivedBytes: number;
  totalBytes: number;
  done: boolean;
  error?: string;
}

export type ProgressFn = (p: DownloadProgress) => void;

/**
 * Streaming model downloader.
 *
 * Files land as `.part` and are renamed only once complete, so an interrupted
 * download never leaves a truncated file that looks installed.
 */
export class ModelDownloader {
  private cancelled = new Set<string>();

  cancel(modelId: string): void {
    this.cancelled.add(modelId);
  }

  async download(
    modelId: string,
    root: string,
    onProgress: ProgressFn,
  ): Promise<void> {
    const spec = findModel(modelId);
    const plan = planDownload(modelId, root);
    if (!spec || !plan) throw new Error(`unknown model: ${modelId}`);
    this.cancelled.delete(modelId);
    mkdirSync(plan.dir, { recursive: true });

    const total = plan.files.reduce((sum, f) => sum + knownSize(f), 0);
    let seen = 0;

    for (const file of plan.files) {
      if (this.cancelled.has(modelId)) throw new Error("cancelled");
      const dest = join(plan.dir, file.name);
      const part = join(plan.dir, partialName(file));
      await this.fetchFile(file, part, (chunk) => {
        seen += chunk;
        onProgress({
          modelId,
          file: file.name,
          progress: total > 0 ? Math.min(0.999, seen / total) : 0,
          receivedBytes: seen,
          totalBytes: total,
          done: false,
        });
      });
      renameSync(part, dest);
      seen += knownSize(file);
      onProgress({
        modelId,
        file: file.name,
        progress: 1,
        receivedBytes: seen,
        totalBytes: total || seen,
        done: true,
      });
    }
    if (!isInstalled(spec, root)) throw new Error("download incomplete");
  }

  private async fetchFile(
    file: ModelFile,
    dest: string,
    onChunk: (n: number) => void,
  ): Promise<void> {
    const res = await fetch(file.url, { redirect: "follow" });
    if (!res.ok || !res.body)
      throw new Error(`${file.name}: HTTP ${res.status}`);
    const out = createWriteStream(dest);
    const counter = new TransformCounter(onChunk);
    await pipeline(Readable.fromWeb(res.body as never), counter, out);
    if (statSync(dest).size === 0) throw new Error(`${file.name}: empty file`);
  }

  /** Remove an installed model and any half-downloaded leftovers. */
  remove(modelId: string, root: string): void {
    const spec = findModel(modelId);
    if (!spec) return;
    const dir = join(root, modelId);
    if (!existsSync(dir)) return;
    for (const f of spec.files) {
      for (const p of [join(dir, f.name), join(dir, partialName(f))]) {
        try {
          unlinkSync(p);
        } catch {
          /* already gone */
        }
      }
    }
  }

  statuses(root: string): ReturnType<typeof modelStatuses> {
    return modelStatuses(root);
  }
}

class TransformCounter extends Transform {
  constructor(onChunk: (n: number) => void) {
    super();
    this.on("data", (c: Buffer) => onChunk(c.length));
  }
}

function knownSize(f: ModelFile): number {
  return f.size;
}
