import { useCallback, useState } from "react";
import { DEFAULT_DETAIL_LAYOUT, DETAIL_LAYOUTS, type DetailLayout } from "./config";

function readLayout(storageKey: string): DetailLayout {
  if (typeof window === "undefined") return DEFAULT_DETAIL_LAYOUT;
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (raw && (DETAIL_LAYOUTS as readonly string[]).includes(raw)) {
      return raw as DetailLayout;
    }
  } catch {
    // localStorage indisponível — usa o padrão.
  }
  return DEFAULT_DETAIL_LAYOUT;
}

/**
 * Selected detail layout persisted to localStorage under `storageKey`.
 * Synchronous read in the lazy initializer avoids any flash of the default.
 */
export function useDetailLayout(
  storageKey: string,
): [DetailLayout, (layout: DetailLayout) => void] {
  const [layout, setLayoutState] = useState<DetailLayout>(() => readLayout(storageKey));

  const setLayout = useCallback(
    (next: DetailLayout) => {
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
