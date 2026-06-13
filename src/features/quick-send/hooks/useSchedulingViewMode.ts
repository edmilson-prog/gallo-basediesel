import { useCallback, useEffect, useState } from "react";
import { LOCALSTORAGE_KEYS } from "@/config/themes";

export const SCHEDULING_VIEW_MODES = ["modal", "drawer", "inline", "timeline"] as const;
export type SchedulingViewMode = (typeof SCHEDULING_VIEW_MODES)[number];

const STORAGE_KEY = LOCALSTORAGE_KEYS.schedulingViewMode;
const DEFAULT_MODE: SchedulingViewMode = "modal";

/** Pure normalizer — keeps localStorage parsing testable and total. */
export function normalizeSchedulingViewMode(
  raw: string | null | undefined,
): SchedulingViewMode {
  return SCHEDULING_VIEW_MODES.includes(raw as SchedulingViewMode)
    ? (raw as SchedulingViewMode)
    : DEFAULT_MODE;
}

function read(): SchedulingViewMode {
  if (typeof window === "undefined") return DEFAULT_MODE;
  try {
    return normalizeSchedulingViewMode(window.localStorage.getItem(STORAGE_KEY));
  } catch {
    return DEFAULT_MODE;
  }
}

/** Persisted Scheduling Center display mode (default "modal"). Mirrors useAssetPickerMode. */
export function useSchedulingViewMode(): [SchedulingViewMode, (mode: SchedulingViewMode) => void] {
  const [mode, setMode] = useState<SchedulingViewMode>(() => read());

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(STORAGE_KEY, mode);
    } catch {
      // ignore (private mode)
    }
  }, [mode]);

  const set = useCallback((next: SchedulingViewMode) => setMode(next), []);
  return [mode, set];
}
