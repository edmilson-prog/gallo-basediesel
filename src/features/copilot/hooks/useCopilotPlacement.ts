import type { CopilotPlacement } from "@/shared/types";
import { useCopilotSettings } from "./useCopilotSettings";

/**
 * Active copilot placement variant. Reactive — reads the runtime preference
 * (Configurações → Copiloto), which falls back to the `VITE_COPILOT_PLACEMENT`
 * factory default, then to `strip`.
 */
export function useCopilotPlacement(): CopilotPlacement {
  return useCopilotSettings().placement;
}
