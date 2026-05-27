import { useQuery } from "@tanstack/react-query";
import type { IRelease } from "@/shared/types/about";
import { parseChangelog } from "../parser/parseChangelog";

const CHANGELOG_URL = "/CHANGELOG.md";

/**
 * Fetches /CHANGELOG.md (copied into public/ by scripts/copy-changelog.mjs)
 * and parses it into IRelease[].
 *
 * Cached forever within the session (the file does not change at runtime).
 * On error the query keeps retrying twice with exponential backoff.
 */
export function useChangelog() {
  return useQuery<IRelease[], Error>({
    queryKey: ["changelog"],
    queryFn: async () => {
      const res = await fetch(CHANGELOG_URL, { cache: "no-cache" });
      if (!res.ok) {
        throw new Error(`CHANGELOG fetch failed: ${res.status} ${res.statusText}`);
      }
      const text = await res.text();
      return parseChangelog(text);
    },
    staleTime: Infinity,
    gcTime: Infinity,
    retry: 2,
  });
}
