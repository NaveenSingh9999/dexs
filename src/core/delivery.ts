/**
 * Where dictated text should go when a take ends.
 *
 * Auto-typing straight into whatever has focus is how dictation tools clobber
 * the wrong window, so the target is verified first: an OS accessibility query
 * tells us whether the focused element is an editable text control. Only then
 * do we paste; otherwise the text goes to the clipboard and the user is told.
 */

export type DeliveryTarget =
  | { kind: "paste"; reason: "verified-text-field" }
  | { kind: "clipboard"; reason: DeliveryReason }
  /** Nothing was delivered: no editable field and the fallback is off. */
  | { kind: "none"; reason: DeliveryReason };

export type DeliveryReason =
  | "no-focused-element"
  | "focused-not-editable"
  | "no-accessibility-bridge"
  | "query-failed"
  | "empty-text";

export interface AccessibilityAnswer {
  /** The focused element is a control that accepts text. */
  editable: boolean;
  /** Present when we could not even ask the OS. */
  error?: DeliveryReason;
}

/** The delivery headline the pill shows the user. */
export interface DeliverySummary {
  where: "window" | "clipboard" | "none";
  message: string;
}

export interface DeliveryResult {
  where: "window" | "clipboard" | "none";
  reason: DeliveryReason | "verified-text-field";
  /** Copy of what the user sees in the pill. */
  message: string;
}

export interface DeliveryOptions {
  /** Copy to the clipboard when the target cannot be verified. */
  clipboardFallback?: boolean;
  /** Type into the focused field without checking it first. */
  pasteUnverified?: boolean;
}

/** Decide what to do, given what the OS said and what we have to deliver. */
export function decideDelivery(
  text: string,
  answer: AccessibilityAnswer | null,
  options: DeliveryOptions = {},
): DeliveryTarget {
  if (text.trim().length === 0)
    return { kind: "clipboard", reason: "empty-text" };

  const failure: DeliveryReason | null = !answer
    ? "no-accessibility-bridge"
    : answer.error
      ? answer.error
      : answer.editable
        ? null
        : "focused-not-editable";

  if (failure === null || options.pasteUnverified) {
    return { kind: "paste", reason: "verified-text-field" };
  }
  return options.clipboardFallback === false
    ? { kind: "none", reason: failure }
    : { kind: "clipboard", reason: failure };
}

export function deliveryMessage(
  result: Omit<DeliveryResult, "message">,
): string {
  if (result.where === "window") return "Pasted into the active field";
  if (result.where === "none") return "No input field found — nothing pasted";
  switch (result.reason) {
    case "no-focused-element":
      return "No input field found — copied to clipboard";
    case "focused-not-editable":
      return "No input field found — copied to clipboard";
    case "no-accessibility-bridge":
      return "Cannot inspect this app — copied to clipboard";
    case "query-failed":
      return "Could not check the active field — copied to clipboard";
    case "empty-text":
      return "Nothing to paste";
    default:
      return "Copied to clipboard";
  }
}

/** Collapse a multi-utterance transcript into what will be pasted. */
export function joinUtterances(parts: string[]): string {
  return parts
    .map((p) => p.trim())
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}
