/** Every user-facing string of the suppliers feature. */
export const SUPPLIERS_STRINGS = {
  page: {
    title: "Fornecedores",
    description:
      "Quem fornece, em que condição e o que se compra de cada um. O prazo médio de pagamento aqui é a contraparte do prazo médio de recebimento.",
  },
  kpis: {
    active: "Fornecedores ativos",
    // A manchete da tela é o backlog da fila de nomes soltos do catálogo, não
    // o preenchimento de CNPJ (a tabela já exige `cnpj not null`).
    pending: "Pendentes de cadastro",
    linkedParts: "Peças vinculadas",
    purchases: "Compras 12 meses",
    leadTime: "Prazo médio de entrega",
    leadTimeUnit: "dias",
    // Shown under "Pendentes de cadastro" when the queue has items — points
    // at the queue section below the table, not at a filter (the queue is
    // never hidden behind one; see `pendingQueue` below).
    pendingHint: "clique para ver a fila",
  },
  /** `SuppliersPendingQueue` — names loose in the catalog with no matching
   *  registered supplier yet. Sits below the table, its own section, never
   *  a tab: the point is seeing both sets at once. */
  pendingQueue: {
    title: (count: number) => `Pendentes de cadastro (${count})`,
    subtitle:
      "Nomes do catálogo sem fornecedor cadastrado — cada um vira um cadastro com um clique.",
    partsCount: (count: number) => (count === 1 ? "1 peça vinculada" : `${count} peças vinculadas`),
    register: "Cadastrar",
    /** Shown instead of the list when the queue's own fetch failed — same
     *  discipline as the table's `error`: never let a failure read as "a
     *  fila está vazia". */
    error: "Não foi possível carregar a fila de pendentes.",
  },
  categories: {
    all: "Todos",
    parts: "Peças",
    services: "Serviços",
    freight: "Frete",
    financial: "Financeiro",
  },
  sort: {
    name: "Nome",
    parts: "Peças",
    purchases: "Compras",
    completeness: "Cadastro",
  },
  columns: {
    supplier: "Fornecedor",
    terms: "Condição",
    parts: "Peças",
    purchases: "Compras 12m",
    completeness: "Cadastro",
    contact: "Contato",
  },
  columnsMenu: {
    trigger: "Configurar colunas",
    title: "Colunas visíveis",
    showAll: "Exibir todas",
  },
  table: {
    /** Appended to the identity cell's subline when a lead time is known. */
    leadTimeSuffix: (days: number) => ` · entrega em ${days} d`,
  },
  search: {
    placeholder: "Buscar por nome ou CNPJ…",
    label: "Buscar fornecedor",
  },
  actions: {
    create: "Novo fornecedor",
    edit: "Editar cadastro",
    fullSheet: "Ficha completa",
    archive: "Desativar fornecedor",
  },
  rail: {
    emptySelection: "Selecione um fornecedor para ver a ficha.",
    suppliedItems: "O que compramos",
    lastEntries: "Últimas entradas",
  },
  empty: {
    list: "Nenhum fornecedor encontrado.",
    listHint: "Ajuste os filtros ou cadastre o primeiro fornecedor.",
    entries: "Sem notas de entrada registradas.",
    items: "Ainda sem itens vinculados.",
    purchases: "Sem compras registradas — o histórico começa na primeira nota de entrada.",
    payables:
      "O contas a pagar ainda não existe no sistema. Quando existir, os títulos deste fornecedor aparecem aqui.",
  },
  /** Shown instead of `empty.*` when the fetch itself failed — a missing
   *  table, an RLS denial or a timeout must never read as "no suppliers". */
  error: {
    title: "Não foi possível carregar os fornecedores.",
    description:
      "A causa mais provável hoje é o cadastro ainda não existir no banco. Tente novamente em instantes; se persistir, avise o suporte.",
    retry: "Tentar novamente",
  },
  complete: "Cadastro completo",
  newBadge: "novo",
  chart: {
    /** `SupplierPurchasesChart`'s `aria-label` — screen-reader users get this instead of the SVG. */
    purchasesAriaLabel: (total: string) => `Compras dos últimos 12 meses, total de ${total}`,
  },
  sheet: {
    /** Accessible `SheetTitle` — visually `sr-only`, the visible header repeats the name. */
    title: (name: string) => `Ficha completa de ${name}`,
    description: "Dados cadastrais, métricas de compra e ações do fornecedor.",
    noHistoryBadge: "Novo · sem histórico",
    factsLabels: {
      registryStatus: "Situação na Receita",
    },
    purchasesTitle: "Compras mês a mês",
    /** Shown instead of a fabricated zero while `stats` hasn't resolved yet. */
    statsLoading: "Carregando dados de compras…",
    payablesTitle: "Títulos em aberto",
    footer: {
      newPurchaseOrder: "Novo pedido de compra",
      schedulePayments: "Agendar pagamentos",
      payablesDisabledReason: "Depende do contas a pagar, que ainda não existe.",
    },
  },
  mutations: {
    created: (name: string) => `Fornecedor ${name} cadastrado.`,
    updated: "Cadastro atualizado.",
    archived: (name: string) => `${name} desativado.`,
  },
  form: {
    createTitle: "Novo fornecedor",
    editTitle: "Editar fornecedor",
    createSubtitle: "CNPJ primeiro — a Receita Federal preenche o resto.",
    editSubtitle: "Atualize os dados cadastrais deste fornecedor.",
    /** Line under the CNPJ field, keyed by `SupplierDocState` (`../engine/supplierForm.ts`). */
    docMessages: {
      idle: "Digite o CNPJ — razão social e endereço vêm da Receita Federal.",
      typing: "A consulta dispara ao completar os 14 dígitos.",
      invalid: "CNPJ inválido — confira os dígitos.",
      loading: "Consultando a Receita Federal…",
      duplicate: "Este CNPJ já está cadastrado como fornecedor.",
      notfound: "CNPJ não encontrado na Receita — preencha manualmente.",
      error: "Consulta indisponível agora — preencha manualmente, sem bloqueio.",
      done: "Dados públicos da Receita Federal aplicados ao cadastro.",
    },
    /** Shown instead of `docMessages` when editing and the CNPJ hasn't changed. */
    savedDocumentHint: "CNPJ já cadastrado — altere os dígitos para consultar de novo na Receita.",
    documentLabel: "CNPJ",
    documentPlaceholder: "00.000.000/0000-00",
    nameLabel: "Razão social",
    namePlaceholder: "Razão social do fornecedor",
    tradeNameLabel: "Nome fantasia",
    tradeNamePlaceholder: "Como o fornecedor é conhecido",
    categoryLabel: "Categoria",
    paymentTermsLabel: "Condição de pagamento",
    paymentTermsPlaceholder: "Selecione…",
    leadTimeLabel: "Prazo de entrega (dias)",
    preferredPaymentMethodLabel: "Forma preferida",
    preferredPaymentMethodPlaceholder: "Selecione…",
    contactNameLabel: "Contato",
    contactNamePlaceholder: "Nome do contato",
    contactPhoneLabel: "Telefone",
    suppliedItemsLabel: "O que fornece",
    suppliedItemsPlaceholder: "Separe por vírgula — ex.: filtros, correias, óleo",
    readyHintCreate: "Entra na lista como fornecedor novo, sem histórico.",
    readyHintEdit: "As alterações atualizam o cadastro existente.",
    incompleteHint: "Informe o CNPJ ou a razão social.",
    cancel: "Cancelar",
    submit: "Salvar fornecedor",
    submitting: "Salvando…",
    paymentMethods: {
      boleto: "Boleto",
      pix: "Pix",
      transferencia: "Transferência",
      debito_automatico: "Débito automático",
    },
    paymentTermsOptions: [
      "à vista",
      "14 dias",
      "28 dias",
      "30 dias",
      "45 dias",
      "30/60",
      "30/60/90",
    ] as const,
  },
} as const;
