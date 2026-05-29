import type {
  ExpenseCategory,
  ExpensePaymentMethod,
  ExpenseRecurrenceFrequency,
  ExpenseStatus,
} from "@/shared/types";

/** User-facing copy for the expenses feature (PRD-054). All pt-BR. */
export const EXPENSES_STRINGS = {
  title: "Despesas",
  subtitle: "Lançamentos operacionais que compõem a DRE e o Fluxo de Caixa",
  newExpense: "Nova despesa",
  editExpense: "Editar despesa",

  // KPIs
  kpiTotal: "Total no período",
  kpiTotalHelp: "Por competência",
  kpiPaid: "Pagas",
  kpiPending: "Pendentes",
  kpiOverdue: "Atrasadas",

  // Filters
  filterPeriod: "Período",
  filterCategory: "Categoria",
  filterStatus: "Status",
  filterSupplier: "Fornecedor",
  filterPaymentMethod: "Forma de pagamento",
  filterAll: "Todas",
  filterReset: "Limpar filtros",

  // Table
  colDescription: "Descrição",
  colCategory: "Categoria",
  colAmount: "Valor",
  colCompetence: "Competência",
  colDueDate: "Vencimento",
  colPayment: "Pagamento",
  colStatus: "Status",
  colRecurring: "Recorrente",
  colActions: "Ações",
  empty: "Nenhuma despesa encontrada para os filtros selecionados.",

  // Actions
  actionEdit: "Editar",
  actionMarkPaid: "Marcar como paga",
  actionDuplicate: "Duplicar",
  actionCancel: "Cancelar",

  // Form
  formDescription: "Descrição",
  formCategory: "Categoria",
  formAmount: "Valor (R$)",
  formCompetence: "Competência",
  formDueDate: "Vencimento",
  formSupplier: "Fornecedor",
  formPaymentMethod: "Forma de pagamento",
  formRecurringToggle: "Despesa recorrente",
  formFrequency: "Frequência",
  formDayOfMonth: "Dia do vencimento",
  formEndDate: "Recorre até (opcional)",
  formAttachment: "Comprovante",
  formAttachmentPhase2: "Upload de comprovante disponível na Fase 2.",
  formNotes: "Observações",
  formSave: "Salvar despesa",
  formCancel: "Cancelar",
  formSaved: "Despesa salva.",
  formSaveError: "Não foi possível salvar a despesa.",
  formRecurringSaved: "Série de despesas recorrentes criada.",

  // Mark paid dialog
  markPaidTitle: "Marcar despesa como paga",
  markPaidDate: "Data do pagamento",
  markPaidMethod: "Forma de pagamento",
  markPaidConfirm: "Confirmar pagamento",
  markPaidSuccess: "Despesa marcada como paga.",
  markPaidError: "Não foi possível registrar o pagamento.",

  // Cancel dialog
  cancelTitle: "Cancelar despesa",
  cancelReason: "Motivo (opcional)",
  cancelConfirm: "Cancelar despesa",
  cancelKeep: "Voltar",
  cancelSuccess: "Despesa cancelada.",
  cancelError: "Não foi possível cancelar a despesa.",

  // Recurring series scope (RF-015/016)
  scopeQuestion: "Esta despesa faz parte de uma série recorrente. Aplicar em:",
  scopeOne: "Somente esta",
  scopeFuture: "Esta e futuras",
  scopeAll: "Toda a série",
  seriesUpdated: "Série de despesas atualizada.",
  seriesCanceled: "Série de despesas cancelada.",

  // Read-only banner
  readOnlyBanner: "Você tem acesso somente leitura às despesas.",
} as const;

export const EXPENSE_CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  folha: "Folha de pagamento",
  aluguel: "Aluguel",
  infraestrutura: "Infraestrutura",
  marketing: "Marketing",
  impostos: "Impostos e taxas",
  fornecedores: "Fornecedores",
  logistica: "Logística",
  manutencao: "Manutenção",
  outros: "Outros",
};

export const EXPENSE_STATUS_LABELS: Record<ExpenseStatus, string> = {
  pendente: "Pendente",
  pago: "Pago",
  atrasado: "Atrasado",
  cancelado: "Cancelado",
};

export const EXPENSE_PAYMENT_METHOD_LABELS: Record<ExpensePaymentMethod, string> = {
  pix: "Pix",
  boleto: "Boleto",
  transferencia: "Transferência",
  dinheiro: "Dinheiro",
  cartao: "Cartão",
  debito_automatico: "Débito automático",
};

export const EXPENSE_FREQUENCY_LABELS: Record<ExpenseRecurrenceFrequency, string> = {
  mensal: "Mensal",
  trimestral: "Trimestral",
  anual: "Anual",
};
