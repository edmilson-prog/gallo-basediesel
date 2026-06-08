import { useCallback, useState } from "react";

const LOCAL_STORAGE_KEY = "gallo-inbox-filters-collapsed";

function readCollapsed(): boolean {
  if (typeof window === "undefined") return true;
  try {
    const raw = window.localStorage.getItem(LOCAL_STORAGE_KEY);
    // Default to collapsed so the conversation list gets maximum room; the
    // user's choice is remembered from then on.
    if (raw === null) return true;
    return raw === "true";
  } catch {
    return true;
  }
}

function writeCollapsed(collapsed: boolean): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(LOCAL_STORAGE_KEY, String(collapsed));
  } catch {
    // Quota exceeded or unavailable — keep state in memory only.
  }
}

export interface IInboxFiltersCollapsedState {
  collapsed: boolean;
  setCollapsed: (next: boolean) => void;
  toggle: () => void;
}

/**
 * Persisted open/closed state for the inbox filter panel.
 *
 * Mirrors {@link useRealtimeConversations}'s `localStorage` pattern: the value
 * is read once on mount and written on every change. Defaults to collapsed so
 * the conversation list starts with the most vertical room available.
 */
export function useInboxFiltersCollapsed(): IInboxFiltersCollapsedState {
  const [collapsed, setCollapsedState] = useState(readCollapsed);

  const setCollapsed = useCallback((next: boolean) => {
    setCollapsedState(next);
    writeCollapsed(next);
  }, []);

  const toggle = useCallback(() => {
    setCollapsedState((prev) => {
      const next = !prev;
      writeCollapsed(next);
      return next;
    });
  }, []);

  return { collapsed, setCollapsed, toggle };
}
