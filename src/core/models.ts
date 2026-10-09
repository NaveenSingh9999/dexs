/**
 * The speech models Dexs can fetch, and how to fetch them.
 *
 * Kept as plain data (with the file lists the recogniser actually needs) so the
 * catalog is unit-testable and the downloader has nothing to guess.
 */
import { existsSync, statSync, readdirSync } from "fs";
import { join } from "path";

export interface ModelFile {
  name: string;
  url: string;
  /** Bytes; 0 when the server does not report a length. */
  size: number;
}

export interface ModelSpec {
  id: string;
  title: string;
  /** One line, no marketing. */
  blurb: string;
  /** Rough download size for the picker. */
  sizeMB: number;
  role: "streaming" | "review";
  files: ModelFile[];
}

const HF = "https://huggingface.co/csukuangfj/sherpa-onnx";

const streamBase = `${HF}/sherpa-onnx-streaming-zipformer-en-2023-06-26/resolve/main`;
const tinyBase = `${HF}/sherpa-onnx-whisper-tiny.en/resolve/main`;

export const MODELS: ModelSpec[] = [
  {
    id: "sherpa-onnx-streaming-zipformer-en-2023-06-26",
    title: "Zipformer (streaming, English)",
    blurb: "Shows words while you speak. 73 MB.",
    sizeMB: 73,
    role: "streaming",
    files: [
      {
        name: "encoder-epoch-99-avg-1-chunk-16-left-128.int8.onnx",
        url: `${streamBase}/encoder-epoch-99-avg-1-chunk-16-left-128.int8.onnx`,
        size: 0,
      },
      {
        name: "decoder-epoch-99-avg-1-chunk-16-left-128.onnx",
        url: `${streamBase}/decoder-epoch-99-avg-1-chunk-16-left-128.onnx`,
        size: 0,
      },
      {
        name: "joiner-epoch-99-avg-1-chunk-16-left-128.int8.onnx",
        url: `${streamBase}/joiner-epoch-99-avg-1-chunk-16-left-128.int8.onnx`,
        size: 0,
      },
      { name: "tokens.txt", url: `${streamBase}/tokens.txt`, size: 0 },
    ],
  },
  {
    id: "sherpa-onnx-whisper-tiny.en",
    title: "Whisper tiny.en (review)",
    blurb: "Fixes punctuation and casing before delivery. 78 MB.",
    sizeMB: 78,
    role: "review",
    files: [
      {
        name: "tiny.en-encoder.int8.onnx",
        url: `${tinyBase}/tiny.en-encoder.int8.onnx`,
        size: 0,
      },
      {
        name: "tiny.en-decoder.int8.onnx",
        url: `${tinyBase}/tiny.en-decoder.int8.onnx`,
        size: 0,
      },
      {
        name: "tiny.en-tokens.txt",
        url: `${tinyBase}/tiny.en-tokens.txt`,
        size: 0,
      },
    ],
  },
];

export function findModel(id: string): ModelSpec | undefined {
  return MODELS.find((m) => m.id === id);
}

/** A model counts as installed once every file it needs is on disk. */
export function isInstalled(spec: ModelSpec, root: string): boolean {
  const dir = join(root, spec.id);
  if (!existsSync(dir)) return false;
  return spec.files.every((f) => {
    const p = join(dir, f.name);
    try {
      return statSync(p).size > 0;
    } catch {
      return false;
    }
  });
}

export interface ModelStatus {
  id: string;
  installed: boolean;
  /** Bytes already on disk. */
  bytes: number;
  sizeMB: number;
}

export function modelStatuses(root: string): ModelStatus[] {
  return MODELS.map((m) => ({
    id: m.id,
    installed: isInstalled(m, root),
    bytes: installedBytes(m, root),
    sizeMB: m.sizeMB,
  }));
}

export function installedBytes(spec: ModelSpec, root: string): number {
  const dir = join(root, spec.id);
  if (!existsSync(dir)) return 0;
  let total = 0;
  try {
    for (const name of readdirSync(dir)) {
      try {
        total += statSync(join(dir, name)).size;
      } catch {
        /* skip */
      }
    }
  } catch {
    /* skip */
  }
  return total;
}

/** Drop a `.part` file when a download was cancelled or failed. */
export function partialName(file: ModelFile): string {
  return `${file.name}.part`;
}

export interface DownloadPlan {
  modelId: string;
  root: string;
  dir: string;
  files: ModelFile[];
  bytes: number;
}

export function planDownload(id: string, root: string): DownloadPlan | null {
  const spec = findModel(id);
  if (!spec) return null;
  const dir = join(root, spec.id);
  const files = spec.files.filter(
    (f) =>
      !existsSync(join(dir, f.name)) || statOrZero(join(dir, f.name)) === 0,
  );
  return { modelId: id, root, dir, files, bytes: files.length };
}

function statOrZero(p: string): number {
  try {
    return statSync(p).size;
  } catch {
    return 0;
  }
}
