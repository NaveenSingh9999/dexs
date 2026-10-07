export interface VadOptions {
  sampleRate?: number;
  frameMs?: number;
  thresholdRms?: number;
  hangoverMs?: number;
  minSpeechMs?: number;
}

export interface Segment {
  startSample: number;
  endSample: number;
}

export function vadSegment(pcm: Int16Array, opts: VadOptions = {}): Segment[] {
  const sampleRate = opts.sampleRate ?? 16000;
  const frame = Math.floor((sampleRate * (opts.frameMs ?? 30)) / 1000);
  const threshold = opts.thresholdRms ?? 500;
  const hangover = Math.floor((opts.hangoverMs ?? 400) / (opts.frameMs ?? 30));
  const minSpeech = Math.ceil((opts.minSpeechMs ?? 250) / (opts.frameMs ?? 30));

  const segments: Segment[] = [];
  let inSpeech = false;
  let start = 0;
  let silenceRun = 0;
  let speechFrames = 0;

  for (let i = 0; i + frame <= pcm.length; i += frame) {
    let sum = 0;
    for (let j = 0; j < frame; j++) sum += pcm[i + j] * pcm[i + j];
    const rms = Math.sqrt(sum / frame);
    if (rms >= threshold) {
      if (!inSpeech) {
        inSpeech = true;
        start = i;
        speechFrames = 0;
      }
      speechFrames++;
      silenceRun = 0;
    } else if (inSpeech) {
      silenceRun++;
      if (silenceRun > hangover) {
        if (speechFrames >= minSpeech)
          segments.push({ startSample: start, endSample: i });
        inSpeech = false;
      }
    }
  }
  if (inSpeech && speechFrames >= minSpeech)
    segments.push({ startSample: start, endSample: pcm.length });
  return segments;
}
