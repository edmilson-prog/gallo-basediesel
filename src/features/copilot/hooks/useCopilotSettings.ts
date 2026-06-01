import { createContext, useContext } from "react";
import type { CopilotPlacement } from "@/shared/types";

export interface ICopilotSettingsContext {
  /** Active placement variant (runtime override → env default → "strip"). */
  placement: CopilotPlacement;
  /** Persists the placement to localStorage and updates the live value. */
  setPlacement: (next: CopilotPlacement) => void;
}

export const CopilotSettingsContext = createContext<ICopilotSettingsContext | null>(null);

/** Read/update the Copilot runtime preferences. Must be used under CopilotSettingsProvider. */
export function useCopilotSettings(): ICopilotSettingsContext {
  const ctx = useContext(CopilotSettingsContext);
  if (!ctx) {
    throw new Error("useCopilotSettings must be used within a CopilotSettingsProvider");
  }
  return ctx;
}
