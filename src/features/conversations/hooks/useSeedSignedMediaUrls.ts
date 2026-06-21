import { useEffect, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useMessagesProvider } from "@/providers/data";

/** Distinct, defined, not-yet-cached refs — the set worth batch-signing. */
export function missingMediaRefs(
  refs: (string | undefined)[],
  isCached: (ref: string) => boolean,
): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const ref of refs) {
    if (!ref || seen.has(ref)) continue;
    seen.add(ref);
    if (!isCached(ref)) out.push(ref);
  }
  return out;
}

/**
 * Pre-resolve a list of media refs in ONE batched request and seed the per-item
 * `["message-media-url", ref]` cache that `useResolvedMediaUrl` reads. The
 * bubbles stay unchanged: they get instant cache hits, and any ref not seeded
 * (e.g. a Realtime message arriving after this runs) still resolves per-item via
 * the unchanged hook. Best-effort: failures are swallowed and fall back to the
 * per-item path.
 */
export function useSeedSignedMediaUrls(refs: (string | undefined)[]): void {
  const messages = useMessagesProvider();
  const queryClient = useQueryClient();

  // Stable signature so the effect only re-runs when the ref SET changes, not on
  // every render / reorder.
  const refsKey = useMemo(
    () =>
      Array.from(new Set(refs.filter((r): r is string => Boolean(r))))
        .sort()
        .join("|"),
    [refs],
  );

  useEffect(() => {
    const missing = missingMediaRefs(
      refs,
      (ref) => queryClient.getQueryData(["message-media-url", ref]) !== undefined,
    );
    if (missing.length === 0) return;
    let cancelled = false;
    void messages
      .resolveMediaUrls(missing)
      .then((map) => {
        if (cancelled) return;
        for (const [ref, url] of Object.entries(map)) {
          queryClient.setQueryData(["message-media-url", ref], url);
        }
      })
      .catch(() => {
        /* best-effort seed — useResolvedMediaUrl falls back per item */
      });
    return () => {
      cancelled = true;
    };
    // refsKey captures the meaningful change; refs is intentionally not a dep.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refsKey, messages, queryClient]);
}
