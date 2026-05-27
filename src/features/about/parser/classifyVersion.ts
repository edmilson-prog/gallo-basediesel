import type { ReleaseKind } from "@/shared/types/about";

/**
 * Derives the release kind by comparing this version to the previous one.
 *
 * Rules:
 * - If MAJOR changed → "major"
 * - Else if MINOR changed → "minor"
 * - Else → "patch"
 *
 * `previous` is null when classifying the very first release in the
 * changelog — in that case it is treated as "major".
 *
 * Both inputs are SemVer triplets like "0.36.0", with no leading "v".
 */
export function classifyVersion(current: string, previous: string | null): ReleaseKind {
  if (previous === null) return "major";
  const [cMaj, cMin] = current.split(".").map(Number);
  const [pMaj, pMin] = previous.split(".").map(Number);
  if (cMaj !== pMaj) return "major";
  if (cMin !== pMin) return "minor";
  return "patch";
}
