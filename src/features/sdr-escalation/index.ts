export { escalateToHuman, defaultModeFor } from "./engine/escalate";
export type { IEscalateToHumanInput, IEscalateToHumanResult } from "./engine/escalate";
export { chooseHumanSeller } from "./engine/choose-seller";
export type { IChooseSellerInput, IChooseSellerOutcome } from "./engine/choose-seller";
export { buildContextSummary } from "./engine/build-summary";
export type { IBuildSummaryInput } from "./engine/build-summary";
export {
  renderEscalationBubble,
  renderShortSummary,
  renderCustomerHandoff,
  ESCALATION_REASON_LABELS,
  ESCALATION_MODE_LABELS,
} from "./templates/render";
export { useEscalationMetrics } from "./hooks/useEscalationMetrics";
export type { IEscalationMetrics } from "./hooks/useEscalationMetrics";
export {
  useUrgentBroadcastQueue,
  ESCALATION_QUEUE_EVENT,
  dispatchEscalationEvent,
} from "./hooks/useUrgentBroadcastQueue";
export { useEscalationsByConversation } from "./hooks/useEscalationsByConversation";
export { useConversationEscalation } from "./hooks/useConversationEscalation";
export { useEscalationToasts } from "./hooks/useEscalationToasts";
export { useUrgentBroadcastTimer } from "./hooks/useUrgentBroadcastTimer";
export { useEscalationQueueTimeoutMonitor } from "./hooks/useEscalationQueueTimeoutMonitor";
export { EscalationBadge } from "./components/EscalationBadge";
export { UrgentBroadcastClaim } from "./components/UrgentBroadcastClaim";
export { EscalationMetricsCard } from "./pages/EscalationMetricsCard";
export { useSdrEscalation } from "./hooks/useSdrEscalation";
export type { IRunEscalationArgs, IRunEscalationResult } from "./hooks/useSdrEscalation";
export type {
  IUrgentBroadcastEntry,
  IEscalationQueueEventDetail,
} from "./hooks/useUrgentBroadcastQueue";
