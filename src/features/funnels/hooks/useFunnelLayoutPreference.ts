import { useCallback, useEffect, useState } from "react";
import { DEFAULT_FUNNEL_LAYOUT, FUNNEL_LAYOUTS, type FunnelLayout } from "../engine/resolveLayout";

const STORAGE_KEY = "gallo-leads-funnel-layout";

/** Pure normalizer — keeps localStorage parsing testable and total. */
export function normalizeFunnelLayout(raw: string | null | undefined): FunnelLayout {
  return FUNNEL_LAYOUTS.includes(raw as FunnelLayout)
    ? (raw as FunnelLayout)
    : DEFAULT_FUNNEL_LAYOUT;
}

function read(): FunnelLayout {
  if (typeof window === "undefined") return DEFAULT_FUNNEL_LAYOUT;
  try {
    return normalizeFunnelLayout(window.localStorage.getItem(STORAGE_KEY));
  } catch {
    return DEFAULT_FUNNEL_LAYOUT;
  }
}

/**
 * The user's chosen navigation pattern.
 *
 * Stores the RAW preference, never the layout `resolveLayout` derived from it:
 * a narrow window must not permanently rewrite the choice. Not scoped per
 * store — this is a personal display habit, not store configuration.
 */
export function useFunnelLayoutPreference(): [FunnelLayout, (l: FunnelLayout) => void] {
  const [layout, setLayout] = useState<FunnelLayout>(() => read());

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(STORAGE_KEY, layout);
    } catch {
      // Private mode or a full quota: the session still works, unpersisted.
    }
  }, [layout]);

  const set = useCallback((next: FunnelLayout) => setLayout(next), []);
  return [layout, set];
}
