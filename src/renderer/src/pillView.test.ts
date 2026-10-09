import { describe, expect, it } from "vitest";
import { PILL_METRICS } from "./pillLayout";
import { pillView, textOpacity, type PillInput } from "./pillView";

const base: PillInput = {
  state: "listening",
  hover: false,
  playing: false,
  settled: "",
  partial: "",
  settings: { dynamicSize: true, dimPartials: true, showStopButton: true },
  viewport: { width: 1920, height: 1080 },
};

const withText = (over: Partial<PillInput> = {}): PillInput => ({
  ...base,
  partial: "the quick brown fox",
  ...over,
});

describe("pillView text", () => {
  it("joins settled and partial text with a space", () => {
    expect(pillView(withText({ settled: "hello" })).text).toBe(
      "hello the quick brown fox",
    );
  });

  it("trims both halves", () => {
    expect(pillView(withText({ settled: "  hi  " })).text).toBe(
      "hi the quick brown fox",
    );
  });

  it("has no text while idle", () => {
    const v = pillView({ ...base, state: "idle", partial: "leftovers" });
    expect(v.showText).toBe(false);
    expect(v.showWave).toBe(false);
  });

  it("hides the text when a file is playing", () => {
    const v = pillView(withText({ playing: true }));
    expect(v.showText).toBe(false);
  });
});

describe("pillView provisional", () => {
  it("marks unconfirmed streaming text as provisional", () => {
    expect(pillView(withText()).provisional).toBe(true);
  });

  it("stops being provisional once a phrase is reviewed", () => {
    expect(pillView(withText({ settled: "Reviewed." })).provisional).toBe(
      false,
    );
  });

  it("honours the dim setting", () => {
    const v = pillView(
      withText({
        settings: {
          dynamicSize: true,
          dimPartials: false,
          showStopButton: true,
        },
      }),
    );
    expect(v.provisional).toBe(false);
    expect(textOpacity(v)).toBe(0.95);
  });

  it("dims the guess when dimming is on", () => {
    expect(textOpacity(pillView(withText()))).toBe(0.55);
  });
});

describe("pillView stop button", () => {
  it("shows while dictating", () => {
    expect(pillView(withText()).showStop).toBe(true);
  });

  it("hides when the user turns it off", () => {
    const v = pillView(
      withText({
        settings: {
          dynamicSize: true,
          dimPartials: true,
          showStopButton: false,
        },
      }),
    );
    expect(v.showStop).toBe(false);
  });

  it("hides when a file is playing", () => {
    expect(pillView(withText({ playing: true })).showStop).toBe(false);
  });

  it("never survives into the done state", () => {
    expect(pillView(withText({ state: "done", partial: "" })).showStop).toBe(
      false,
    );
  });
});

describe("pillView window size", () => {
  it("grows with the text", () => {
    const short = pillView({ ...base, partial: "hi" }).windowSize;
    const long = pillView(withText()).windowSize;
    expect(long.width).toBeGreaterThan(short.width);
  });

  it("never resizes between idle and hover", () => {
    // Both states must ask the OS for the same window, or opening resizes and
    // re-anchors the borderless window every frame and the pill visibly dips.
    const idle = pillView({ ...base, state: "idle" });
    const hover = pillView({ ...base, state: "idle", hover: true });
    expect(idle.windowSize).toEqual(hover.windowSize);
  });

  it("opens by scaling the pill, not by resizing the window", () => {
    const rest = pillView({ ...base, state: "idle" });
    expect(rest.pillScale.x).toBeLessThan(1);
    expect(rest.pillScale.y).toBeLessThan(1);
    // The scaled shape is exactly the resting handle.
    expect(rest.windowSize.width * rest.pillScale.x).toBe(
      PILL_METRICS.idleWidth,
    );
    expect(rest.windowSize.height * rest.pillScale.y).toBe(
      PILL_METRICS.idleHeight,
    );
    const open = pillView({ ...base, state: "idle", hover: true });
    expect(open.pillScale).toEqual({ x: 1, y: 1 });
  });

  it("fits the two controls with no leftover gutters", () => {
    const v = pillView({ ...base, state: "idle", hover: true });
    const m = PILL_METRICS;
    const needed = m.control * 2 + m.controlGap + m.controlPadding * 2;
    // A cushion for the hover ring is fine; a 50px gutter on either side is
    // what the old fixed 132px box gave you.
    expect(v.windowSize.width - needed).toBeLessThanOrEqual(4);
  });

  it("is the fixed size when growing is switched off", () => {
    const v = pillView(
      withText({
        settings: {
          dynamicSize: false,
          dimPartials: true,
          showStopButton: true,
        },
      }),
    );
    expect(v.scroll).toBe(true);
  });

  it("stays inside the screen", () => {
    const v = pillView(
      withText({
        partial: "word ".repeat(120),
        viewport: { width: 480, height: 320 },
      }),
    );
    expect(v.windowSize.width).toBeLessThanOrEqual(480 * 0.42 + 1);
    expect(v.windowSize.height).toBeLessThanOrEqual(320 * 0.3 + 1);
  });
});

describe("pillView messages", () => {
  it("shows the delivery notice only while done", () => {
    expect(pillView(withText({ state: "done", notice: "Pasted" })).notice).toBe(
      "Pasted",
    );
    expect(pillView(withText({ notice: "Pasted" })).notice).toBe("");
  });

  it("carries the error text only while in error", () => {
    expect(pillView({ ...base, state: "error", error: "Mic gone" }).error).toBe(
      "Mic gone",
    );
    expect(pillView(withText({ error: "Mic gone" })).error).toBe("");
  });
});
