/**
 * What the pill should look like right now.
 *
 * The component stays dumb: state, text and settings go in, a view model comes
 * out. That keeps every "should the stop button be there / should the pill
 * grow / is this word settled yet" decision testable without a DOM.
 *
 * Two sizes come out of here. `windowSize` is the real borderless window the OS
 * composites, and it only changes when the pill genuinely needs more room.
 * `pillScale` shrinks the pill into its resting 64x22 handle without touching
 * the window, so opening and closing is one compositor transform instead of a
 * window resize per frame.
 */
import {
  PILL_METRICS,
  estimateText,
  fixedSize,
  liveSize,
  type Rect,
} from "./pillLayout";

export type PillState = "idle" | "listening" | "working" | "done" | "error";

export interface PillInput {
  state: PillState;
  /** Hover on the pill, which opens it into its controls. */
  hover: boolean;
  /** Playing a dropped file rather than dictating. */
  playing: boolean;
  /** Text the streaming recogniser has committed to. */
  settled: string;
  /** Text the streaming recogniser is still revising. */
  partial: string;
  error?: string;
  /** Delivery headline shown in the done state. */
  notice?: string;
  settings: {
    dynamicSize: boolean;
    dimPartials: boolean;
    showStopButton: boolean;
  };
  viewport: { width: number; height: number };
}

export interface PillView {
  /** Bounds the window should take. Only changes when the pill needs room. */
  windowSize: Rect;
  /** Scale applied to the pill inside that window. [1,1] is fully open. */
  pillScale: { x: number; y: number };
  /** Text to render, already joined. Empty when there is nothing to show. */
  text: string;
  /** True while the text is only the streaming guess. */
  provisional: boolean;
  showText: boolean;
  showStop: boolean;
  showWave: boolean;
  /** The Mini-handle, i.e. the resting pill. */
  showHandle: boolean;
  scroll: boolean;
  notice: string;
  error: string;
}

const FONT_SIZE = 13;

export function pillView(input: PillInput): PillView {
  const { state, hover, playing, settled, partial, settings } = input;
  const text = [settled.trim(), partial.trim()].filter(Boolean).join(" ");
  const dictating = state === "listening" && !playing;
  const provisional = settled.trim().length === 0 && partial.trim().length > 0;
  const showStop = dictating && settings.showStopButton;
  const showText = dictating && text.length > 0;
  const showWave = dictating && !showText;
  const showHandle = state === "idle" && !hover;

  let windowSize: Rect;
  let scroll = false;
  if (showText && settings.dynamicSize) {
    const ceiling = Math.round(
      input.viewport.width * PILL_METRICS.maxWidthFraction,
    );
    const layout = liveSize(
      estimateText(text, FONT_SIZE, ceiling),
      input.viewport,
      showStop,
    );
    windowSize = layout;
    scroll = layout.scroll;
  } else if (showText) {
    // Fixed width: long text scrolls instead of resizing the window.
    windowSize = fixedSize("bars");
    scroll = true;
  } else if (playing) {
    windowSize = fixedSize("file");
  } else if (state === "working") {
    windowSize = fixedSize("working");
  } else if (state === "done") {
    windowSize = fixedSize("notice");
  } else if (state === "error") {
    windowSize = fixedSize("error");
  } else if (dictating) {
    windowSize = fixedSize("bars");
  } else {
    // idle and hover deliberately share one window size.
    windowSize = fixedSize(
      state === "idle" ? (hover ? "hover" : "idle") : "hover",
    );
  }

  const open = { x: 1, y: 1 };
  const resting = {
    x: PILL_METRICS.idleWidth / PILL_METRICS.openWidth,
    y: PILL_METRICS.idleHeight / PILL_METRICS.openHeight,
  };
  const pillScale = showHandle ? resting : open;

  return {
    windowSize,
    pillScale,
    text,
    provisional: provisional && settings.dimPartials,
    showText,
    showStop,
    showWave,
    showHandle,
    scroll,
    notice: state === "done" ? (input.notice ?? "") : "",
    error: state === "error" ? (input.error ?? "") : "",
  };
}

/** Opacity for the whole text block, so a setting can dim the guess. */
export function textOpacity(view: PillView): number {
  return view.provisional ? 0.55 : 0.95;
}

/** Opacity of the unconfirmed part, so it can stay fainter than settled text. */
export function partialOpacity(): number {
  return 0.62;
}

/** Opacity of the mini handle that marks the resting pill. */
export function handleOpacity(view: PillView): number {
  return view.showHandle ? 1 : 0;
}
