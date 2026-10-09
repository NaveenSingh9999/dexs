import { mkdtempSync, rmSync, writeFileSync, mkdirSync, statSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { afterEach, describe, expect, it } from "vitest";
import {
  MODELS,
  findModel,
  installedBytes,
  isInstalled,
  modelStatuses,
  partialName,
  planDownload,
} from "./models";

const roots: string[] = [];
function root(): string {
  const r = mkdtempSync(join(tmpdir(), "dexs-models-"));
  roots.push(r);
  return r;
}

afterEach(() => {
  while (roots.length) rmSync(roots.pop()!, { recursive: true, force: true });
});

/** Materialise every file of a model so it counts as installed. */
function install(r: string, id: string): void {
  const spec = findModel(id)!;
  mkdirSync(join(r, id), { recursive: true });
  for (const f of spec.files) writeFileSync(join(r, id, f.name), "x");
}

describe("catalog", () => {
  it("has a streaming and a review model", () => {
    expect(MODELS.map((m) => m.role).sort()).toEqual(["review", "streaming"]);
  });

  it("names the exact files the recogniser loads", () => {
    const streaming = findModel(
      "sherpa-onnx-streaming-zipformer-en-2023-06-26",
    )!;
    expect(streaming.files.map((f) => f.name)).toEqual([
      "encoder-epoch-99-avg-1-chunk-16-left-128.int8.onnx",
      "decoder-epoch-99-avg-1-chunk-16-left-128.onnx",
      "joiner-epoch-99-avg-1-chunk-16-left-128.int8.onnx",
      "tokens.txt",
    ]);
    const review = findModel("sherpa-onnx-whisper-tiny.en")!;
    expect(review.files.map((f) => f.name)).toEqual([
      "tiny.en-encoder.int8.onnx",
      "tiny.en-decoder.int8.onnx",
      "tiny.en-tokens.txt",
    ]);
  });

  it("downloads over https from the sherpa model repo", () => {
    for (const m of MODELS) {
      for (const f of m.files)
        expect(f.url).toMatch(/^https:\/\/huggingface\.co\//);
    }
  });

  it("has unique ids", () => {
    expect(new Set(MODELS.map((m) => m.id)).size).toBe(MODELS.length);
  });
});

describe("isInstalled", () => {
  it("is false for an empty root", () => {
    const spec = MODELS[0];
    expect(isInstalled(spec, root())).toBe(false);
  });

  it("is false when one file is missing", () => {
    const r = root();
    install(r, MODELS[0].id);
    rmSync(join(r, MODELS[0].id, "tokens.txt"));
    expect(isInstalled(MODELS[0], r)).toBe(false);
  });

  it("ignores zero-length files", () => {
    const r = root();
    install(r, MODELS[0].id);
    writeFileSync(join(r, MODELS[0].id, "tokens.txt"), "");
    expect(isInstalled(MODELS[0], r)).toBe(false);
  });

  it("is true once every file is present", () => {
    const r = root();
    install(r, MODELS[0].id);
    expect(isInstalled(MODELS[0], r)).toBe(true);
  });
});

describe("planDownload", () => {
  it("returns null for an unknown id", () => {
    expect(planDownload("nope", root())).toBeNull();
  });

  it("lists every file for a fresh install", () => {
    const plan = planDownload(MODELS[0].id, root())!;
    expect(plan.files).toHaveLength(MODELS[0].files.length);
  });

  it("skips files that are already there", () => {
    const r = root();
    install(r, MODELS[0].id);
    expect(planDownload(MODELS[0].id, r)!.files).toHaveLength(0);
  });

  it("re-downloads a truncated file", () => {
    const r = root();
    install(r, MODELS[0].id);
    writeFileSync(join(r, MODELS[0].id, "tokens.txt"), "");
    const plan = planDownload(MODELS[0].id, r)!;
    expect(plan.files.map((f) => f.name)).toEqual(["tokens.txt"]);
  });
});

describe("modelStatuses", () => {
  it("reports every model with its size on disk", () => {
    const r = root();
    install(r, MODELS[1].id);
    const st = modelStatuses(r);
    expect(st).toHaveLength(MODELS.length);
    expect(st.find((s) => s.id === MODELS[1].id)!.installed).toBe(true);
    expect(st.find((s) => s.id === MODELS[1].id)!.bytes).toBeGreaterThan(0);
    expect(st.find((s) => s.id === MODELS[0].id)!.installed).toBe(false);
    expect(st.find((s) => s.id === MODELS[0].id)!.bytes).toBe(0);
  });
});

describe("installedBytes", () => {
  it("sums every file in the model directory", () => {
    const r = root();
    const id = MODELS[0].id;
    install(r, id);
    const dir = join(r, id);
    const expected = MODELS[0].files.reduce(
      (sum, f) => sum + statSync(join(dir, f.name)).size,
      0,
    );
    expect(installedBytes(MODELS[0], r)).toBe(expected);
  });
});

describe("partialName", () => {
  it("marks a file as in flight", () => {
    expect(partialName(MODELS[0].files[0])).toBe(
      "encoder-epoch-99-avg-1-chunk-16-left-128.int8.onnx.part",
    );
  });
});
