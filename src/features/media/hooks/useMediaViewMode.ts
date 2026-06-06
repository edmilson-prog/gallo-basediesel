// src/features/media/hooks/useMediaViewMode.ts
import { useCallback, useEffect, useState } from "react";

export const MEDIA_VIEW_MODES = ["grade", "cartoes", "tipo"] as const;
export type MediaViewMode = (typeof MEDIA_VIEW_MODES)[number];

const STORAGE_KEY = "gallo-media-viewmode";
const DEFAULT_MODE: MediaViewMode = "grade";

/** Pure normalizer — keeps localStorage parsing testable and total. */
export function normalizeMediaViewMode(raw: string | null | undefined): MediaViewMode {
  return MEDIA_VIEW_MODES.includes(raw as MediaViewMode)
    ? (raw as MediaViewMode)
    : DEFAULT_MODE;
}

function read(): MediaViewMode {
  if (typeof window === "undefined") return DEFAULT_MODE;
  try {
    return normalizeMediaViewMode(window.localStorage.getItem(STORAGE_KEY));
  } catch {
    return DEFAULT_MODE;
  }
}

/** Persisted view-mode preference (default "grade"). */
export function useMediaViewMode(): [MediaViewMode, (mode: MediaViewMode) => void] {
  const [mode, setMode] = useState<MediaViewMode>(() => read());

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(STORAGE_KEY, mode);
    } catch {
      // ignore
    }
  }, [mode]);

  const set = useCallback((next: MediaViewMode) => setMode(next), []);
  return [mode, set];
}
