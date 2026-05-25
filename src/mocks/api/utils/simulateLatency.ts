import { LATENCY_MAX_MS, LATENCY_MIN_MS } from "../../config";

/**
 * Resolve after a random delay inside the configured window, mimicking a real
 * network call. Each API entry-point awaits this before producing a result so
 * the rest of the app naturally exercises loading states.
 */
export function simulateLatency(min = LATENCY_MIN_MS, max = LATENCY_MAX_MS): Promise<number> {
  const lo = Math.max(0, Math.min(min, max));
  const hi = Math.max(lo, max);
  const ms = Math.floor(Math.random() * (hi - lo + 1)) + lo;
  return new Promise((resolve) => setTimeout(() => resolve(ms), ms));
}
