import { it, expect } from "vitest";
import { vadSegment } from "./vad";

it("detects a single speech burst", () => {
  const pcm = new Int16Array(16000);
  for (let i = 1600; i < 8000; i++) pcm[i] = 2000;
  const segs = vadSegment(pcm);
  expect(segs).toHaveLength(1);
  expect(segs[0].startSample).toBeLessThanOrEqual(1600);
  expect(segs[0].endSample).toBeGreaterThanOrEqual(8000);
});

it("ignores silence", () => {
  const pcm = new Int16Array(16000);
  expect(vadSegment(pcm)).toHaveLength(0);
});

it("splits two bursts separated by long silence", () => {
  const pcm = new Int16Array(32000);
  for (let i = 1600; i < 8000; i++) pcm[i] = 2000;
  for (let i = 22400; i < 28800; i++) pcm[i] = 2000;
  expect(vadSegment(pcm)).toHaveLength(2);
});
