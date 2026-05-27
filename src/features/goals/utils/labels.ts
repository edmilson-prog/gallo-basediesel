import type { GoalMetric, GoalStatus } from "@/shared/types";
import type { GoalProgressStatus } from "@/shared/types/goals";

export const GOAL_METRIC_LABEL: Record<GoalMetric, string> = {
  revenue: "Faturamento",
  margin: "Margem",
  tickets: "Quantidade de pedidos",
  ticket_medio: "Ticket médio",
  novos_clientes: "Novos clientes",
  positivacao: "Positivação",
  recovery: "Recuperação",
  conversion: "Conversão",
};

export const GOAL_METRIC_SHORT_LABEL: Record<GoalMetric, string> = {
  revenue: "Faturamento",
  margin: "Margem",
  tickets: "Pedidos",
  ticket_medio: "Ticket médio",
  novos_clientes: "Novos",
  positivacao: "Positivação",
  recovery: "Recuperação",
  conversion: "Conversão",
};

export const GOAL_METRIC_DESCRIPTION: Record<GoalMetric, string> = {
  revenue: "Soma do total de pedidos pagos no período.",
  margin: "Soma da margem bruta dos pedidos pagos.",
  tickets: "Quantidade de pedidos pagos no período.",
  ticket_medio: "Valor médio por pedido pago — incentiva pedidos maiores.",
  novos_clientes: "Clientes criados no período atribuídos ao vendedor.",
  positivacao: "Clientes distintos que compraram no período.",
  recovery: "Clientes recuperados (placeholder — depende de PRD-044).",
  conversion: "Taxa de conversão (placeholder — depende de PRD-053).",
};

export const GOAL_METRIC_ICON: Record<GoalMetric, string> = {
  revenue: "mdi:cash-multiple",
  margin: "mdi:chart-pie",
  tickets: "mdi:package-variant-closed",
  ticket_medio: "mdi:cart-outline",
  novos_clientes: "mdi:account-plus-outline",
  positivacao: "mdi:account-check-outline",
  recovery: "mdi:account-reactivate-outline",
  conversion: "mdi:swap-horizontal",
};

export type GoalMetricFormat = "currency" | "count" | "percent";

export const GOAL_METRIC_FORMAT: Record<GoalMetric, GoalMetricFormat> = {
  revenue: "currency",
  margin: "currency",
  tickets: "count",
  ticket_medio: "currency",
  novos_clientes: "count",
  positivacao: "count",
  recovery: "count",
  conversion: "percent",
};

export const GOAL_LEVEL_LABEL: Record<"store" | "team" | "individual", string> = {
  store: "Loja",
  individual: "Vendedor",
  team: "Equipe",
};

export const GOAL_STATUS_LABEL: Record<GoalStatus, string> = {
  ativa: "Ativa",
  concluida: "Concluída",
  arquivada: "Arquivada",
  cancelada: "Cancelada",
};

export const GOAL_PROGRESS_STATUS_LABEL: Record<GoalProgressStatus, string> = {
  no_caminho: "No caminho",
  atencao: "Atenção",
  atrasada: "Atrasada",
  concluida: "Concluída",
};

export const GOAL_PROGRESS_STATUS_ICON: Record<GoalProgressStatus, string> = {
  no_caminho: "mdi:trending-up",
  atencao: "mdi:alert-circle-outline",
  atrasada: "mdi:alert-decagram-outline",
  concluida: "mdi:trophy-outline",
};

export const PRIMARY_GOAL_METRICS: GoalMetric[] = [
  "revenue",
  "ticket_medio",
  "tickets",
  "positivacao",
  "novos_clientes",
];

export const SECONDARY_GOAL_METRICS: GoalMetric[] = ["margin", "recovery", "conversion"];
