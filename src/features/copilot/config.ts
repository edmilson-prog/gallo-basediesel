import type { CopilotPlacement } from "@/shared/types";

export const COPILOT_PLACEMENTS: readonly CopilotPlacement[] = ["strip", "tab", "card"] as const;

export const DEFAULT_COPILOT_PLACEMENT: CopilotPlacement = "strip";

/**
 * Resolve a variante de posicionamento a partir de `VITE_COPILOT_PLACEMENT`.
 * Valor inválido → variante default (`strip`) com aviso em DEV.
 */
export function resolvePlacement(): CopilotPlacement {
  const raw = import.meta.env.VITE_COPILOT_PLACEMENT;
  if (raw && (COPILOT_PLACEMENTS as readonly string[]).includes(raw)) {
    return raw as CopilotPlacement;
  }
  if (raw && import.meta.env.DEV) {
    console.warn(
      `[copilot] VITE_COPILOT_PLACEMENT="${raw}" inválido. ` +
        `Usando "${DEFAULT_COPILOT_PLACEMENT}". Valores: ${COPILOT_PLACEMENTS.join(", ")}.`,
    );
  }
  return DEFAULT_COPILOT_PLACEMENT;
}
