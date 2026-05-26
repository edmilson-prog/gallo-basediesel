/**
 * SDR feature barrel (PRD-020).
 *
 * Engine is pure and lives next to the templates that consume it. Hooks and
 * pages are exported from their own sub-paths to keep tree-shaking happy.
 */
export { sdrRespond, applyResponseToSession, createSdrSession } from "./engine/respond";
export { detectIntent } from "./engine/intent";
export {
  renderTemplate,
  renderByTrigger,
  findTemplate,
  type SdrTemplateVariables,
} from "./templates/render";
export { DEFAULT_SDR_TEMPLATES, FALLBACK_SDR_MESSAGE } from "./templates/defaults";
export { useSdrResponder, getSdrAuthorId } from "./hooks/useSdrResponder";
export {
  useSdrPauseOnHumanIntervention,
  useSdrReactivate,
} from "./hooks/useSdrPauseOnHumanIntervention";
export { useSdrMetrics, type ISdrMetrics, type ISdrMetricsFilters } from "./hooks/useSdrMetrics";
