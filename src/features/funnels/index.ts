export { getAccentClasses, FUNNEL_ACCENT_SLOTS } from "./engine/accentClasses";
export type { IFunnelAccentClasses } from "./engine/accentClasses";
export { isClosingKind, resolveStageKind } from "./engine/stageKind";
export { hexToAccentSlot } from "./engine/legacyStageColor";
export { planAddToFunnel, planRemoveFromFunnel } from "./engine/membershipRules";
export { resolveAccessibleFunnels } from "./engine/accessibleFunnels";
export { planStageTransition } from "./engine/stageTransition";
export { countDistinctLeads, daysInStage, summariseStage } from "./engine/funnelMetrics";
