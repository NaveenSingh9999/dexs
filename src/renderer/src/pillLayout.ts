/**
 * Pill geometry.
 *
 * The pill hugs its content instead of snapping between fixed sizes, but it
 * must never take over the screen: every dimension is clamped against the
 * viewport, and past the ceiling the text scrolls behind a fade mask.
 */

export interface Rect {
  width: number;
  height: number;
}

export interface TextMetrics {
  /** Width of the widest line in px. */
  lineWidth: number;
  /** Number of wrapped lines. */
  lines: number;
}

export interface PillLayout {
  width: number;
  height: number;
  /** True when the text no longer fits and must scroll. */
  scroll: boolean;
}

export const PILL_METRICS = {
  paddingX: 34,
  paddingY: 26,
  lineHeight: 19,
  minWidth: 208,
  minHeight: 48,
  maxWidthFraction: 0.42,
  maxHeightFraction: 0.3,
  /**
   * The window the pill lives in never changes size while you open and close
   * it: resizing a borderless window in X11/Win32 forces a resize, a re-anchor
   * and a repaint per frame, which is what made the open feel choppy and made
   * the pill sink as it grew. Instead the window always holds the open pill and
   * the idle pill is that same box, scaled down, so opening is a compositor
   * zoom that never touches the window.
   */
  openWidth: 66,
  openHeight: 44,
  /** The shape the pill shrinks to when it is resting. */
  idleWidth: 64,
  idleHeight: 22,
  /** Button metrics: the open box is sized to hold exactly this much. */
  control: 22,
  controlGap: 6,
  controlPadding: 6,
  compactWidth: 96,
  compactHeight: 44,
  noticeWidth: 260,
  barsWidth: 104,
  fileWidth: 236,
} as const;

/** The scale that turns the open pill into the resting pill. */
export function idleScale(): { x: number; y: number } {
  return {
    x: PILL_METRICS.idleWidth / PILL_METRICS.openWidth,
    y: PILL_METRICS.idleHeight / PILL_METRICS.openHeight,
  };
}

export const clamp = (v: number, lo: number, hi: number): number =>
  Math.min(Math.max(v, lo), hi);

/**
 * Window size for every state that is not showing live text. idle and hover
 * share one size on purpose: that is what lets them cross-fade without the
 * window ever moving.
 */
export function fixedSize(
  state: "idle" | "hover" | "bars" | "working" | "notice" | "error" | "file",
): Rect {
  const m = PILL_METRICS;
  switch (state) {
    case "idle":
    case "hover":
      return { width: m.openWidth, height: m.openHeight };
    case "bars":
      return { width: m.barsWidth, height: m.compactHeight };
    case "working":
      return { width: m.compactWidth, height: m.compactHeight };
    case "file":
      return { width: m.fileWidth, height: m.compactHeight };
    case "notice":
      return { width: m.noticeWidth, height: m.compactHeight };
    default:
      return { width: m.noticeWidth, height: m.compactHeight };
  }
}

/**
 * Size for the live-transcribing state: grows with the text, clamped to the
 * viewport, and reports whether the content is taller than the box.
 */
export function liveSize(
  text: TextMetrics,
  viewport: { width: number; height: number },
  hasStopButton = true,
): PillLayout {
  const m = PILL_METRICS;
  const chrome = (hasStopButton ? 34 : 0) + (hasStopButton ? 18 : 0);
  const maxWidth = Math.round(viewport.width * m.maxWidthFraction);
  const maxHeight = Math.round(viewport.height * m.maxHeightFraction);

  // On a small screen the minimum has to yield to the ceiling, or the pill
  // would claim more room than the display allows.
  const minWidth = Math.min(m.minWidth, maxWidth);
  const minHeight = Math.min(m.minHeight, maxHeight);

  const wanted = Math.ceil(text.lineWidth) + m.paddingX + chrome;
  const width = clamp(wanted, minWidth, Math.max(minWidth, maxWidth));

  const available = width - m.paddingX - chrome;
  const lines = Math.max(1, text.lines);
  const contentWidthFits = text.lineWidth <= available;
  const wantedHeight = lines * m.lineHeight + m.paddingY;
  const height = clamp(wantedHeight, minHeight, Math.max(minHeight, maxHeight));

  return {
    width,
    height,
    scroll: !contentWidthFits || lines * m.lineHeight + m.paddingY > height,
  };
}

/** Rough advance-width estimate used before the real measurement lands. */
export function estimateText(
  text: string,
  fontSize: number,
  maxWidth: number,
): TextMetrics {
  const charsPerLine = Math.max(8, Math.floor(maxWidth / (fontSize * 0.54)));
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return { lineWidth: 0, lines: 1 };

  const lineWidth = (s: string): number => s.length * fontSize * 0.54;
  let lines = 1;
  let current = "";
  let widest = 0;
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length > charsPerLine && current) {
      widest = Math.max(widest, lineWidth(current));
      lines += 1;
      current = word;
    } else {
      current = candidate;
    }
  }
  widest = Math.max(widest, lineWidth(current));
  return { lineWidth: Math.min(widest, maxWidth * 2), lines };
}

/** Which of the nine anchor slots a point belongs to. */
export type SlotH = "h-left" | "h-center" | "h-right";
export type SlotV = "v-top" | "v-middle" | "v-bottom";

export function slotFor(
  x: number,
  y: number,
  viewport: { width: number; height: number },
): { h: SlotH; v: SlotV } {
  const third = viewport.width / 3;
  const h: SlotH =
    x < third ? "h-left" : x > third * 2 ? "h-right" : "h-center";
  const thirdY = viewport.height / 3;
  const v: SlotV =
    y < thirdY ? "v-top" : y > thirdY * 2 ? "v-bottom" : "v-middle";
  return { h, v };
}
