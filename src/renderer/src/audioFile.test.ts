import { describe, expect, it } from "vitest";
import {
  BLOCK_MS,
  SAMPLE_RATE,
  blockLevel,
  blocks,
  formatTime,
  isAudioFile,
  toMono16k,
} from "./audioFile";

describe("isAudioFile", () => {
  it("accepts audio by mime type", () => {
    expect(isAudioFile("clip", "audio/wav")).toBe(true);
    expect(isAudioFile("clip", "audio/mpeg")).toBe(true);
    expect(isAudioFile("clip", "audio/x-flac")).toBe(true);
  });

  it("accepts by extension when the mime type is missing", () => {
    expect(isAudioFile("memo.WAV", "")).toBe(true);
    expect(isAudioFile("memo.m4a", "application/octet-stream")).toBe(true);
    expect(isAudioFile("memo.opus", "")).toBe(true);
  });

  it("accepts the container types Chromium still decodes as audio", () => {
    expect(isAudioFile("take.webm", "video/webm")).toBe(true);
    expect(isAudioFile("take.mp4", "video/mp4")).toBe(true);
  });

  it("rejects everything else", () => {
    expect(isAudioFile("notes.txt", "text/plain")).toBe(false);
    expect(isAudioFile("photo.png", "image/png")).toBe(false);
    expect(isAudioFile("wav", "")).toBe(false);
    expect(isAudioFile("", "")).toBe(false);
  });
});

describe("toMono16k", () => {
  it("returns empty for empty input", () => {
    expect(toMono16k([], SAMPLE_RATE).length).toBe(0);
    expect(toMono16k([new Float32Array(0)], SAMPLE_RATE).length).toBe(0);
  });

  it("keeps length when already at 16 kHz", () => {
    const src = new Float32Array(1000);
    expect(toMono16k([src], SAMPLE_RATE).length).toBe(1000);
  });

  it("halves length when downsampling 32 kHz to 16 kHz", () => {
    expect(toMono16k([new Float32Array(32000)], 32000).length).toBe(16000);
  });

  it("doubles length when upsampling 8 kHz to 16 kHz", () => {
    expect(toMono16k([new Float32Array(8000)], 8000).length).toBe(16000);
  });

  it("averages stereo channels into mono", () => {
    const left = new Float32Array([1, 0]);
    const right = new Float32Array([-1, 0]);
    const out = toMono16k([left, right], SAMPLE_RATE);
    expect(out[0]).toBe(0);
    expect(out[1]).toBe(0);
  });

  it("scales floats into int16 range without wrapping", () => {
    const loud = new Float32Array([1, -1, 2, -2]);
    const out = toMono16k([loud], SAMPLE_RATE);
    expect(out[0]).toBe(32767);
    expect(out[1]).toBe(-32767);
    expect(out[2]).toBe(32767);
    expect(out[3]).toBe(-32768); // clamped to the int16 floor
  });

  it("stays proportional for a known signal", () => {
    const src = new Float32Array(1600).fill(0.5);
    const out = toMono16k([src], SAMPLE_RATE);
    expect(out[0]).toBeGreaterThan(16000);
    expect(out[0]).toBeLessThan(17000);
  });
});

describe("blockLevel", () => {
  it("is zero for silence and empty blocks", () => {
    expect(blockLevel(new Int16Array(0))).toBe(0);
    expect(blockLevel(new Int16Array(480).fill(0))).toBe(0);
  });

  it("rises with loudness and never exceeds 1", () => {
    const quiet = blockLevel(new Int16Array(480).fill(2000));
    const loud = blockLevel(new Int16Array(480).fill(20000));
    expect(quiet).toBeGreaterThan(0);
    expect(loud).toBeGreaterThan(quiet);
    expect(blockLevel(new Int16Array(480).fill(32767))).toBeLessThanOrEqual(1);
  });
});

describe("blocks", () => {
  it("splits into fixed-size blocks with a short tail", () => {
    const pcm = new Int16Array(250);
    const got = [...blocks(pcm, 100)];
    expect(got.map((b) => b.pcm.length)).toEqual([100, 100, 50]);
  });

  it("covers every sample exactly once", () => {
    const pcm = new Int16Array(250).fill(7);
    const seen = [...blocks(pcm, 100)].flatMap((b) => [...b.pcm]);
    expect(seen.length).toBe(250);
    expect(seen.every((v) => v === 7)).toBe(true);
  });

  it("yields nothing for an empty stream", () => {
    expect([...blocks(new Int16Array(0), 100)]).toEqual([]);
  });

  it("carries per-block loudness", () => {
    const pcm = new Int16Array(200);
    pcm.fill(0, 0, 100);
    pcm.fill(30000, 100, 200);
    const got = [...blocks(pcm, 100)];
    expect(got[0].level).toBe(0);
    expect(got[1].level).toBeGreaterThan(0.9);
  });

  it("uses 100 ms blocks at 16 kHz", () => {
    expect(BLOCK_MS * (SAMPLE_RATE / 1000)).toBe(1600);
  });
});

describe("formatTime", () => {
  it("formats seconds", () => {
    expect(formatTime(0)).toBe("0:00");
    expect(formatTime(9)).toBe("0:09");
    expect(formatTime(75)).toBe("1:15");
  });

  it("adds hours past 3600 s", () => {
    expect(formatTime(3661)).toBe("1:01:01");
  });

  it("clamps negatives to zero", () => {
    expect(formatTime(-5)).toBe("0:00");
  });
});
