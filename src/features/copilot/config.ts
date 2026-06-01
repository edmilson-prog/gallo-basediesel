import type { CopilotPlacement } from "@/shared/types";

export const COPILOT_PLACEMENTS: readonly CopilotPlacement[] = ["strip", "tab", "card"] as const;

export const DEFAULT_COPILOT_PLACEMENT: CopilotPlacement = "strip";

/**
 * localStorage key holding the user's runtime placement override (per-browser).
 * Mirrors the theme system (`gallo-theme` / `gallo-mode`).
 */
export const COPILOT_PLACEMENT_STORAGE_KEY = "gallo-copilot-placement";

/** Type guard: narrows an unknown value to a valid `CopilotPlacement`. */
export function isCopilotPlacement(value: unknown): value is CopilotPlacement {
  return typeof value === "string" && (COPILOT_PLACEMENTS as readonly string[]).includes(value);
}

/**
 * Factory default placement from `VITE_COPILOT_PLACEMENT` (build-time).
 * Acts as the fallback when the user has no runtime override saved.
 * Invalid value → `strip` (warns in DEV).
 */
export function resolveEnvDefaultPlacement(): CopilotPlacement {
  const raw = import.meta.env.VITE_COPILOT_PLACEMENT;
  if (isCopilotPlacement(raw)) return raw;
  if (raw && import.meta.env.DEV) {
    console.warn(
      `[copilot] VITE_COPILOT_PLACEMENT="${raw}" inválido. ` +
        `Usando "${DEFAULT_COPILOT_PLACEMENT}". Valores: ${COPILOT_PLACEMENTS.join(", ")}.`,
    );
  }
  return DEFAULT_COPILOT_PLACEMENT;
}
