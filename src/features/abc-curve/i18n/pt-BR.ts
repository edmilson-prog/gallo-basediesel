/**
 * User-facing strings for the ABC Curve feature (PRD-045).
 * All copy in Brazilian Portuguese with correct diacritics.
 */
export const ABC_STRINGS = {
  pageTitle: "Curva ABC",
  pageSubtitle: "Classificação automática de clientes por receita acumulada",
  drillTitle: (klass: string) => `Clientes Classe ${klass}`,

  // Filters
  filterPeriod: "Período",
  filterStore: "Loja",
  filterSeller: "Vendedor",
  filterAllStores: "Todas as lojas",
  filterAllSellers: "Todos os vendedores",
  reset: "Limpar filtros",

  // Period presets
  period3m: "3 meses",
  period6m: "6 meses",
  period12m: "12 meses",
  period24m: "24 meses",
  periodCustom: "Personalizado",

  // KPIs
  kpiTotalClassified: "Clientes classificados",
  kpiTotalRevenue: "Receita no período",
  kpiClassA: "Classe A",
  kpiClassB: "Classe B",
  kpiClassC: "Classe C",
  kpiClassHelp: (klass: string) => `${klass} — top contribuintes`,
  kpiClassRevenue: "da receita",
  kpiNoData: "Sem dados no período",

  // Migrations
  migrationsUpgradedTitle: "Clientes que subiram para A",
  migrationsUpgradedHelp: "Subiram de B ou C para A no período",
  migrationsDowngradedTitle: "Clientes que caíram de A",
  migrationsDowngradedHelp: "Antes eram A, agora B ou C",
  migrationsNewTitle: "Novos clientes em A",
  migrationsNewHelp: "Não existiam no período anterior e entraram direto em A",
  migrationsViewAll: "Ver todos",
  migrationsEmpty: "Nenhuma migração relevante no período",

  // Migration badges
  migrationUp: "↑ subiu",
  migrationDown: "↓ caiu",
  migrationKept: "manteve",
  migrationNew: "novo",
  migrationFrom: (from: string) => `de ${from}`,

  // Pareto chart
  chartTitle: "Gráfico de Pareto",
  chartSubtitle:
    "Receita individual (barras) e participação acumulada (linha) — top contribuintes à esquerda",
  chartBarRevenue: "Receita",
  chartLineCumulative: "Acumulado",
  chartCutoffA: "Corte A",
  chartCutoffB: "Corte B",
  chartEmpty: "Sem clientes classificados",

  // By-class section
  byClassTitle: "Distribuição por classe",
  byClassRevenue: "receita",
  byClassCount: (n: number) => (n === 1 ? "1 cliente" : `${n} clientes`),
  byClassOpen: "Abrir lista",

  // Tables
  tableRank: "#",
  tableCustomer: "Cliente",
  tableSeller: "Vendedor",
  tableRevenue: "Receita",
  tableCumulative: "% acumulada",
  tableMigration: "Migração",
  tableActions: "Ações",
  tableEmpty: "Nenhum cliente nesta classe no período",
  tableOpenProfile: "Abrir ficha",

  // Drill-down
  drillBack: "Voltar à curva ABC",
  drillKpiCount: "Clientes",
  drillKpiRevenue: "Receita",
  drillKpiShare: "Participação",

  // Pagination
  paginationPrev: "Anterior",
  paginationNext: "Próximo",

  // Access
  accessDeniedTitle: "Acesso restrito",
  accessDeniedDescription:
    "A curva ABC mostra dados estratégicos da carteira e respeita o escopo de carteira por vendedor.",
  accessDeniedAction: "Voltar ao início",
  invalidClassTitle: "Classe inválida",
  invalidClassDescription: "Escolha A, B ou C na URL.",

  // Admin / settings
  adminTitle: "Curva ABC",
  adminDescription:
    "Defina a janela de análise e os limites de classificação. Mudanças afetam a curva e a ficha de cada cliente — registradas no audit log.",
  adminPeriodMonthsLabel: "Janela de análise",
  adminPeriodMonthsUnit: "meses",
  adminClassALabel: "Corte de classe A (acumulado até)",
  adminClassBLabel: "Corte de classe B (acumulado até)",
  adminCutoffsHelp: "Padrão Pareto: 80% para A, 95% para B. Ambos em participação cumulativa.",
  adminRecalculateButton: "Recalcular agora",
  adminRecalculateToast: "Curva recalculada com as configurações atuais.",
  adminInvalidThresholds: "O corte B precisa ser maior que o corte A.",
  adminPreviewTitle: "Pré-visualização",
  adminPreviewCurrent: "Atual",
  adminPreviewDraft: "Com novos limites",
  adminSave: "Salvar alterações",
  adminDiscard: "Descartar",
  adminSavingToast: "Configuração salva.",
  adminSavingError: "Não foi possível salvar.",
} as const;
