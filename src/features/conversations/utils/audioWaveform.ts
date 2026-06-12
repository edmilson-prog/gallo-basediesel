/**
 * Deterministic pseudo-waveform bar heights (each 20–100) derived from a seed
 * string, so a given audio always renders the same bars across reloads. Mirrors
 * the generator used by the conversation audio bubble.
 */
export function generateWaveBars(seed: string, count: number): number[] {
  let h = 0;
  for (let i = 0; i < seed.length; i += 1) h = (h * 31 + seed.charCodeAt(i)) | 0;
  const bars: number[] = [];
  for (let i = 0; i < count; i += 1) {
    h = (h * 1103515245 + 12345) | 0;
    bars.push((Math.abs(h) % 80) + 20); // 20–100
  }
  return bars;
}
