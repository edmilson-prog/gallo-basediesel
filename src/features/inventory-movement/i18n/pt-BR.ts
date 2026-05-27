/** Brazilian Portuguese strings for the Inventory Movement feature (PRD-052). */
export const INVENTORY_MOVEMENT_STRINGS = {
  pageTitle: "Estoque — Movimentação",
  pageSubtitle:
    "Histórico cronológico de entradas, saídas e ajustes do estoque. No MVP, apenas saídas (pedidos pagos) e devoluções são reais — entradas, ajustes e transferências serão integrados via ERP DINTEC na Fase 2.",

  filtersType: "Tipo",
  filtersTypeAll: "Todos os tipos",
  filtersPart: "Produto",
  filtersPartAll: "Todos produtos",
  filtersPartPlaceholder: "Buscar SKU, OEM ou nome…",
  filtersPeriod: "Período",
  filtersPeriodAll: "Qualquer período",
  filtersSeller: "Responsável",
  filtersSellerAll: "Todos responsáveis",
  filtersStore: "Loja",
  filtersStoreAll: "Todas lojas",
  filtersClear: "Limpar filtros",

  periodLast24h: "Últimas 24h",
  periodLast7d: "Últimos 7 dias",
  periodLast30d: "Últimos 30 dias",
  periodLast90d: "Últimos 90 dias",

  typeSaidaVenda: "Saída por venda",
  typeEntradaCompra: "Entrada de compra",
  typeAjusteInventario: "Ajuste de inventário",
  typeTransferenciaLoja: "Transferência entre lojas",
  typeDevolucao: "Devolução",

  newMovementCta: "Nova movimentação manual",
  newMovementTooltip:
    "Disponível na Fase 2 — entradas e ajustes manuais via integração com o ERP DINTEC.",

  kpiTotal: "Movimentações no período",
  kpiOutflow: "Saídas (R$)",
  kpiInflow: "Entradas",
  kpiAdjustments: "Ajustes",
  kpiPlaceholderBadge: "Fase 2",
  kpiPlaceholderHint: "Disponível após integração DINTEC.",

  tableColDate: "Data / hora",
  tableColType: "Tipo",
  tableColPart: "Produto",
  tableColQuantity: "Quantidade",
  tableColOrigin: "Origem",
  tableColPerformedBy: "Executado por",
  tableColNotes: "Notas",

  tableEmptyTitle: "Nenhuma movimentação encontrada",
  tableEmptyDescription:
    "Ajuste os filtros ou aguarde os próximos pedidos pagos para ver o histórico.",

  rowOriginOrder: "Pedido",
  rowSystemActor: "Sistema GALLO",

  paginationLabel: (start: number, end: number, total: number) =>
    `${start}–${end} de ${total} movimentações`,
  paginationPrev: "Anterior",
  paginationNext: "Próxima",

  errorTitle: "Não foi possível carregar as movimentações.",
  errorRetry: "Tentar novamente",

  blockedTitle: "Acesso restrito",
  blockedDescription:
    "O histórico de movimentações é estratégico e visível apenas para Owner, Gestor e Financeiro.",

  widgetTitle: "Últimas movimentações",
  widgetSubtitle: "5 movimentações mais recentes de estoque",
  widgetCta: "Ver todas",
  widgetEmpty: "Nenhuma movimentação registrada ainda.",
  widgetItemNotes: "Sem notas",
} as const;
