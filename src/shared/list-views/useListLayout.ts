import { useCallback, useState } from "react";
import { DEFAULT_LIST_LAYOUT, LIST_LAYOUTS, type ListLayout } from "./config";

function readLayout(storageKey: string): ListLayout {
  if (typeof window === "undefined") return DEFAULT_LIST_LAYOUT;
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (raw && (LIST_LAYOUTS as readonly string[]).includes(raw)) {
      return raw as ListLayout;
    }
  } catch {
    // localStorage indisponível — usa o padrão.
  }
  return DEFAULT_LIST_LAYOUT;
}

/**
 * Selected list layout persisted to localStorage under `storageKey`.
 * Synchronous read in the lazy initializer avoids any flash of the default.
 */
export function useListLayout(storageKey: string): [ListLayout, (layout: ListLayout) => void] {
  const [layout, setLayoutState] = useState<ListLayout>(() => readLayout(storageKey));

  const setLayout = useCallback(
    (next: ListLayout) => {
      setLayoutState(next);
      try {
        window.localStorage.setItem(storageKey, next);
      } catch {
        // Preferência apenas em memória nesta sessão.
      }
    },
    [storageKey],
  );

  return [layout, setLayout];
}
