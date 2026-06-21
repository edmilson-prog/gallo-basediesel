import type { IRelease } from "@/shared/types/about";

/** Max releases listed inside the modal; the rest collapse into an overflow note. */
export const MAX_RELEASES_IN_MODAL = 5;

export interface VersionGateResult {
  shouldOpen: boolean;
  newReleases: IRelease[];
  overflowCount: number;
}

/**
 * Compares two "major.minor.patch" strings numerically.
 * Returns >0 if a > b, 0 if equal, <0 if a < b. Missing/NaN segments count as 0.
 */
export function compareSemver(a: string, b: string): number {
  const pa = a.split(".").map((n) => parseInt(n, 10) || 0);
  const pb = b.split(".").map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

/**
 * Selects the minor/major releases newer than `lastSeen` that warrant the modal.
 * `releases` is expected most-recent-first (useChangelog/parseChangelog order).
 *
 * - lastSeen === null → silent baseline (no modal)
 * - keeps version > lastSeen AND kind !== "patch"
 * - caps to `maxReleases`; remainder → overflowCount
 */
export function selectNewReleases(
  releases: IRelease[],
  lastSeen: string | null,
  maxReleases: number = MAX_RELEASES_IN_MODAL,
): VersionGateResult {
  if (lastSeen === null) {
    return { shouldOpen: false, newReleases: [], overflowCount: 0 };
  }
  const fresh = releases.filter(
    (r) => r.kind !== "patch" && compareSemver(r.version, lastSeen) > 0,
  );
  const newReleases = fresh.slice(0, maxReleases);
  const overflowCount = Math.max(0, fresh.length - newReleases.length);
  return { shouldOpen: newReleases.length > 0, newReleases, overflowCount };
}

/** Version to persist as "seen" — the highest absolute release (patch included). */
export function latestVersionToMark(releases: IRelease[]): string | null {
  return releases.reduce<string | null>(
    (max, r) => (max === null || compareSemver(r.version, max) > 0 ? r.version : max),
    null,
  );
}
