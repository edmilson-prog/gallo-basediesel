import type { LeadTemperature } from "@/shared/types";

/**
 * Monotonic lead temperature escalation (PRD-027 D-9, RF-017).
 * `frio → morno → quente`; `quente` is the ceiling. NEVER downgrades.
 */

const LADDER: Record<LeadTemperature, LeadTemperature> = {
  frio: "morno",
  morno: "quente",
  quente: "quente",
};

export function nextTemperature(current: LeadTemperature): LeadTemperature {
  return LADDER[current];
}
