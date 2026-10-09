import { describe, expect, it } from "vitest";
import {
  candidateConstraints,
  captureErrorText,
  classifyCaptureError,
  isSilent,
  rankDevices,
} from "./audioInput";

function dev(
  deviceId: string,
  kind: string,
  label: string,
): { deviceId: string; kind: string; label: string } {
  return { deviceId, kind, label };
}

describe("classifyCaptureError", () => {
  it("maps the DOM exception names to actionable kinds", () => {
    expect(classifyCaptureError({ name: "NotAllowedError" })).toBe("denied");
    expect(classifyCaptureError({ name: "SecurityError" })).toBe("denied");
    expect(classifyCaptureError({ name: "NotFoundError" })).toBe("missing");
    expect(classifyCaptureError({ name: "OverconstrainedError" })).toBe(
      "missing",
    );
    expect(classifyCaptureError({ name: "NotReadableError" })).toBe("busy");
    expect(classifyCaptureError({ name: "AbortError" })).toBe("busy");
  });

  it("falls back to unknown for anything else", () => {
    expect(classifyCaptureError(new Error("boom"))).toBe("unknown");
    expect(classifyCaptureError(undefined)).toBe("unknown");
    expect(classifyCaptureError(null)).toBe("unknown");
  });
});

describe("captureErrorText", () => {
  it("gives distinct, actionable copy per kind", () => {
    const texts = [
      captureErrorText("denied"),
      captureErrorText("missing"),
      captureErrorText("busy"),
      captureErrorText("silent"),
      captureErrorText("unknown"),
    ];
    expect(new Set(texts).size).toBe(texts.length);
    expect(texts.every((t) => t.length > 0)).toBe(true);
  });

  it("mentions Privacy settings when blocked", () => {
    expect(captureErrorText("denied")).toMatch(/privacy/i);
  });
});

describe("isSilent", () => {
  it("treats an all-zero buffer as silent", () => {
    expect(isSilent(new Float32Array(512))).toBe(true);
  });

  it("treats an empty buffer as silent", () => {
    expect(isSilent(new Float32Array(0))).toBe(true);
  });

  it("passes anything above the threshold", () => {
    const buf = new Float32Array(512);
    buf[300] = 0.5;
    expect(isSilent(buf)).toBe(false);
  });

  it("ignores samples below the noise floor", () => {
    const buf = new Float32Array(512);
    buf[0] = 0.0005;
    expect(isSilent(buf)).toBe(true);
  });
});

describe("rankDevices", () => {
  it("keeps only audio inputs", () => {
    const ids = rankDevices([
      dev("cam1", "videoinput", "Webcam"),
      dev("mic1", "audioinput", "Headset"),
    ]);
    expect(ids).toEqual(["mic1"]);
  });

  it("pushes monitor/loopback pseudo-devices to the end", () => {
    const ids = rankDevices([
      dev("mon", "audioinput", "Monitor of Built-in Audio"),
      dev("hp", "audioinput", "USB Headset"),
    ]);
    expect(ids[0]).toBe("hp");
    expect(ids[ids.length - 1]).toBe("mon");
  });

  it("deprioritises the generic default entries", () => {
    const ids = rankDevices([
      dev("default", "audioinput", "Default"),
      dev("real", "audioinput", "Microphone Array"),
    ]);
    expect(ids[0]).toBe("real");
  });

  it("returns an empty list when there are no inputs", () => {
    expect(rankDevices([dev("x", "videoinput", "cam")])).toEqual([]);
  });
});

describe("candidateConstraints", () => {
  it("tries each ranked device before the generic specs", () => {
    const list = candidateConstraints(["a", "b"]);
    expect(list).toHaveLength(4);
    const first = list[0].audio as MediaTrackConstraints;
    expect(first.deviceId).toEqual({ exact: "a" });
    const second = list[1].audio as MediaTrackConstraints;
    expect(second.deviceId).toEqual({ exact: "b" });
    expect(list[2]).toEqual({ audio: true });
  });

  it("requests mono without the voice-processing chain", () => {
    const first = candidateConstraints(["a"])[0].audio as MediaTrackConstraints;
    expect(first.channelCount).toBe(1);
    expect(first.echoCancellation).toBe(false);
    expect(first.noiseSuppression).toBe(false);
    expect(first.autoGainControl).toBe(false);
  });

  it("always ends with plain and mono fallbacks", () => {
    const list = candidateConstraints([]);
    expect(list).toEqual([
      { audio: true },
      { audio: { channelCount: 1, echoCancellation: false } },
    ]);
  });
});
