/** Brazilian Portuguese strings for the Inventory Analytics feature (PRD-050). */
export const INVENTORY_STRINGS = {
  pageTitle: "Estoque — Análise",
  pageSubtitle:
    "Cobertura em dias, curva XYZ, stockouts críticos e capital parado. Estrutura preparada para integração com o ERP DINTEC na Fase 2.",

  filtersCategory: "Categoria",
  filtersBrand: "Marca",
  filtersStatus: "Status",
  filtersCurve: "Curva",
  filtersCategoryAll: "Todas categorias",
  filtersBrandAll: "Todas marcas",
  filtersStatusAll: "Todos os status",
  filtersCurveAll: "X / Y / Z",

  statusOk: "OK",
  statusBaixo: "Baixo",
  statusCritico: "Crítico",
  statusExcesso: "Excesso",

  curveX: "X — Alto giro",
  curveY: "Y — Médio giro",
  curveZ: "Z — Baixo giro",

  tabOverview: "Visão Geral",
  tabCritical: "Críticos & Reposição",
  tabXyz: "Análise XYZ",
  tabExcess: "Excesso & Capital",

  kpiTotal: "Total de produtos",
  kpiOk: "Em estoque OK",
  kpiBaixo: "Baixo / Crítico",
  kpiCapital: "Capital amarrado",
  kpiCapitalExcess: "Capital em excesso",

  distributionTitle: "Distribuição por status",
  distributionEmpty: "Sem produtos para classificar.",

  overviewTableTitle: "Top 20 — Urgência",
  overviewEmpty: "Nenhum produto exige atenção no momento.",

  criticalEmpty: "Tudo sob controle — nenhum produto crítico ou abaixo do mínimo.",
  criticalExportCta: "Gerar lista de compras (CSV)",
  criticalExportToast: "Integração completa de compras virá na Fase 2 — CSV básico exportado.",

  xyzChartTitle: "Faturamento vs Estoque por classe",
  xyzChartHelp: "Comparativo Pareto-style do peso de cada classe no faturamento e no estoque.",
  xyzColumnX: "Classe X — Alto giro",
  xyzColumnY: "Classe Y — Médio giro",
  xyzColumnZ: "Classe Z — Baixo giro",

  excessEmpty: "Nenhum produto em excesso — capital bem aplicado.",
  excessNote: "Capital em excesso:",
  excessSuggestion: "Considere promoção, queima de estoque ou descontinuação.",

  reorderSuggestion: "Sugestão de reposição",
  reorderQuantity: "Quantidade sugerida",
  reorderCost: "Custo estimado",
  reorderRationale: "Justificativa",

  blockedTitle: "Acesso restrito",
  blockedDescription:
    "A análise de estoque é estratégica e visível apenas para Owner, Gestor e Financeiro.",

  // Config page
  configTitle: "Configurações de Estoque (Análise)",
  configSubtitle:
    "Parâmetros usados pela análise: janela de consumo, cobertura alvo e limite de excesso.",
  configBanner:
    "Integração com o ERP DINTEC disponível na Fase 2 — os dados de estoque virão direto do ERP.",
  configWindow: "Janela de análise de consumo",
  configWindowHelp: "Dias retroativos considerados para o consumo médio.",
  configTarget: "Cobertura alvo para sugestão de reposição",
  configTargetHelp: "Dias de estoque que a sugestão de compra busca cobrir.",
  configExcess: "Limite para classificar como excesso",
  configExcessHelp:
    "Quando a cobertura ultrapassa este valor e o produto é classe Z, é marcado como excesso.",
  configSave: "Salvar",
  configDiscard: "Descartar",
  configSaved: "Configurações de estoque salvas.",
  configSaveError: "Não foi possível salvar.",
} as const;
