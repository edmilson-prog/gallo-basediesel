/**
 * Decides whether a Supabase auth error means the session is dead on the server
 * (the user must be sent back to login) vs a transient hiccup (keep the user in).
 *
 * Why this matters: a false positive logs out a working user (or loops the
 * login redirect) on a flaky network; a false negative leaves the user stuck in
 * the "ghost session" limbo (token locally valid, but `auth.sessions` revoked —
 * every Edge Function 401s with "invalid session"). So the rule is deliberately
 * CONSERVATIVE: only treat unambiguous auth rejections as a dead session.
 */
export interface IAuthErrorLike {
  name?: string;
  status?: number;
  code?: string;
}

/** Supabase auth error codes that mean the session no longer exists server-side. */
const DEAD_SESSION_CODES = new Set([
  "session_not_found",
  "session_expired",
  "refresh_token_not_found",
  "refresh_token_already_used",
]);

export function isInvalidSessionError(error: IAuthErrorLike | null | undefined): boolean {
  if (!error) return false;
  // A transient/network failure is NEVER a reason to log out — the retryable
  // name is authoritative even if it carries a misleading status.
  if (error.name === "AuthRetryableFetchError") return false;
  if (error.code && DEAD_SESSION_CODES.has(error.code)) return true;
  if (error.status === 401 || error.status === 403) return true;
  return false;
}
