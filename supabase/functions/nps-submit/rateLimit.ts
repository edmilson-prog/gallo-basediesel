/**
 * Sliding-window rate limit, in memory, keyed by IP.
 *
 * This is a cheap brake against someone hammering the public endpoint, not a
 * hard barrier: an Edge Function instance is ephemeral and there may be
 * several, so the budget resets on cold start and is not shared. The real
 * barrier is the token itself — 64 opaque chars that cannot be enumerated, and
 * a single-use update guarded at the database.
 *
 * `nowMs` is a parameter rather than a Date.now() call so the window logic is
 * testable without faking timers.
 */
export interface IRateLimiter {
  check(key: string, nowMs: number): boolean;
}

export function createRateLimiter(opts: { limit: number; windowMs: number }): IRateLimiter {
  const hits = new Map<string, number[]>();

  return {
    check(key: string, nowMs: number): boolean {
      const cutoff = nowMs - opts.windowMs;
      const recent = (hits.get(key) ?? []).filter((stamp) => stamp > cutoff);

      if (recent.length >= opts.limit) {
        hits.set(key, recent);
        return false;
      }

      recent.push(nowMs);
      hits.set(key, recent);
      return true;
    },
  };
}
