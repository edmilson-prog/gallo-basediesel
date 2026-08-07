/** Outcome of a `profiles` read, minus the success case. */
export type MissingProfileStatus = "absent" | "error";

/**
 * Decides whether a profile read that produced no profile may drop the local
 * session (clear `currentUser` and the localStorage auth mirror).
 *
 * Two ways to end up without a profile, and they are NOT equivalent:
 *
 * - `error` — network / 5xx / RLS statement_timeout. Inconclusive: it says
 *   nothing about whether the row exists. Never acts on it.
 * - `absent` — the query returned no row and no error. Reads as "this account
 *   has no profile", but `profiles` is RLS-gated on
 *   `auth_user_id = auth.uid()`, so a request that leaves *without the user's
 *   JWT applied* is filtered to zero rows and reports exactly the same shape.
 *   Empty is therefore only evidence of "no row" when we had nothing to lose.
 *
 * Hence the second argument. While no user is established (boot, sign-in), an
 * empty read is taken at face value: an authenticated user with genuinely no
 * `profiles` row cannot use the app and must be sent to login. Once a user IS
 * established, an empty read is treated as inconclusive — a profile does not
 * vanish mid-session, and only an explicit sign-out ends one.
 *
 * Dropping it mid-session is what made a signed-in user bounce back to
 * /auth/login on their next click: sign-in wrote the mirror, the
 * `onAuthStateChange` listener re-read `profiles`, the empty result cleared the
 * mirror, and `requireAuth` then saw nobody — while the server session was
 * still valid (no `/logout` call, `/user` still answering 200).
 */
export function shouldDiscardSession(
  status: MissingProfileStatus,
  hasEstablishedUser: boolean,
): boolean {
  if (status === "error") return false;
  return !hasEstablishedUser;
}
