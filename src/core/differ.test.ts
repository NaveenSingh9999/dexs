import { describe, it, expect } from "vitest";
import { planCorrection } from "./differ";

describe("planCorrection", () => {
  it("returns null when equal", () => {
    expect(planCorrection("hello", "hello")).toBeNull();
  });

  it("inserts at the end", () => {
    expect(planCorrection("hello", "hello world")).toEqual({
      backspaces: 0,
      insert: " world",
    });
  });

  it("fixes a typo in the middle", () => {
    expect(planCorrection("hello wrld", "hello world")).toEqual({
      backspaces: 3,
      insert: "orld",
    });
  });

  it("replaces everything when no common prefix", () => {
    expect(planCorrection("abc", "xyz")).toEqual({
      backspaces: 3,
      insert: "xyz",
    });
  });

  it("handles prefix being a boundary", () => {
    expect(planCorrection("", "hi")).toEqual({ backspaces: 0, insert: "hi" });
  });
});
