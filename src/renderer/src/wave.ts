/** Amplitude floor that keeps a gentle idle ripple while listening. */
export const WAVE_REST_AMP = 0.3;

const MIN_BAR = 4;

/** The travelling wave repeats every 2π/3.2 seconds; folding time into one
 *  period keeps the sin argument small no matter how long the loop runs. */
const PERIOD = (Math.PI * 2) / 3.2;

/**
 * Pixel height of one waveform bar. `amp` is the smoothed 0..1 mic level,
 * `index` the bar position, `time` seconds since the loop started — the wave
 * travels through the bars as time advances.
 */
export function barHeight(amp: number, index: number, time: number): number {
  const clamped = Number.isFinite(amp) ? Math.max(0, amp) : 0;
  const t = Number.isFinite(time) ? time : 0;
  const folded = (((t % PERIOD) + PERIOD) % PERIOD) * 3.2;
  const travel = Math.abs(Math.sin(index * 1.1 - folded));
  return Math.max(MIN_BAR, clamped * (14 + 10 * travel));
}
