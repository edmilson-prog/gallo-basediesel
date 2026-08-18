/**
 * Identity observed on the previous render.
 *
 * `undefined` means "not observed yet" (first render) and is deliberately
 * distinct from `null`, which means "observed, and nobody was signed in".
 */
export type ObservedIdentity = string | null | undefined;

/**
 * Decides whether the TanStack Query cache must be dropped.
 *
 * The `QueryClient` is created once, outside React (`src/router.tsx`), so it
 * outlives every sign-in and sign-out in the tab — signing in is a client-side
 * navigation, not a reload. Whatever the previous user's screens fetched stays
 * in memory, and the next user is served those entries while their own refetch
 * is still in flight.
 *
 * Reset only when a *real* identity is left behind:
 *
 * - first observation → no, there is nothing behind us and the cache is empty
 * - identity unchanged → no. The hourly `TOKEN_REFRESHED` re-resolves the
 *   profile into a **new object** with the same id; keying on the object would
 *   wipe a healthy session's cache every hour. Callers must pass the id.
 * - signed out → signed in → no. An anonymous session caches nothing private
 *   (RLS returns no rows), so a full refetch buys nothing.
 * - signed in → signed out, or user A → user B → **yes**.
 */
export function shouldResetSessionCache(previous: ObservedIdentity, next: string | null): boolean {
  if (previous === undefined) return false;
  if (previous === next) return false;
  return previous !== null;
}
