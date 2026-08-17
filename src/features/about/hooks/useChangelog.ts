import { useQuery } from "@tanstack/react-query";
import type { IRelease } from "@/shared/types/about";
import { readChangelogPayload } from "../parser/readChangelogPayload";

const CHANGELOG_URL = "/CHANGELOG.md";

/**
 * Fetches /CHANGELOG.md (copied into public/ by scripts/copy-changelog.mjs)
 * and parses it into IRelease[].
 *
 * Cached forever within the session (the file does not change at runtime).
 * On error the query keeps retrying twice with exponential backoff. The body
 * is validated by readChangelogPayload so an HTML fallback or an unparseable
 * body surfaces as an error state instead of an empty list (issue #430).
 */
export function useChangelog() {
  return useQuery<IRelease[], Error>({
    queryKey: ["changelog"],
    queryFn: async () => {
      const res = await fetch(CHANGELOG_URL, { cache: "no-cache" });
      if (!res.ok) {
        throw new Error(`CHANGELOG fetch failed: ${res.status} ${res.statusText}`);
      }
      return readChangelogPayload(res.headers.get("content-type"), await res.text());
    },
    staleTime: Infinity,
    gcTime: Infinity,
    retry: 2,
  });
}
