/**
 * User-facing strings for the Goals feature (PRD-042).
 * Brazilian Portuguese with correct diacritics throughout.
 */
export const GOALS_STRINGS = {
  pageTitle: "Metas",
  pageSubtitle: "Acompanhe metas comerciais por vendedor e loja em tempo real",

  // Tabs
  tabActive: "Ativas",
  tabHistory: "Histórico",

  // Empty states
  emptyVendedor: "Você ainda não tem metas ativas — fale com seu gestor.",
  emptyVendedorHistory: "Você ainda não tem histórico de metas.",
  emptyGestor: "Nenhuma meta encontrada com os filtros atuais.",
  emptyGestorHistory: "Sem metas no histórico para o período selecionado.",

  // CTAs
  createCta: "Nova meta",
  editCta: "Editar",
  archiveCta: "Arquivar",
  cancelCta: "Cancelar meta",
  viewDetailsCta: "Ver detalhes",
  backToList: "Voltar para metas",
  acceptSuggestionCta: "Aceitar sugestão",

  // KPIs (agregado)
  kpiTotalActive: "Metas ativas",
  kpiTotalActiveHelp: "Total de metas com status Ativa no período",
  kpiAveragePct: "% média de atingimento",
  kpiAveragePctHelp: "Média do progresso de todas as metas ativas",
  kpiHeroes: "Acima de 100%",
  kpiHeroesHelp: "Vendedores que já bateram a meta",
  kpiAttention: "Abaixo de 70%",
  kpiAttentionHelp: "Vendedores que precisam de apoio",

  // Greeting (vendedor)
  greetingActiveOne: "Você tem 1 meta ativa",
  greetingActiveMany: (n: number) => `Você tem ${n} metas ativas`,
  daysRemainingLabel: "dias restantes",
  daysRemainingOneLabel: "dia restante",
  projectionLabel: "Projeção",
  pacingLabel: "Mantendo o ritmo atual",

  // Table columns
  tableColName: "Nome",
  tableColType: "Tipo",
  tableColScope: "Escopo",
  tableColPeriod: "Período",
  tableColDates: "Datas",
  tableColTarget: "Target",
  tableColProgress: "Progresso",
  tableColStatus: "Status",
  tableColProjection: "Projeção",
  tableColActions: "Ações",

  // Filters
  filterAllTypes: "Todos os tipos",
  filterAllScopes: "Todos os escopos",
  filterAllStatuses: "Todos os status",
  filterAllSellers: "Todos os vendedores",
  filterAllStores: "Todas as lojas",
  filterAllPeriods: "Todos os períodos",
  filterReset: "Limpar filtros",
  filterTypeLabel: "Tipo",
  filterScopeLabel: "Escopo",
  filterStatusLabel: "Status",
  filterSellerLabel: "Vendedor",
  filterStoreLabel: "Loja",
  filterPeriodLabel: "Período",

  // Form — config
  formConfigTitle: "Configuração",
  formConfigTypeLabel: "Tipo de meta",
  formConfigPeriodLabel: "Período",
  formConfigStartLabel: "Data de início",
  formConfigEndLabel: "Data de fim",
  formConfigNameLabel: "Nome",
  formConfigNameHelp: "Autogerado a partir do tipo + período. Edite se quiser personalizar.",
  formConfigAdvanced: "Mais opções (margem, recuperação, conversão)",

  // Form — scope
  formScopeTitle: "Escopo",
  formScopeIndividual: "Individual (vendedor)",
  formScopeStore: "Loja inteira",
  formScopeGlobal: "Global (cross-store)",
  formScopeSellerLabel: "Vendedor responsável",
  formScopeStoreLabel: "Loja",
  formScopeStoreLocked: "Travado para a sua loja",
  formScopeGlobalOwnerOnly: "Apenas Owner pode criar metas globais",

  // Form — target
  formTargetTitle: "Valor",
  formTargetLabel: "Target",
  formTargetCurrencyUnit: "R$",
  formTargetCountUnit: "unidades",
  formTargetPercentUnit: "%",
  formTargetSuggestionTitle: "Sugestão baseada no histórico",
  formTargetSuggestionEmpty: "Sem histórico do mesmo escopo + tipo para sugerir.",
  formTargetPreviousLabel: "Período anterior",
  formTargetAchievedLabel: "Alcançou",
  formTargetCompareHigher: (pct: number) => `Esta meta é ${pct}% maior que a anterior`,
  formTargetCompareLower: (pct: number) => `Esta meta é ${pct}% menor que a anterior`,
  formTargetCompareSame: "Mesmo valor da meta anterior",

  // Form — reward
  formRewardTitle: "Recompensa (opcional)",
  formRewardLabel: "Descrição",
  formRewardPlaceholder: "Ex.: Bônus de R$ 500 ao atingir 100% da meta.",
  formRewardHint: "Será visível ao vendedor responsável.",

  // Form buttons
  formCancelCta: "Cancelar",
  formSaveDraftCta: "Salvar rascunho",
  formCreateActiveCta: "Criar e ativar",
  formSaveChangesCta: "Salvar alterações",

  // Validation
  validationEndBeforeStart: "A data de fim deve ser posterior à data de início.",
  validationTargetPositive: "O target deve ser maior que zero.",
  validationDuplicate: (sellerName: string, periodLabel: string) =>
    `Já existe meta similar para ${sellerName} em ${periodLabel}. Arquive-a antes de criar uma nova.`,
  validationSellerRequired: "Selecione um vendedor.",
  validationStoreRequired: "Selecione uma loja.",

  // Edit/cancel
  editModalTitle: "Editar meta",
  editFieldsLocked: "Tipo, escopo, vendedor e período não podem ser alterados após criação.",
  targetChangeWarningTitle: "Mudança de target em meta ativa",
  targetChangeWarning:
    "Esta alteração impacta cálculos de comissão a partir desta data. Comissões já fechadas permanecem inalteradas.",
  targetChangeConfirm: "Entendi, confirmar mudança",
  cancelDialogTitle: "Cancelar meta",
  cancelReasonLabel: "Motivo do cancelamento",
  cancelReasonRequired: "Informe um motivo para cancelar a meta.",
  cancelReasonPlaceholder: "Ex.: Mudança de estratégia, fechamento de loja, vendedor afastado.",
  archiveConfirmTitle: "Arquivar meta?",
  archiveConfirmDescription:
    "A meta sairá da listagem de ativas e ficará disponível apenas no histórico.",

  // Milestones
  milestone50: (name: string) => `🎯 Você atingiu 50% da meta ${name}!`,
  milestone80: (name: string) => `🚀 80% atingido — falta pouco para bater ${name}!`,
  milestone100: (name: string) => `🏆 Parabéns! Meta ${name} atingida!`,

  // Status auto
  autoCompletedToast: (name: string) => `Meta ${name} fechada como concluída.`,
  autoArchivedToast: (name: string) => `Meta ${name} arquivada por não atingir 100%.`,

  // Toasts
  createSuccess: "Meta criada com sucesso.",
  updateSuccess: "Meta atualizada.",
  cancelSuccess: "Meta cancelada.",
  archiveSuccess: "Meta arquivada.",
  saveError: "Não foi possível salvar. Tente novamente.",

  // Detail sections
  detailHeaderCreatedBy: "Criada por",
  detailHeaderCreatedAt: "em",
  detailSummaryTitle: "Resumo de progresso",
  detailSummaryAchieved: "Atingido",
  detailSummaryTarget: "Target",
  detailSummaryProjection: "Projeção de fechamento",
  detailEvolutionTitle: "Evolução temporal",
  detailEvolutionRealized: "Realizado",
  detailEvolutionExpected: "Esperado",
  detailCompositionTitle: "Composição",
  detailCompositionOrders: "Pedidos contribuintes",
  detailCompositionCustomers: "Clientes positivados",
  detailCompositionNewCustomers: "Clientes adquiridos",
  detailCompositionTicketStats: "Estatísticas do ticket",
  detailHistoryTitle: "Histórico de mudanças",
  detailHistoryEmpty: "Sem alterações registradas para esta meta.",

  // Manager dashboard widget
  widgetTitle: "Metas do mês",
  widgetViewAll: "Ver todas",
  widgetEmpty: "Nenhuma meta ativa no momento.",

  // Access
  accessDeniedTitle: "Acesso restrito",
  accessDeniedDescription: "Você não tem permissão para acessar esta meta.",
  accessDeniedAction: "Voltar para metas",

  // Batch annual goals (metas em lote)
  batchCta: "Meta em lote",
  batchTitle: "Metas em lote — planejamento anual",
  batchSubtitle:
    "Defina a meta de cada vendedor mês a mês. Edite um mês por vez; o total anual é atualizado conforme você preenche.",
  batchSharedParams: "Parâmetros compartilhados",
  batchStore: "Loja",
  batchMetric: "Métrica",
  batchYear: "Ano",
  batchReward: "Recompensa (opcional)",
  batchRewardPlaceholder: "Ex.: bônus trimestral...",
  batchMonth: "Mês",
  batchMonthHint: (filled: number) =>
    `${filled} de 12 meses preenchidos. "Aplicar em" define se as ações agem só neste mês ou no ano todo.`,
  batchScopeLabel: "Aplicar em",
  batchScopeMonth: "Este mês",
  batchScopeYear: "Ano todo",
  batchBaseValue: "Valor-base",
  batchApplyBase: "Aplicar valor-base",
  batchSuggest: "Sugerir",
  batchColSeller: "Vendedor",
  batchColMonthTarget: (month: string) => `Meta de ${month}`,
  batchColSuggestion: "Sugestão",
  batchColAnnualTotal: "Total anual",
  batchColStatus: "Status (mês)",
  batchAnnualMonths: (n: number) => `${n}/12 meses`,
  batchRowWillCreate: "será criada",
  batchRowEmpty: "vazio — ignorado",
  batchRowConflict: (month: string) => `já tem meta em ${month}`,
  batchSellersCount: (n: number) => `Vendedores (${n} ativos)`,
  batchSummary: (created: number, skipped: number, total: string) =>
    `${created} metas mensais serão criadas${skipped ? ` · ${skipped} puladas por conflito` : ""} · total anual ${total}`,
  batchCreate: (n: number) => `Criar ${n} metas do ano`,
  batchSaveDraft: "Salvar rascunho",
  batchCreateSuccess: (created: number, skipped: number) =>
    `${created} metas criadas${skipped ? `, ${skipped} puladas` : ""}.`,
  batchCreatePartial: (created: number, failed: number) =>
    `${created} metas criadas, ${failed} falharam.`,
  batchEmptyState: "Selecione vendedores e preencha ao menos um mês para criar metas.",
} as const;
