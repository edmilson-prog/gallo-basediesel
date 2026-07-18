/**
 * Keeps best-effort work alive past the response. Supabase Edge exposes
 * `EdgeRuntime.waitUntil`; locally (no runtime) the promise just runs
 * detached. Either way the caller has already answered — this never blocks it.
 */
export function runInBackground(promise: Promise<unknown>): void {
  const runtime = (globalThis as { EdgeRuntime?: { waitUntil?: (p: Promise<unknown>) => void } })
    .EdgeRuntime;
  if (runtime?.waitUntil) runtime.waitUntil(promise);
  else void promise;
}
