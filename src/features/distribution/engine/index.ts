/**
 * Public surface of the routing engine (PRD-013).
 *
 * The engine is pure — it neither reads providers nor mutates settings.
 * Callers (mock provider in Fase 1, Edge Function in Fase 2) wire the
 * context and persist the resulting `IDistributionTrace`.
 */
export { distributeConversation } from "./distribute";
export { tryCarteira, tryEspecialidade, tryRoundRobin, tryCarga, tryFallback } from "./criteria";
export {
  isWithinBusinessHours,
  getOnlineSellers,
  selectByLoad,
  selectByRoundRobin,
  findSpecialtyMatches,
} from "./utils";
export type {
  IDistributionInput,
  IDistributionContext,
  IDistributionResult,
  ICriterionOutcome,
} from "./types";
