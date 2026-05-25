import { ERROR_RATE } from "../../config";
import { MockNetworkError } from "./errors";

/**
 * With probability `rate` (default `ERROR_RATE` from config), throws a
 * {@link MockNetworkError}. No-op otherwise.
 *
 * Generators / API code call this near the top of every operation so error
 * paths get exercised proportionally to the configured rate.
 */
export function simulateError(rate = ERROR_RATE): void {
  if (rate <= 0) return;
  if (Math.random() < rate) {
    throw new MockNetworkError();
  }
}
