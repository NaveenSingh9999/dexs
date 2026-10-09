export const SAMPLE_RATE = 16000;

/** Milliseconds of audio pushed per tick while playing a dropped file. */
export const BLOCK_MS = 100;

export interface AudioBlock {
  pcm: Int16Array;
  /** 0..1 loudness of this block, for the waveform. */
  level: number;
}

/** Accepts what the browser itself can decode: wav, mp3, m4a/aac, ogg, flac, webm. */
export function isAudioFile(name: string, mime: string): boolean {
  if (mime.startsWith("audio/")) return true;
  if (mime === "video/webm" || mime === "video/mp4") return true;
  return /\.(wav|mp3|m4a|aac|ogg|oga|opus|flac|webm)$/i.test(name);
}

/** Loudness of one block, mapped so normal speech sits near the middle. */
export function blockLevel(pcm: Int16Array): number {
  if (pcm.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < pcm.length; i++) sum += pcm[i] * pcm[i];
  return Math.min(1, (Math.sqrt(sum / pcm.length) / 32768) * 4);
}

/** Downmixes to mono and resamples to 16 kHz with linear interpolation. */
export function toMono16k(
  channels: Float32Array[],
  sampleRate: number,
): Int16Array {
  const frames = channels[0]?.length ?? 0;
  if (frames === 0) return new Int16Array(0);

  const mono = new Float32Array(frames);
  for (let c = 0; c < channels.length; c++) {
    const ch = channels[c];
    for (let i = 0; i < frames; i++) mono[i] += ch[i] / channels.length;
  }

  const ratio = sampleRate / SAMPLE_RATE;
  const outLen = Math.max(1, Math.floor(frames / ratio));
  const out = new Int16Array(outLen);
  for (let i = 0; i < outLen; i++) {
    const pos = i * ratio;
    const lo = Math.floor(pos);
    const hi = Math.min(frames - 1, lo + 1);
    const frac = pos - lo;
    const v = mono[lo] * (1 - frac) + mono[hi] * frac;
    out[i] = Math.max(-32768, Math.min(32767, Math.round(v * 32767)));
  }
  return out;
}

/** Cuts the stream into fixed-size blocks, reporting loudness with each. */
export function* blocks(pcm: Int16Array, size: number): Generator<AudioBlock> {
  for (let i = 0; i < pcm.length; i += size) {
    const slice = pcm.subarray(i, Math.min(pcm.length, i + size));
    yield { pcm: slice, level: blockLevel(slice) };
  }
}

/** "m:ss", or "h:mm:ss" past an hour. */
export function formatTime(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number): string => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
}
