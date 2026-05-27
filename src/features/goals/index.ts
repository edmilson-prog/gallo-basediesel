/**
 * Goals feature barrel (PRD-042).
 *
 * Sistema completo de metas comerciais: 5 tipos, 3 escopos, 3 períodos, tracking
 * em tempo real via hooks reativos, dashboard duplo (vendedor individual vs
 * gestor/owner agregado), criação/edição/detalhe, gráfico evolutivo, status
 * automático no fim do período e notificações de marco (50/80/100%).
 *
 * Consumido por PRD-014 (widget Painel Gestor), e futuramente por PRDs 043
 * (Gamificação) e 047 (Comissões).
 */
export { GoalsPage } from "./pages/GoalsPage";
export { useSellerGoals } from "./hooks/useSellerGoals";
export { useStoreGoals } from "./hooks/useStoreGoals";
export { useGoalProgress } from "./hooks/useGoalProgress";
export { useGoalsStatistics } from "./hooks/useGoalsStatistics";
export { useGoalsWithProgress } from "./hooks/useGoalsWithProgress";
export type { IGoalWithProgress } from "./hooks/useGoalsWithProgress";
export { calculateGoalProgress } from "./engine/calculate";
export { validateGoalsSearch } from "./hooks/useGoalsFilters";
export { GoalsWidget } from "./components/widget/GoalsWidget";
