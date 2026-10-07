import { describe, expect, it } from "vitest";
import { barHeight } from "./wave";

describe("barHeight", () => {
  it("collapses to the 4px floor in silence", () => {
    for (let i = 0; i < 7; i++) {
      expect(barHeight(0, i, 12.3)).toBe(4);
    }
  });

  it("never drops below the floor, even for bad input", () => {
    expect(barHeight(-2, 3, 100)).toBe(4);
    expect(barHeight(0.5, 0, Number.MAX_VALUE)).toBeGreaterThanOrEqual(4);
  });

  it("grows with amplitude", () => {
    expect(barHeight(1, 0, 0)).toBeGreaterThan(barHeight(0.2, 0, 0));
  });

  it("reaches full span at a wave crest", () => {
    // index*1.1 - time*3.2 = -PI/2  =>  |sin| = 1
    const crest = -Math.PI / (2 * 3.2);
    expect(barHeight(1, 0, crest)).toBeCloseTo(24, 6);
  });

  it("travels: the same bar differs as time advances", () => {
    expect(barHeight(1, 0, 0)).not.toBe(barHeight(1, 0, 0.5));
  });

  it("differs across bars at a fixed time", () => {
    const heights = Array.from({ length: 7 }, (_, i) => barHeight(1, i, 0));
    expect(new Set(heights).size).toBeGreaterThan(1);
  });

  it("stays within the pill for any sane amplitude", () => {
    for (let i = 0; i < 7; i++) {
      for (let t = 0; t < 10; t += 0.13) {
        const h = barHeight(1, i, t);
        expect(h).toBeGreaterThanOrEqual(4);
        expect(h).toBeLessThanOrEqual(24);
      }
    }
  });
});
