import { useEffect, useRef } from "react";

/**
 * Persists a list page's URL search state (sort, filters, pagination) to
 * `localStorage` and restores it on a fresh visit.
 *
 * Behaviour:
 * - On mount, if the URL has **no** search params (fresh navigation), restores
 *   the last saved state via `restore`. A URL that already carries params (a
 *   shared/deep link) is respected and never overwritten.
 * - On every subsequent change, the current search is saved. Clearing all
 *   filters persists the empty state, so the next visit starts clean.
 *
 * The first render is skipped when saving to avoid clobbering saved state with
 * the empty mount value before restoration runs.
 */
export function usePersistedListSearch(
  storageKey: string,
  search: Record<string, unknown>,
  restore: (saved: Record<string, unknown>) => void,
): void {
  const hydratedRef = useRef(false);
  const firstPersistRef = useRef(true);

  useEffect(() => {
    if (hydratedRef.current) return;
    hydratedRef.current = true;
    if (Object.keys(search).length > 0) return;
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (!raw) return;
      const saved = JSON.parse(raw) as unknown;
      if (
        saved &&
        typeof saved === "object" &&
        !Array.isArray(saved) &&
        Object.keys(saved).length > 0
      ) {
        restore(saved as Record<string, unknown>);
      }
    } catch {
      // Corrupt or unavailable storage — fall back to defaults.
    }
    // Mount-only: restore reads the initial URL state exactly once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (firstPersistRef.current) {
      firstPersistRef.current = false;
      return;
    }
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(search));
    } catch {
      // Quota exceeded or unavailable — keep state in memory only.
    }
  }, [search, storageKey]);
}
