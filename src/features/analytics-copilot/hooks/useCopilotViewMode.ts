// src/features/analytics-copilot/hooks/useCopilotViewMode.ts
import { useCallback, useEffect, useState } from "react";

export const COPILOT_VIEW_MODES = ["foco", "historico", "split"] as const;
export type CopilotViewMode = (typeof COPILOT_VIEW_MODES)[number];

const STORAGE_KEY = "gallo-copilot-viewmode";
const DEFAULT_MODE: CopilotViewMode = "foco";

/** Pure normalizer — keeps localStorage parsing testable and total. */
export function normalizeViewMode(raw: string | null | undefined): CopilotViewMode {
  return COPILOT_VIEW_MODES.includes(raw as CopilotViewMode)
    ? (raw as CopilotViewMode)
    : DEFAULT_MODE;
}

function read(): CopilotViewMode {
  if (typeof window === "undefined") return DEFAULT_MODE;
  try {
    return normalizeViewMode(window.localStorage.getItem(STORAGE_KEY));
  } catch {
    return DEFAULT_MODE;
  }
}

/** Persisted view-mode preference (default "foco"). */
export function useCopilotViewMode(): [CopilotViewMode, (mode: CopilotViewMode) => void] {
  const [mode, setMode] = useState<CopilotViewMode>(() => read());

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(STORAGE_KEY, mode);
    } catch {
      // ignore
    }
  }, [mode]);

  const set = useCallback((next: CopilotViewMode) => setMode(next), []);
  return [mode, set];
}
