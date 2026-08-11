/**
 * Retry policy for TanStack Query.
 *
 * TanStack's default is `retry: 3` — four attempts per query. During the
 * 2026-08-11 Inbox incident that turned every timed-out request into four,
 * each holding a database connection for the full 8s `statement_timeout`,
 * which is how a slow query became `remaining connection slots are reserved`.
 * Retrying an overloaded server is the one case where a retry makes the
 * outage worse rather than papering over a blip.
 *
 * Detection is by MESSAGE, deliberately: the supabase providers re-throw as
 * `new Error("[supabase] x.y failed: " + error.message)`, dropping the
 * PostgrestError `code`. Preserving codes across every provider is a wider
 * change than this policy warrants, so the cap below is the second line of
 * defence — even when the match misses, a miss now costs one retry instead of
 * three. `code` is still checked first for the callers that do keep it.
 */

/** Postgres SQLSTATE for a statement cancelled by `statement_timeout`. */
const STATEMENT_TIMEOUT_SQLSTATE = "57014";

/**
 * Signatures of a database that is out of capacity, not of a transient blip.
 * Taken verbatim from the Postgres log lines of the incident.
 */
const OVERLOAD_SIGNATURES = [
  "canceling statement due to statement timeout",
  "remaining connection slots are reserved",
  STATEMENT_TIMEOUT_SQLSTATE,
];

/** Max retries for everything else — below TanStack's default of 3 on purpose. */
export const QUERY_MAX_RETRIES = 1;

/** True when the failure means "the server is saturated", so a retry piles on. */
export function isServerOverloadError(error: unknown): boolean {
  if (error === null || error === undefined) return false;

  const code = (error as { code?: unknown }).code;
  if (typeof code === "string" && code === STATEMENT_TIMEOUT_SQLSTATE) return true;

  // Only real Error objects carry the provider's re-thrown message; a bare
  // string is not something we can classify with confidence.
  if (!(error instanceof Error)) return false;
  const message = error.message.toLowerCase();
  return OVERLOAD_SIGNATURES.some((signature) => message.includes(signature));
}

/**
 * `retry` for the app-wide QueryClient: give an ordinary failure one more go,
 * and give a saturated server none.
 */
export function shouldRetryQuery(failureCount: number, error: unknown): boolean {
  if (isServerOverloadError(error)) return false;
  return failureCount < QUERY_MAX_RETRIES;
}
