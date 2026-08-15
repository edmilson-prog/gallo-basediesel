/**
 * Strings exibidas no módulo de Gestão de Carteira (PRD-018).
 * Tom direto, português do Brasil com acentuação correta.
 */
export const CARTEIRA_STRINGS = {
  page: {
    title: "Gestão de carteira",
    subtitle:
      "Transferências entre vendedores — cobertura temporária, individual ou em lote, sempre auditadas.",
    newTransfer: "Nova transferência",
    newTemporary: "Temporária (cobertura)",
    newPermanentIndividual: "Permanente individual",
    newPermanentBatch: "Permanente em lote",
    activeSummary: (active: number, temporary: number) =>
      `${active} ativa${active === 1 ? "" : "s"} · ${temporary} temporária${temporary === 1 ? "" : "s"} em vigência`,
    /** Header summary — the wallet answers "how are we doing" before anything else. */
    newCoverage: "Nova cobertura",
    transferCustomers: "Transferir clientes",
    transferCustomersHint:
      "Transferência permanente acontece na lista de clientes, com o cliente à vista.",
    walletSummary: (customers: number, sellers: number) =>
      `${customers.toLocaleString("pt-BR")} cliente${customers === 1 ? "" : "s"} entre ${sellers} vendedor${sellers === 1 ? "" : "es"}`,
    coverageSummary: (coverages: number, customers: number) =>
      `${coverages} cobertura${coverages === 1 ? "" : "s"} em vigor sobre ${customers} cliente${customers === 1 ? "" : "s"}`,
    noCoverage: "nenhuma cobertura em vigor",
    unassignedSummary: (n: number) => `${n} sem responsável`,
  },
  tabs: {
    wallet: "Carteira",
    active: "Ativas",
    history: "Histórico",
    audit: "Auditoria",
  },
  wallet: {
    boardTitle: "A carteira hoje",
    boardCount: (sellers: number, customers: number) =>
      `${sellers} vendedor${sellers === 1 ? "" : "es"} · ${customers.toLocaleString("pt-BR")} cliente${customers === 1 ? "" : "s"}`,
    columns: {
      seller: "Vendedor",
      wallet: "Carteira",
      risk: "Risco",
      situation: "Situação",
    },
    customersWithShare: (n: number, share: number) =>
      `cliente${n === 1 ? "" : "s"} · ${Math.round(share * 100)}%`,
    /**
     * The risk column reads last PURCHASE, not last conversation: the customer
     * record carries `lastPurchaseAt` and nothing equivalent for contact, so the
     * label says what is actually being measured.
     */
    staleLabel: "sem compra 30d",
    staleTooltip: (n: number) =>
      `${n} cliente${n === 1 ? "" : "s"} sem compra registrada há mais de 30 dias`,
    ownWallet: "carteira própria",
    coveredBy: (seller: string, until: string) => `coberto por ${seller} até ${until}`,
    covering: "cobrindo",
    coveringFor: (n: number, seller: string) => `+${n} de ${seller}`,
    registerCoverage: "Registrar cobertura",
    viewCoverage: "Ver cobertura",
    sellerActions: (seller: string) => `Ações de ${seller}`,
    unassignedTitle: (n: number) => `${n} cliente${n === 1 ? "" : "s"} sem responsável`,
    unassignedDescription: "Fora de carteira: não entram em positivação, meta nem rodízio",
    distribute: "Distribuir",
    loadError: "Não foi possível carregar a composição da carteira.",
    emptySellers: "Nenhum vendedor ativo nesta loja.",
  },
  coverage: {
    sectionTitle: "Cobertura em vigor",
    sectionHint: "volta sozinha na data final",
    daysLeft: (n: number) => `faltam ${n} dia${n === 1 ? "" : "s"}`,
    endingToday: "termina hoje",
    viewCustomers: "Ver clientes",
    returnNow: "Devolver agora",
    autoRevert: "Devolução automática",
    registeredBy: "Registrado por",
    note: "Observação",
    emptyTitle: "Ninguém está afastado agora",
    emptyDescription:
      "Férias, licença ou treinamento: registre a cobertura e os clientes voltam sozinhos na data final.",
  },
  changes: {
    sectionTitle: "Mudanças recentes",
    sectionCount: (n: number) => `${n} nos últimos 30 dias`,
    sectionHint: "permanentes — não expiram sozinhas",
    seeFullHistory: "Ver histórico completo",
    emptyTitle: "Nenhuma mudança permanente em 30 dias",
    emptyDescription: "Transferências definitivas de carteira aparecem aqui assim que acontecerem.",
    columns: {
      type: "Tipo",
      route: "De → Para",
      customers: "Clientes",
      reason: "Motivo",
      executedBy: "Executado por",
      when: "Quando",
    },
    batch: "Em lote",
    individual: "Individual",
    revert: "Reverter",
    daysAgo: (n: number) => `${n}d`,
  },
  sellerModal: {
    walletCustomers: "clientes na carteira",
    positivados: "positivados no mês",
    stale: "sem compra há 30d",
    movementTitle: "Movimentação — 30 dias",
    received: "recebeu",
    handedOver: "passou",
    net: (n: number) => `${n >= 0 ? "+" : ""}${n} líquido`,
    viewCustomers: "Ver clientes",
    handWallet: "Passar carteira",
    awayNotice: (reason: string, until: string, covering: string) =>
      `Em ${reason.toLowerCase()} até ${until}. A carteira está com ${covering} e volta sozinha na data final.`,
  },
  unassignedModal: {
    title: "Distribuir clientes sem responsável",
    subtitle: (n: number) => `${n} cliente${n === 1 ? "" : "s"} fora de carteira`,
    pickSeller: "Escolher o vendedor que assume",
    pickSellerPlaceholder: "Selecionar…",
    /**
     * Only the single-owner mode is offered. Round-robin by city proximity and
     * one-by-one triage were part of the design but have no engine behind them
     * yet, and a button that silently does something else would be worse than
     * one that is not there.
     */
    explanation: (n: number, seller: string) =>
      `Os ${n} cliente${n === 1 ? "" : "s"} passam a ser responsabilidade de ${seller} e voltam a contar em positivação, meta e rodízio.`,
    preview: "Clientes que serão distribuídos",
    previewMore: (shown: number, total: number) => `mostrando ${shown} de ${total}`,
    submit: "Distribuir",
    submitting: "Distribuindo…",
    empty: "Nenhum cliente sem responsável nesta loja.",
    successToast: (n: number, seller: string) =>
      `${n} cliente${n === 1 ? "" : "s"} agora ${n === 1 ? "é" : "são"} de ${seller}.`,
    partialToast: (ok: number, failed: number) =>
      `${ok} cliente${ok === 1 ? "" : "s"} distribuído${ok === 1 ? "" : "s"}; ${failed} falhou${failed === 1 ? "" : "ram"}.`,
    failureToast: "Não foi possível distribuir os clientes.",
  },
  type: {
    temporary: "Temporária",
    permanent_individual: "Permanente individual",
    permanent_batch: "Permanente em lote",
  },
  status: {
    active: "Ativa",
    reverted: "Revertida",
    expired: "Expirada",
  },
  active: {
    emptyTitle: "Nenhuma transferência ativa",
    emptyDescription:
      "Quando alguém precisar de cobertura ou de uma migração de carteira, você verá aqui.",
    viewCustomers: (n: number) => `${n} cliente${n === 1 ? "" : "s"}`,
    revertNow: "Reverter agora",
    details: "Detalhes",
    timeLeft: (label: string) => `Reversão automática ${label}`,
    expiresIn: "Reversão automática",
    period: "Período",
    reason: "Motivo",
    executedBy: "Executado por",
    executedAt: "Executado em",
  },
  history: {
    emptyTitle: "Sem histórico ainda",
    emptyDescription: "Transferências passadas vão aparecer aqui assim que forem encerradas.",
    columns: {
      type: "Tipo",
      route: "De → Para",
      customers: "Clientes",
      period: "Período",
      status: "Status",
      executedBy: "Executado por",
      executedAt: "Encerrado em",
    },
  },
  filters: {
    type: "Tipo",
    from: "Vendedor origem",
    to: "Vendedor destino",
    status: "Status",
    period: "Período",
    allTypes: "Todos os tipos",
    allSellers: "Todos",
    clear: "Limpar filtros",
  },
  modals: {
    /**
     * Every transfer is stamped with the acting seller (`created_by` → sellers).
     * A staff account without a linked seller cannot sign one, so the form
     * blocks instead of failing at the database constraint.
     */
    missingSellerError:
      "Seu usuário não está vinculado a um vendedor, então não é possível registrar a transferência. Peça ao administrador para vincular seu cadastro.",
    /**
     * Imported contacts pending review carry no wallet owner, so there is no
     * origin seller to transfer from.
     */
    missingOwnerError:
      "Este cliente ainda não tem vendedor responsável, então não há carteira a transferir. Defina um responsável antes.",
    temporary: {
      title: "Nova transferência temporária",
      description:
        "Cobertura por período definido. Os clientes voltam automaticamente ao titular na data final.",
      from: "Vendedor origem (titular)",
      to: "Vendedor cobertura (destino)",
      sameSellerError: "Vendedor destino deve ser diferente do origem.",
      crossStoreError: "Não é possível transferir entre lojas diferentes neste momento.",
      period: "Período de cobertura",
      startDate: "Início",
      endDate: "Fim",
      reason: "Motivo",
      reasonPlaceholder: "Selecione…",
      reasons: {
        ferias: "Férias",
        licenca: "Licença médica",
        treinamento: "Treinamento",
        outro: "Outro",
      },
      details: "Detalhes (opcional)",
      detailsPlaceholder: "Observações sobre a cobertura…",
      coverage: "Clientes incluídos",
      coverageAll: "Todos os clientes do titular",
      coverageSubset: "Selecionar específicos",
      coverageAllHint: (count: number) =>
        `${count} cliente${count === 1 ? "" : "s"} sob a carteira do titular.`,
      noCustomersError: "Selecione ao menos um cliente para a cobertura.",
      endBeforeStartError: "A data final deve ser posterior à data inicial.",
      conflictWarning: (titular: string, until: string) =>
        `Já existe cobertura ativa para ${titular} até ${until}. Tem certeza que deseja criar outra?`,
      previewTitle: "Resumo da transferência",
      preview: (n: number, from: string, to: string, start: string, end: string) =>
        `Transferindo ${n} cliente${n === 1 ? "" : "s"} de ${from} para ${to} entre ${start} e ${end}. Reversão automática prevista para ${end}.`,
      submit: "Criar cobertura",
      submitting: "Criando…",
      successToast: (count: number, to: string) =>
        `Cobertura criada: ${count} cliente${count === 1 ? "" : "s"} agora atendido${count === 1 ? "" : "s"} por ${to}.`,
      failureToast: "Não foi possível criar a transferência. Tente novamente.",
    },
    permanentIndividual: {
      title: "Transferir carteira do cliente",
      description: "Transferência permanente. Reversão precisa ser manual.",
      customer: "Cliente",
      from: "Vendedor atual",
      to: "Novo vendedor",
      reason: "Motivo",
      reasonPlaceholder: "Por que está transferindo este cliente?",
      sameSellerError: "Selecione um vendedor diferente do atual.",
      missingReasonError: "Informe o motivo da transferência.",
      confirm: (customer: string, to: string) =>
        `Confirma transferência permanente de ${customer} para ${to}? Esta ação requer reversão manual.`,
      submit: "Transferir cliente",
      submitting: "Transferindo…",
      successToast: (customer: string, to: string) =>
        `${customer} agora é responsabilidade de ${to}.`,
      failureToast: "Não foi possível transferir o cliente.",
    },
    permanentBatch: {
      title: "Transferir vendedor (em lote)",
      description: (n: number) =>
        `${n} cliente${n === 1 ? "" : "s"} selecionado${n === 1 ? "" : "s"} serão transferidos permanentemente.`,
      to: "Novo vendedor",
      reason: "Motivo",
      reasonPlaceholder: "Por que esta migração de carteira?",
      missingReasonError: "Informe o motivo da transferência em lote.",
      confirmTitle: "Esta ação é permanente",
      confirm: (n: number, to: string) =>
        `${n} cliente${n === 1 ? "" : "s"} serão transferido${n === 1 ? "" : "s"} para ${to}. Reversão é manual.`,
      expandList: "Ver lista de clientes",
      collapseList: "Recolher lista",
      submit: "Confirmar transferência em lote",
      submitting: "Transferindo…",
      successToast: (n: number, to: string) =>
        `${n} cliente${n === 1 ? "" : "s"} transferido${n === 1 ? "" : "s"} para ${to}.`,
      failureToast: "Não foi possível concluir a transferência em lote.",
    },
    revert: {
      title: "Reverter transferência",
      descriptionTemporary: (n: number, from: string) =>
        `Os ${n} cliente${n === 1 ? "" : "s"} voltarão imediatamente para ${from}.`,
      descriptionPermanent: (n: number, from: string) =>
        `Esta transferência era permanente. Tem certeza que quer desfazer? Os ${n} cliente${n === 1 ? "" : "s"} voltarão para ${from}.`,
      cancel: "Cancelar",
      confirm: "Reverter",
      submitting: "Revertendo…",
      successToast: (n: number, from: string) =>
        `Reversão concluída. ${n} cliente${n === 1 ? "" : "s"} voltaram para ${from}.`,
      failureToast: "Não foi possível reverter a transferência.",
    },
    customerList: {
      title: "Clientes afetados",
      description: (n: number) => `${n} cliente${n === 1 ? "" : "s"} nesta transferência.`,
      close: "Fechar",
      empty: "Sem clientes registrados nesta transferência.",
    },
  },
  banner: {
    coverage: (titular: string, until: string) =>
      `Este cliente está sob cobertura temporária. Volta para ${titular} em ${until}.`,
    coverageNoDate: (titular: string) =>
      `Este cliente está sob cobertura temporária — titular original: ${titular}.`,
  },
  notifications: {
    received: (n: number, reason?: string) =>
      `Você recebeu ${n} cliente${n === 1 ? "" : "s"}${reason ? ` — ${reason}` : ""}.`,
    lost: (n: number, reason?: string) =>
      `Você passou ${n} cliente${n === 1 ? "" : "s"} para outro vendedor${reason ? ` — ${reason}` : ""}.`,
    autoReverted: "Transferência temporária revertida automaticamente.",
  },
  reasonsTemporary: {
    Férias: "Férias",
    "Licença médica": "Licença médica",
    Treinamento: "Treinamento",
    Outro: "Outro",
  },
} as const;
