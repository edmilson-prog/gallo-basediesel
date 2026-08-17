import type { IRelease } from "@/shared/types/about";
import { parseChangelog } from "./parseChangelog";

/**
 * Validates the /CHANGELOG.md response body before handing it to the UI
 * (issue #430).
 *
 * The SPA rewrite used to answer 200 text/html for ANY missing file, so a
 * build shipped without the pre-script copy rendered "Sobre/Novidades" as an
 * EMPTY release list as if it were a success — the query's error state and
 * retries never engaged. Throwing here turns that silent lie into a visible
 * error state.
 */
export function readChangelogPayload(contentType: string | null, body: string): IRelease[] {
  if ((contentType ?? "").toLowerCase().includes("text/html")) {
    throw new Error("CHANGELOG answered HTML (SPA rewrite fallback?) — file missing from deploy");
  }
  const releases = parseChangelog(body);
  if (releases.length === 0 && body.trim().length > 0) {
    throw new Error("CHANGELOG parsed into zero releases from a non-empty body");
  }
  return releases;
}
