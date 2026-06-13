/**
 * Audio playback-speed helpers for the conversation audio bubble.
 *
 * Pure (no DOM, no storage) so the cycling/formatting logic stays unit-testable;
 * the `<audio>` element and `localStorage` wiring live in the component.
 */

/** Selectable playback speeds, in cycle order. */
export const PLAYBACK_RATES = [1, 1.5, 2] as const;

export type PlaybackRate = (typeof PLAYBACK_RATES)[number];

/** localStorage key for the user's preferred playback speed (shared across audios). */
export const PLAYBACK_RATE_STORAGE_KEY = "gallo-audio-playback-rate";

/** Next speed in the cycle (1 → 1.5 → 2 → 1). Unknown input restarts the cycle. */
export function nextPlaybackRate(current: number): PlaybackRate {
  const index = PLAYBACK_RATES.indexOf(current as PlaybackRate);
  if (index === -1) return PLAYBACK_RATES[0];
  // Modulo of a non-empty tuple is always in-bounds; the fallback satisfies
  // noUncheckedIndexedAccess without an assertion.
  return PLAYBACK_RATES[(index + 1) % PLAYBACK_RATES.length] ?? PLAYBACK_RATES[0];
}

/** pt-BR label — comma decimal and the multiplication sign (e.g. "1,5×"). */
export function formatPlaybackRate(rate: number): string {
  return `${String(rate).replace(".", ",")}×`;
}

/**
 * Coerce an arbitrary value (e.g. a `localStorage` string) into a known rate,
 * defaulting to `1` for anything invalid or missing.
 */
export function sanitizePlaybackRate(value: unknown): PlaybackRate {
  const parsed = typeof value === "number" ? value : Number(value);
  return PLAYBACK_RATES.includes(parsed as PlaybackRate) ? (parsed as PlaybackRate) : 1;
}
