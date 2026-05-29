import type { CashFlowSource, CashFlowStatus } from "@/shared/types";

/** User-facing copy for the cash flow feature (PRD-055). All pt-BR. */
export const CASHFLOW_STRINGS = {
  title: "Fluxo de Caixa",
  subtitle: "Entradas e saídas em regime de caixa — o que entrou e o que vai entrar/sair",
  newManualEntry: "Lançamento manual",

  // KPIs
  kpiCurrentBalance: "Saldo atual",
  kpiInflows: "Entradas do período",
  kpiOutflows: "Saídas do período",
  kpiProjectedBalance: "Saldo projetado",
  kpiProjectedHelp: "Fim do período, com previstos",

  // Chart
  chartTitle: "Evolução do saldo",
  chartRealized: "Realizado",
  chartProjected: "Projetado",
  chartInflow: "Entradas",
  chartOutflow: "Saídas",
  chartBalance: "Saldo",
  chartMinBalance: "Saldo mínimo",

  // Filters
  filterPeriod: "Período",
  filterType: "Tipo",
  filterSource: "Origem",
  filterStatus: "Status",
  filterReset: "Limpar filtros",
  typeAll: "Entradas e saídas",
  typeIn: "Entradas",
  typeOut: "Saídas",
  statusAll: "Todos",

  // Table
  colDate: "Data",
  colType: "Tipo",
  colSource: "Origem",
  colDescription: "Descrição",
  colAmount: "Valor",
  colStatus: "Status",
  empty: "Nenhuma movimentação no período selecionado.",

  // Alerts
  alertLowTitle: "Saldo abaixo do mínimo",
  alertProjectedCrossTitle: "Caixa projetado abaixo do mínimo",
  alertProjectedNegativeTitle: "Caixa projetado negativo",

  // Manual entry dialog
  manualTitle: "Novo lançamento manual",
  manualType: "Tipo",
  manualAporte: "Aporte (entrada)",
  manualRetirada: "Retirada (saída)",
  manualAmount: "Valor (R$)",
  manualDate: "Data",
  manualDescription: "Descrição",
  manualSave: "Salvar lançamento",
  manualSaved: "Lançamento registrado.",
  manualError: "Não foi possível registrar o lançamento.",

  // Regime banner
  regimeBanner:
    "O Fluxo de Caixa opera em regime de caixa (dinheiro que entra/sai). Para o resultado por competência, veja a DRE.",
  readOnlyBanner: "Você tem acesso somente leitura ao fluxo de caixa.",
} as const;

export const CASHFLOW_SOURCE_LABELS: Record<CashFlowSource, string> = {
  pedido: "Pedido",
  despesa: "Despesa",
  comissao: "Comissão",
  aporte: "Aporte",
  retirada: "Retirada",
  outro: "Outro",
};

export const CASHFLOW_STATUS_LABELS: Record<CashFlowStatus, string> = {
  realizado: "Realizado",
  previsto: "Previsto",
};
