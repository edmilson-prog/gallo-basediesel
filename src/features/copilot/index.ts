export { CopilotStrip } from "./components/CopilotStrip";
export { CopilotCard } from "./components/CopilotCard";
export { CopilotFicheTab } from "./components/CopilotFicheTab";
export { CopilotPlacementField } from "./components/CopilotPlacementField";
export { CopilotSettingsProvider } from "./CopilotSettingsProvider";
export { useCopilotPanel } from "./hooks/useCopilotPanel";
export { useCopilotPlacement } from "./hooks/useCopilotPlacement";
export { useCopilotSettings } from "./hooks/useCopilotSettings";
export type { ICopilotSettingsContext } from "./hooks/useCopilotSettings";
export type { ICopilotPanelState } from "./hooks/useCopilotPanel";
export { useCopilotReply } from "./hooks/useCopilotReply";
export type { ICopilotReplyState } from "./hooks/useCopilotReply";
export { DEFAULT_COPILOT_ASSISTANT_SETTINGS } from "./config/defaults";
export { shouldMountCopilot } from "./engine/shouldMountCopilot";
export type {
  ICopilotMountConversation,
  IShouldMountCopilotInput,
} from "./engine/shouldMountCopilot";
export { estimateAssistantCost } from "./engine/estimateAssistantCost";
export type {
  IAssistantCostEstimate,
  IEstimateAssistantCostInput,
} from "./engine/estimateAssistantCost";
