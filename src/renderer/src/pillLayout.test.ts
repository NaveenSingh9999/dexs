import { describe, expect, it } from "vitest";
import {
  PILL_METRICS,
  clamp,
  estimateText,
  fixedSize,
  liveSize,
  idleScale,
  slotFor,
} from "./pillLayout";

const VP = { width: 1568, height: 720 };

describe("clamp", () => {
  it("bounds a value on both sides", () => {
    expect(clamp(5, 10, 20)).toBe(10);
    expect(clamp(50, 10, 20)).toBe(20);
    expect(clamp(15, 10, 20)).toBe(15);
  });
});

describe("fixedSize", () => {
  it("keeps idle and hover in one window so opening never resizes", () => {
    expect(fixedSize("idle")).toEqual({
      width: PILL_METRICS.openWidth,
      height: PILL_METRICS.openHeight,
    });
    expect(fixedSize("hover")).toEqual(fixedSize("idle"));
  });

  it("sizes the other states", () => {
    expect(fixedSize("error").width).toBe(PILL_METRICS.noticeWidth);
    expect(fixedSize("working").width).toBe(PILL_METRICS.compactWidth);
    expect(fixedSize("file").width).toBeGreaterThan(PILL_METRICS.openWidth);
  });
});

describe("idleScale", () => {
  it("produces the resting handle from the open box", () => {
    const scale = idleScale();
    expect(PILL_METRICS.openWidth * scale.x).toBe(PILL_METRICS.idleWidth);
    expect(PILL_METRICS.openHeight * scale.y).toBe(PILL_METRICS.idleHeight);
  });
});

describe("liveSize", () => {
  it("never goes below the minimum", () => {
    const size = liveSize({ lineWidth: 0, lines: 1 }, VP);
    expect(size.width).toBe(PILL_METRICS.minWidth);
    expect(size.height).toBe(PILL_METRICS.minHeight);
  });

  it("grows with the text", () => {
    const short = liveSize({ lineWidth: 80, lines: 1 }, VP);
    const long = liveSize({ lineWidth: 240, lines: 1 }, VP);
    expect(long.width).toBeGreaterThan(short.width);
  });

  it("grows with the number of lines", () => {
    const one = liveSize({ lineWidth: 100, lines: 1 }, VP);
    const three = liveSize({ lineWidth: 100, lines: 3 }, VP);
    expect(three.height).toBeGreaterThan(one.height);
  });

  it("clamps width to the viewport fraction", () => {
    const huge = liveSize({ lineWidth: 99999, lines: 1 }, VP);
    expect(huge.width).toBe(
      Math.round(VP.width * PILL_METRICS.maxWidthFraction),
    );
  });

  it("clamps height to the viewport fraction", () => {
    const huge = liveSize({ lineWidth: 300, lines: 99 }, VP);
    expect(huge.height).toBe(
      Math.round(VP.height * PILL_METRICS.maxHeightFraction),
    );
  });

  it("stays inside a tiny viewport rather than claiming the screen", () => {
    const tiny = liveSize(
      { lineWidth: 500, lines: 20 },
      {
        width: 200,
        height: 120,
      },
    );
    expect(tiny.width).toBeLessThanOrEqual(200);
    expect(tiny.height).toBeLessThanOrEqual(120);
    expect(tiny.scroll).toBe(true);
  });

  it("keeps the minimum on a normal screen", () => {
    const small = liveSize({ lineWidth: 10, lines: 1 }, VP);
    expect(small.width).toBe(PILL_METRICS.minWidth);
  });

  it("asks for scrolling when the content does not fit", () => {
    const big = liveSize({ lineWidth: 9999, lines: 99 }, VP);
    expect(big.scroll).toBe(true);
  });

  it("does not scroll when everything fits", () => {
    const small = liveSize({ lineWidth: 60, lines: 1 }, VP);
    expect(small.scroll).toBe(false);
  });

  it("reserves room for the stop button", () => {
    const withButton = liveSize({ lineWidth: 200, lines: 1 }, VP, true);
    const without = liveSize({ lineWidth: 200, lines: 1 }, VP, false);
    expect(withButton.width).toBeGreaterThan(without.width);
  });
});

describe("estimateText", () => {
  it("returns an empty measurement for blank text", () => {
    expect(estimateText("   ", 13.5, 300)).toEqual({ lineWidth: 0, lines: 1 });
  });

  it("keeps short text on one line", () => {
    expect(estimateText("hello there", 13.5, 400).lines).toBe(1);
  });

  it("wraps long text into multiple lines", () => {
    const text = "the quick brown fox jumps over the lazy dog again and again";
    expect(estimateText(text, 13.5, 200).lines).toBeGreaterThan(1);
  });

  it("scales the measured width with the font size", () => {
    const small = estimateText("hello", 10, 800);
    const large = estimateText("hello", 20, 800);
    expect(large.lineWidth).toBeGreaterThan(small.lineWidth);
  });

  it("never reports more width than the wrap box allows", () => {
    const m = estimateText("word ".repeat(200), 13.5, 250);
    expect(m.lineWidth).toBeLessThanOrEqual(250 * 2);
  });
});

describe("slotFor", () => {
  it("maps the nine regions", () => {
    expect(slotFor(10, 10, VP)).toEqual({ h: "h-left", v: "v-top" });
    expect(slotFor(VP.width / 2, VP.height / 2, VP)).toEqual({
      h: "h-center",
      v: "v-middle",
    });
    expect(slotFor(VP.width - 5, VP.height - 5, VP)).toEqual({
      h: "h-right",
      v: "v-bottom",
    });
  });

  it("puts a bottom-centre point in the centre column", () => {
    expect(slotFor(VP.width / 2, VP.height - 5, VP)).toEqual({
      h: "h-center",
      v: "v-bottom",
    });
  });
});
