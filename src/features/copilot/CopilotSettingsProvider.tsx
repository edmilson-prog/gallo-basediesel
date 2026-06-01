import { useCallback, useMemo, useState } from "react";
import type { CopilotPlacement } from "@/shared/types";
import {
  COPILOT_PLACEMENT_STORAGE_KEY,
  isCopilotPlacement,
  resolveEnvDefaultPlacement,
} from "./config";
import { CopilotSettingsContext } from "./hooks/useCopilotSettings";

function safeGet(key: string): string | null {
  try {
    return typeof window !== "undefined" ? localStorage.getItem(key) : null;
  } catch {
    return null;
  }
}

function safeSet(key: string, value: string): void {
  try {
    if (typeof window !== "undefined") localStorage.setItem(key, value);
  } catch {
    /* private mode — ignore */
  }
}

/** Resolution chain: localStorage override → env factory default → "strip". */
function readInitialPlacement(): CopilotPlacement {
  const raw = safeGet(COPILOT_PLACEMENT_STORAGE_KEY);
  if (isCopilotPlacement(raw)) return raw;
  return resolveEnvDefaultPlacement();
}

/**
 * Holds the Copilot runtime preferences (currently the placement variant).
 * Persists to localStorage, mirroring the theme system — changing the
 * placement in Configurações re-renders the conversation screen instantly,
 * with no page reload.
 */
export function CopilotSettingsProvider({ children }: { children: React.ReactNode }) {
  const [placement, setPlacementState] = useState<CopilotPlacement>(() => readInitialPlacement());

  const setPlacement = useCallback((next: CopilotPlacement) => {
    setPlacementState(next);
    safeSet(COPILOT_PLACEMENT_STORAGE_KEY, next);
  }, []);

  const value = useMemo(() => ({ placement, setPlacement }), [placement, setPlacement]);

  return (
    <CopilotSettingsContext.Provider value={value}>{children}</CopilotSettingsContext.Provider>
  );
}
