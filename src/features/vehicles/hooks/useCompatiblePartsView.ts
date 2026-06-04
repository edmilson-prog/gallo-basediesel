import { useCallback, useState } from "react";
import {
  COMPATIBLE_PARTS_VIEWS,
  COMPATIBLE_PARTS_VIEW_STORAGE_KEY,
  DEFAULT_COMPATIBLE_PARTS_VIEW,
  type CompatiblePartsView,
} from "../config/compatibleParts";

function readStoredView(): CompatiblePartsView {
  if (typeof window === "undefined") return DEFAULT_COMPATIBLE_PARTS_VIEW;
  const raw = window.localStorage.getItem(COMPATIBLE_PARTS_VIEW_STORAGE_KEY);
  return COMPATIBLE_PARTS_VIEWS.includes(raw as CompatiblePartsView)
    ? (raw as CompatiblePartsView)
    : DEFAULT_COMPATIBLE_PARTS_VIEW;
}

/** Persisted preference for the compatible-parts visualization mode. */
export function useCompatiblePartsView(): [CompatiblePartsView, (v: CompatiblePartsView) => void] {
  const [view, setViewState] = useState<CompatiblePartsView>(readStoredView);
  const setView = useCallback((next: CompatiblePartsView) => {
    setViewState(next);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(COMPATIBLE_PARTS_VIEW_STORAGE_KEY, next);
    }
  }, []);
  return [view, setView];
}
