import { logApiCall, logApiError } from "./logger";
import { simulateError } from "./simulateError";
import { simulateLatency } from "./simulateLatency";

/**
 * Wrap a synchronous handler with the standard mock-API plumbing: latency
 * simulation, opportunistic error injection and one-line console trace.
 *
 * Every entry-point in `src/mocks/api/*` MUST go through this helper so the
 * behavior stays uniform and the Fase 2 SupabaseProvider can drop in without
 * surprises.
 */
export async function runApi<T>(
  api: string,
  operation: string,
  handler: () => T,
  options: { payload?: unknown } = {},
): Promise<T> {
  let ms = 0;
  try {
    ms = await simulateLatency();
    simulateError();
    const result = handler();
    logApiCall(api, operation, ms, options.payload);
    return result;
  } catch (err) {
    logApiError(api, operation, ms, err);
    throw err;
  }
}
