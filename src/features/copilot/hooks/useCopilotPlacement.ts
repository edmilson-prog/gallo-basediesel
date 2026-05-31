import { useMemo } from "react";
import type { CopilotPlacement } from "@/shared/types";
import { resolvePlacement } from "../config";

/** Variante ativa do copiloto (estável durante a sessão — vem de env build-time). */
export function useCopilotPlacement(): CopilotPlacement {
  return useMemo(() => resolvePlacement(), []);
}
