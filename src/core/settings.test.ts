import { describe, expect, it } from "vitest";
import {
  HISTORY_LIMIT,
  RATES,
  defaultSettings,
  migrateSettings,
  nextRate,
  pushHistory,
  type HistoryEntry,
} from "./settings";

describe("defaultSettings", () => {
  it("is a complete, usable starting point", () => {
    expect(defaultSettings.slot).toEqual({ h: "h-center", v: "v-bottom" });
    expect(defaultSettings.playbackRate).toBe(1);
    expect(defaultSettings.pasteOnFinish).toBe(true);
    expect(defaultSettings.dynamicSize).toBe(true);
  });
});

describe("migrateSettings", () => {
  it("returns defaults for junk input", () => {
    expect(migrateSettings(null)).toEqual(defaultSettings);
    expect(migrateSettings(42)).toEqual(defaultSettings);
    expect(migrateSettings("nope")).toEqual(defaultSettings);
    expect(migrateSettings([])).toEqual(defaultSettings);
  });

  it("keeps known values from an older file", () => {
    const s = migrateSettings({ hotkey: "Alt+D", language: "de" });
    expect(s.hotkey).toBe("Alt+D");
    expect(s.language).toBe("de");
  });

  it("ignores values with the wrong type", () => {
    const s = migrateSettings({ hotkey: 7, reviewEnabled: "yes" });
    expect(s.hotkey).toBe(defaultSettings.hotkey);
    expect(s.reviewEnabled).toBe(defaultSettings.reviewEnabled);
  });

  it("fills in keys a previous version never had", () => {
    const s = migrateSettings({ hotkey: "Alt+D" });
    expect(s.showStopButton).toBe(true);
    expect(s.pasteOnFinish).toBe(true);
    expect(s.slot).toEqual(defaultSettings.slot);
  });

  it("clamps numeric ranges", () => {
    expect(migrateSettings({ edgeMargin: -40 }).edgeMargin).toBe(0);
    expect(migrateSettings({ edgeMargin: 9999 }).edgeMargin).toBe(64);
    expect(migrateSettings({ playbackRate: 0 }).playbackRate).toBe(0.25);
    expect(migrateSettings({ playbackRate: 99 }).playbackRate).toBe(4);
  });

  it("rejects non-finite numbers", () => {
    expect(migrateSettings({ edgeMargin: Number.NaN }).edgeMargin).toBe(0);
  });

  it("keeps only valid slots", () => {
    expect(
      migrateSettings({ slot: { h: "h-right", v: "v-top" } }).slot,
    ).toEqual({ h: "h-right", v: "v-top" });
    expect(migrateSettings({ slot: { h: "nope", v: "nope" } }).slot).toEqual(
      defaultSettings.slot,
    );
    expect(migrateSettings({ slot: "corner" }).slot).toEqual(
      defaultSettings.slot,
    );
  });
});

describe("nextRate", () => {
  it("cycles through every rate and wraps", () => {
    let r = RATES[0];
    const seen: number[] = [r];
    for (let i = 0; i < RATES.length; i++) {
      r = nextRate(r);
      seen.push(r);
    }
    expect(seen.slice(0, RATES.length)).toEqual([...RATES]);
    expect(nextRate(RATES[RATES.length - 1])).toBe(RATES[0]);
  });

  it("recovers from a rate that is not in the list", () => {
    expect(RATES).toContain(nextRate(3));
  });
});

describe("pushHistory", () => {
  const entry = (id: string, text: string): HistoryEntry => ({
    id,
    at: 0,
    text,
    source: "mic",
    delivered: "window",
  });

  it("puts the newest entry first", () => {
    const h = pushHistory(
      pushHistory([], entry("a", "one")),
      entry("b", "two"),
    );
    expect(h.map((e) => e.id)).toEqual(["b", "a"]);
  });

  it("ignores blank entries", () => {
    expect(pushHistory([], entry("a", "   "))).toEqual([]);
  });

  it("caps the history length", () => {
    let h: HistoryEntry[] = [];
    for (let i = 0; i < HISTORY_LIMIT + 25; i++) {
      h = pushHistory(h, entry(String(i), `text ${i}`));
    }
    expect(h).toHaveLength(HISTORY_LIMIT);
    expect(h[0].id).toBe(String(HISTORY_LIMIT + 24));
  });
});
