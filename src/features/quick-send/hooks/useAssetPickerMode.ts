// src/features/quick-send/hooks/useAssetPickerMode.ts
import { useCallback, useEffect, useState } from "react";

export const ASSET_PICKER_MODES = ["palette", "grid", "sheet"] as const;
export type AssetPickerMode = (typeof ASSET_PICKER_MODES)[number];

const STORAGE_KEY = "gallo-assetpicker-mode";
const DEFAULT_MODE: AssetPickerMode = "palette";

/** Pure normalizer — keeps localStorage parsing testable and total. */
export function normalizeAssetPickerMode(raw: string | null | undefined): AssetPickerMode {
  return ASSET_PICKER_MODES.includes(raw as AssetPickerMode)
    ? (raw as AssetPickerMode)
    : DEFAULT_MODE;
}

function read(): AssetPickerMode {
  if (typeof window === "undefined") return DEFAULT_MODE;
  try {
    return normalizeAssetPickerMode(window.localStorage.getItem(STORAGE_KEY));
  } catch {
    return DEFAULT_MODE;
  }
}

/** Persisted AssetPicker layout preference (default "palette"). Mirrors useMediaViewMode (D-2). */
export function useAssetPickerMode(): [AssetPickerMode, (mode: AssetPickerMode) => void] {
  const [mode, setMode] = useState<AssetPickerMode>(() => read());

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(STORAGE_KEY, mode);
    } catch {
      // ignore (private mode)
    }
  }, [mode]);

  const set = useCallback((next: AssetPickerMode) => setMode(next), []);
  return [mode, set];
}
