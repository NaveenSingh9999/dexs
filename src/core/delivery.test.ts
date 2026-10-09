import { describe, expect, it } from "vitest";
import {
  decideDelivery,
  deliveryMessage,
  joinUtterances,
  type DeliveryReason,
} from "./delivery";

function msg(reason: DeliveryReason): string {
  return deliveryMessage({ where: "clipboard", reason });
}

describe("decideDelivery", () => {
  it("pastes when the focused element is an editable text field", () => {
    expect(decideDelivery("hello", { editable: true })).toEqual({
      kind: "paste",
      reason: "verified-text-field",
    });
  });

  it("falls back to the clipboard when nothing is focused", () => {
    expect(decideDelivery("hello", { editable: false })).toEqual({
      kind: "clipboard",
      reason: "focused-not-editable",
    });
  });

  it("falls back when the OS could not be asked at all", () => {
    expect(decideDelivery("hello", null)).toEqual({
      kind: "clipboard",
      reason: "no-accessibility-bridge",
    });
  });

  it("propagates a query failure", () => {
    expect(
      decideDelivery("hello", { editable: false, error: "query-failed" }),
    ).toEqual({
      kind: "clipboard",
      reason: "query-failed",
    });
  });

  it("never pastes empty text", () => {
    expect(decideDelivery("   ", { editable: true })).toEqual({
      kind: "clipboard",
      reason: "empty-text",
    });
  });
});

describe("deliveryMessage", () => {
  it("confirms a paste", () => {
    expect(
      deliveryMessage({ where: "window", reason: "verified-text-field" }),
    ).toMatch(/pasted/i);
  });

  it("tells the user about the missing field", () => {
    expect(msg("no-focused-element")).toBe(
      "No input field found — copied to clipboard",
    );
    expect(msg("focused-not-editable")).toMatch(/no input field found/i);
  });

  it("explains a missing accessibility bridge", () => {
    expect(msg("no-accessibility-bridge")).toMatch(/cannot inspect/i);
  });

  it("has distinct copy for every clipboard reason", () => {
    const all = [
      msg("no-focused-element"),
      msg("no-accessibility-bridge"),
      msg("query-failed"),
      msg("empty-text"),
    ];
    expect(new Set(all).size).toBe(all.length);
  });
});

describe("joinUtterances", () => {
  it("joins trimmed parts with single spaces", () => {
    expect(joinUtterances([" one ", "two", "", "three  "])).toBe(
      "one two three",
    );
  });

  it("returns an empty string for nothing", () => {
    expect(joinUtterances([])).toBe("");
    expect(joinUtterances(["  "])).toBe("");
  });

  it("keeps punctuation from the review pass", () => {
    expect(joinUtterances(["Hello, world.", " Next."])).toBe(
      "Hello, world. Next.",
    );
  });

  describe("delivery options", () => {
    it("returns none when the fallback is off and the field is not editable", () => {
      const d = decideDelivery(
        "hello",
        { editable: false },
        {
          clipboardFallback: false,
        },
      );
      expect(d).toEqual({ kind: "none", reason: "focused-not-editable" });
    });

    it("returns none when there is no bridge and the fallback is off", () => {
      const d = decideDelivery("hello", null, { clipboardFallback: false });
      expect(d).toEqual({ kind: "none", reason: "no-accessibility-bridge" });
    });

    it("still pastes a verified field when the fallback is off", () => {
      const d = decideDelivery(
        "hello",
        { editable: true },
        {
          clipboardFallback: false,
        },
      );
      expect(d.kind).toBe("paste");
    });

    it("pastes unverified when the user asks for it", () => {
      const d = decideDelivery("hello", null, { pasteUnverified: true });
      expect(d.kind).toBe("paste");
    });

    it("names the failure that stopped it", () => {
      const d = decideDelivery(
        "hello",
        { editable: false, error: "query-failed" },
        { clipboardFallback: false },
      );
      expect(d).toEqual({ kind: "none", reason: "query-failed" });
    });
  });

  describe("deliveryMessage for a missed delivery", () => {
    it("says nothing was pasted", () => {
      expect(
        deliveryMessage({ where: "none", reason: "focused-not-editable" }),
      ).toBe("No input field found — nothing pasted");
    });
  });
});
