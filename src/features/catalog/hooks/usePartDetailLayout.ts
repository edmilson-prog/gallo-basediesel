import { useCallback, useState } from "react";
import {
  DEFAULT_PART_DETAIL_LAYOUT,
  PART_DETAIL_LAYOUTS,
  PART_DETAIL_LAYOUT_STORAGE_KEY,
  type PartDetailLayout,
} from "../config/layout";

function readLayout(): PartDetailLayout {
  if (typeof window === "undefined") return DEFAULT_PART_DETAIL_LAYOUT;
  try {
    const raw = window.localStorage.getItem(PART_DETAIL_LAYOUT_STORAGE_KEY);
    if (raw && (PART_DETAIL_LAYOUTS as string[]).includes(raw)) {
      return raw as PartDetailLayout;
    }
  } catch {
    // localStorage indisponível — usa o padrão.
  }
  return DEFAULT_PART_DETAIL_LAYOUT;
}

/** Selected part-detail layout persisted to localStorage (global, no FOUC). */
export function usePartDetailLayout(): [PartDetailLayout, (layout: PartDetailLayout) => void] {
  const [layout, setLayoutState] = useState<PartDetailLayout>(() => readLayout());

  const setLayout = useCallback((next: PartDetailLayout) => {
    setLayoutState(next);
    try {
      window.localStorage.setItem(PART_DETAIL_LAYOUT_STORAGE_KEY, next);
    } catch {
      // Preferência apenas em memória nesta sessão.
    }
  }, []);

  return [layout, setLayout];
}
