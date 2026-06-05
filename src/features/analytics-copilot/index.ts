export { metricCatalog, findMetricById } from "./catalog/metricCatalog";
export { resolveQuery, type IResolveContext, type IResolveResult } from "./engine/resolveQuery";
export { scopeClamp, type IClampContext, type IClampResult } from "./engine/scopeClamp";
export { executeQuery, refusalAnswer, unresolvedAnswer } from "./engine/executeQuery";
export { AnalyticsCopilotPanel } from "./components/AnalyticsCopilotPanel";
export { useAnalyticsCopilot, type IUseAnalyticsCopilotResult } from "./hooks/useAnalyticsCopilot";
export { AnalyticsCopilotConfigPage } from "./pages/AnalyticsCopilotConfigPage";
export { runCopilotQuery, type IRunCopilotContext, type IRunCopilotResult } from "./engine/runCopilotQuery";
export {
  createSession,
  appendMessages,
  deriveTitle,
  type ICopilotSessionRecord,
} from "./engine/sessionStore";
export { groupSessionsByDate, type ISessionGroup } from "./utils/sessionGrouping";
export { useCopilotChat, type IUseCopilotChat } from "./hooks/useCopilotChat";
export { useCopilotSessions } from "./hooks/useCopilotSessions";
export {
  useCopilotViewMode,
  normalizeViewMode,
  COPILOT_VIEW_MODES,
  type CopilotViewMode,
} from "./hooks/useCopilotViewMode";
export {
  COPILOT_CATEGORIES,
  metricUiMeta,
  metricIcon,
  categoryById,
  type ICopilotCategory,
} from "./catalog/metricUi";
export {
  categorizedSuggestionsForRole,
  type ICopilotSuggestionGroup,
  type ICopilotSuggestionItem,
} from "./i18n/suggestions";
export { AnalyticsCopilotPage } from "./pages/AnalyticsCopilotPage";
