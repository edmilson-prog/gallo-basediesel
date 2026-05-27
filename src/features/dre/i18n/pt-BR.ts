/** Brazilian Portuguese strings used across the DRE feature (PRD-048). */
export const DRE_STRINGS = {
  pageTitle: "DRE Gerencial",
  pageSubtitle:
    "Demonstrativo de Resultados — receita, custos e despesas consolidados a partir dos pedidos pagos.",

  filtersPeriod: "Período",
  filtersPeriodMonthly: "Mensal",
  filtersPeriodQuarterly: "Trimestral",
  filtersPeriodYearly: "Anual",
  filtersAnchor: "Mês de referência",

  tableHeaderLine: "Linha do DRE",
  tableHeaderCurrent: "Período atual",
  tableHeaderPrevious: "Período anterior",
  tableHeaderYearAgo: "Ano anterior",

  // Linhas
  lineGrossRevenue: "Receita Bruta",
  lineTaxOnSales: "(−) Impostos sobre vendas",
  lineReturns: "(−) Devoluções",
  lineNetRevenue: "= Receita Líquida",
  lineCmv: "(−) Custo das Mercadorias (CMV)",
  lineGrossMargin: "= Margem Bruta",
  lineOperatingExpenses: "(−) Despesas Operacionais",
  lineCommissions: "Comissões",
  linePayroll: "Folha de pagamento",
  lineRentInfra: "Aluguel + Infra",
  lineOtherExpenses: "Outros",
  lineOperatingResult: "= Resultado Operacional",
  lineTaxOnProfit: "(−) Impostos sobre Lucro",
  lineNetResult: "= Resultado Líquido",

  comparativeFlat: "Estável",
  comparativeNoBaseline: "Sem base",

  coverageLabel: "Cobertura de CMV",
  coverageHint: (pct: number, missing: number) =>
    `Custo cadastrado em ${pct.toFixed(0)}% dos itens — ${missing} sem custo`,
  coverageCtaParts: "Ver peças sem custo",

  alertsTitle: "Atenção neste período",

  chartTrendTitle: "Evolução do resultado — 12 meses",
  chartTrendHelp: "Receita líquida, custos totais e resultado líquido por mês.",
  chartTrendLegendRevenue: "Receita líquida",
  chartTrendLegendCosts: "Custos totais",
  chartTrendLegendNet: "Resultado líquido",
  chartTrendEmpty: "Sem dados suficientes nos últimos 12 meses.",

  chartExpensesTitle: "Composição das despesas operacionais",
  chartExpensesHelp: "Distribuição percentual no período selecionado.",
  chartExpensesLegendCommissions: "Comissões",
  chartExpensesLegendPayroll: "Folha",
  chartExpensesLegendRent: "Aluguel + Infra",
  chartExpensesLegendOther: "Outros",
  chartExpensesEmpty: "Nenhuma despesa registrada no período.",

  emptyTitle: "Sem pedidos pagos no período",
  emptyDescription:
    "Quando houver pedidos pagos no intervalo selecionado, o DRE será calculado automaticamente.",

  // Config
  configTitle: "Configurações financeiras",
  configSubtitle:
    "Parâmetros usados pelo DRE: impostos e despesas fixas mensais. Estes valores são estimativas — a integração contábil completa virá na Fase 2.",
  configDemoBanner:
    "Integração contábil real disponível na Fase 2. Os valores abaixo são estimativas usadas pelo DRE Gerencial.",
  configTaxOnSales: "Impostos sobre vendas (%)",
  configTaxOnSalesHelp: "Aplicado sobre a receita bruta para calcular a receita líquida.",
  configTaxOnProfit: "Impostos sobre lucro (%)",
  configTaxOnProfitHelp:
    "Aplicado sobre o resultado operacional positivo para chegar ao resultado líquido.",
  configFixedExpensesTitle: "Despesas mensais fixas (R$)",
  configPayroll: "Folha de pagamento",
  configRentInfra: "Aluguel + Infra",
  configOther: "Outros",
  configSave: "Salvar",
  configDiscard: "Descartar",
  configSaved: "Configurações financeiras salvas.",
  configSaveError: "Não foi possível salvar.",
} as const;
