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
  },
  tabs: {
    active: "Ativas",
    history: "Histórico",
    audit: "Auditoria",
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
