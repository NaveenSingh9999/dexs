/**
 * Audio input acquisition.
 *
 * `getUserMedia({ audio: true })` is not enough on a real desktop: Windows
 * routinely reports several inputs (ghost Bluetooth endpoints, "Sound Mapper",
 * a headset that is paired but disconnected) and the default one can be dead.
 * So we ask for devices explicitly, verify each one actually carries signal,
 * and only then keep it.
 */

export interface AudioDeviceInfo {
  deviceId: string;
  kind: string;
  label: string;
}

export interface OpenResult {
  ok: boolean;
  /** Human-readable reason, safe to show in the pill. */
  reason?: string;
}

export type CaptureErrorKind =
  "denied" | "missing" | "busy" | "silent" | "unknown";

/** Map a DOMException from getUserMedia to something a user can act on. */
export function classifyCaptureError(err: unknown): CaptureErrorKind {
  const name = (err as { name?: string })?.name ?? "";
  if (name === "NotAllowedError" || name === "SecurityError") return "denied";
  if (name === "NotFoundError" || name === "OverconstrainedError") {
    return "missing";
  }
  if (name === "NotReadableError" || name === "AbortError") return "busy";
  return "unknown";
}

export function captureErrorText(kind: CaptureErrorKind): string {
  switch (kind) {
    case "denied":
      return "Microphone blocked — allow it in Privacy settings";
    case "missing":
      return "No audio input found";
    case "busy":
      return "Microphone busy — another app is using it";
    case "silent":
      return "No signal on the microphone";
    default:
      return "Mic unavailable";
  }
}

/** True when every sample sits at (or near) digital silence. */
export function isSilent(samples: Float32Array, threshold = 0.002): boolean {
  if (samples.length === 0) return true;
  for (let i = 0; i < samples.length; i++) {
    if (Math.abs(samples[i]) > threshold) return false;
  }
  return true;
}

/**
 * Order the candidate inputs best-first: real hardware first, default
 * fallbacks last, and the two PulseAudio-style "monitor" pseudo-devices
 * (which only ever capture system output) always last.
 */
export function rankDevices(devices: AudioDeviceInfo[]): string[] {
  const inputs = devices.filter((d) => d.kind === "audioinput");
  const score = (d: AudioDeviceInfo): number => {
    const label = d.label.toLowerCase();
    if (label.includes("monitor") || label.includes("loopback")) return 3;
    if (d.deviceId === "default" || d.deviceId === "") return 1;
    return 0;
  };
  return inputs.sort((a, b) => score(a) - score(b)).map((d) => d.deviceId);
}

/** Constraint sets tried in order; each is a full spec for getUserMedia. */
export function candidateConstraints(
  deviceIds: string[],
): MediaStreamConstraints[] {
  const out: MediaStreamConstraints[] = [];
  for (const id of deviceIds) {
    out.push({
      audio: {
        deviceId: { exact: id },
        channelCount: 1,
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      },
    });
  }
  out.push({ audio: true });
  out.push({ audio: { channelCount: 1, echoCancellation: false } });
  return out;
}

export const PROBE_MS = 400;

/**
 * Watch a live stream briefly and report whether it carries signal, so a
 * connected-but-dead input (the phone's dead mic, a ghost BT endpoint) is not
 * mistaken for a working one.
 */
export function probeSignal(
  stream: MediaStream,
  timeoutMs: number = PROBE_MS,
): Promise<boolean> {
  return new Promise((resolve) => {
    const ctx = new AudioContext();
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;
    const src = ctx.createMediaStreamSource(stream);
    src.connect(analyser);
    const buf = new Float32Array(analyser.fftSize);
    let peak = 0;
    const started = Date.now();
    const finish = (live: boolean): void => {
      src.disconnect();
      void ctx.close().catch(() => undefined);
      resolve(live);
    };
    const read = (): void => {
      analyser.getFloatTimeDomainData(buf);
      for (let i = 0; i < buf.length; i++) {
        peak = Math.max(peak, Math.abs(buf[i]));
      }
      if (Date.now() - started >= timeoutMs) finish(peak > 0.002);
      else setTimeout(read, 30);
    };
    read();
  });
}
