/**
 * Strings exibidas no módulo de leads (PRD-017).
 * Mantenha tom direto, em português do Brasil, sem perder acentuação.
 */
export const LEADS_STRINGS = {
  page: {
    title: "Leads",
    activeCount: (n: number) => `${n.toLocaleString("pt-BR")} ${n === 1 ? "ativo" : "ativos"}`,
    addLead: "Novo lead",
    searchPlaceholder: "Buscar por nome ou telefone…",
    viewKanban: "Kanban",
    viewList: "Lista",
    backToList: "Voltar para o pipeline",
  },
  views: {
    kanban: "Kanban",
    list: "Lista",
  },
  filters: {
    title: "Filtros",
    clear: "Limpar filtros",
    // A pílula passa a mostrar o valor aplicado, então o "limpar" ao lado dela
    // já sabe sobre quantos filtros age — e some quando não há nenhum.
    clearCount: (n: number) => `limpar ${n}`,
    remove: (label: string) => `Remover o filtro ${label}`,
    more: (n: number) => `+${n}`,
    stage: "Estágio",
    temperature: "Temperatura",
    origin: "Origem",
    seller: "Vendedor",
    nextAction: "Próxima ação",
    period: "Criado em",
    valueRange: "Valor estimado",
    store: "Loja",
    nextActionOptions: {
      any: "Qualquer",
      overdue: "Atrasadas",
      today: "Hoje",
      thisWeek: "Esta semana",
      future: "Futuras",
    },
    periodOptions: {
      any: "Qualquer",
      "24h": "Últimas 24 h",
      "7d": "Últimos 7 dias",
      "30d": "Últimos 30 dias",
    },
    showLost: "Incluir perdidos",
    showConverted: "Incluir convertidos",
    descriptions: {
      stage: "Filtrar pelos estágios do pipeline",
      temperature: "Filtrar pela temperatura do lead (frio, morno, quente)",
      origin: "Filtrar pela origem do lead (WhatsApp, e-commerce, indicação, Google, outro)",
      seller: "Filtrar pelos leads de um ou mais vendedores",
      nextAction: "Filtrar pelo prazo da próxima ação agendada",
      period: "Filtrar pela data de criação do lead",
      valueRange: "Filtrar pela faixa de valor estimado do lead",
      store: "Filtrar pela loja de origem do lead",
      showLost: "Incluir leads marcados como perdidos",
      showConverted: "Incluir leads já convertidos em clientes",
    },
  },
  temperature: {
    frio: "Frio",
    morno: "Morno",
    quente: "Quente",
  },
  origin: {
    whatsapp: "WhatsApp",
    ecommerce: "E-commerce",
    indicacao: "Indicação",
    google: "Google",
    outro: "Outro",
    import: "Importado",
  },
  card: {
    estimatedValue: "Valor estimado",
    nextAction: {
      overdue: (days: number) => `Atrasada há ${days} ${days === 1 ? "dia" : "dias"}`,
      today: "Hoje",
      tomorrow: "Amanhã",
      future: (days: number) => `Em ${days} ${days === 1 ? "dia" : "dias"}`,
      none: "Sem próxima ação",
    },
    noValue: "Valor não informado",
    // O card do quadro usa as formas curtas: "Atrasada há 58 dias" quebrava em
    // duas linhas e dobrava a altura — em quase todos, porque quase todos estão
    // atrasados. O texto longo continua vivo na lista e no hover.
    noValueShort: "—",
    overdueShort: (days: number) => `${days}d`,
    overdueTitle: (days: number) =>
      `Próxima ação atrasada há ${days} ${days === 1 ? "dia" : "dias"}`,
    daysHere: (days: number) => `${days}d aqui`,
    daysHereTitle: (days: number) => `${days} ${days === 1 ? "dia" : "dias"} nesta etapa`,
    daysInStage: (n: number) => `${n} ${n === 1 ? "dia" : "dias"} no estágio`,
    converted: "Convertido",
    lost: "Perdido",
    ariaLabel: (name: string, stage: string, temperature: string) =>
      `Lead ${name}, etapa ${stage}, temperatura ${temperature}`,
  },
  /**
   * Faixa de leitura do funil: a forma do pipeline numa barra, e a frase que o
   * quadro não diz. Convertido e Perdido saem das colunas e viram placar — são
   * desfechos, não etapas de trabalho.
   */
  readout: {
    activeLeads: (n: number) => `${n.toLocaleString("pt-BR")}`,
    activeLabel: (n: number) => (n === 1 ? "lead ativo" : "leads ativos"),
    stuckAtEntry: (pct: number) => `${pct}% nunca saiu da entrada`,
    inWork: (n: number) => `${n.toLocaleString("pt-BR")}`,
    inWorkLabel: "em trabalho",
    overdue: (n: number) => `${n.toLocaleString("pt-BR")} ${n === 1 ? "atrasado" : "atrasados"}`,
    overdueHint: "Filtrar só os leads com próxima ação atrasada",
    segmentTitle: (stage: string, sum: string) => `${stage} — ${sum}`,
    segmentAria: (stage: string, count: number) =>
      `Filtrar pela etapa ${stage}, ${count} ${count === 1 ? "lead" : "leads"}`,
    outcomeAria: (stage: string) => `Ver os leads da etapa ${stage}`,
    neverWon: "nenhum, desde sempre",
    archived: "arquivo — fora do quadro",
    emptyStages: "Este funil ainda não tem etapas de trabalho.",
  },
  kanban: {
    columnCount: (n: number) => `${n} ${n === 1 ? "lead" : "leads"}`,
    /** Separadores dentro da coluna: o vermelho ordena em vez de alarmar. */
    overdueGroup: (n: number) => `${n} ${n === 1 ? "atrasado" : "atrasados"}`,
    onTimeGroup: "Em dia",
    averageDays: (days: number) =>
      `Média ${days.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} ${days === 1 ? "dia" : "dias"}`,
    emptyColumn: "Sem leads",
    quickMove: "Mover para…",
    columnSum: "Soma dos valores desta etapa",
    overdue: (n: number) => `${n} ${n === 1 ? "atrasado" : "atrasados"}`,
    overdueHint: "Filtrar só os atrasados",
    averageDaysTooltip: (days: number) =>
      `Média de ${days.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} ${days === 1 ? "dia" : "dias"} nesta etapa`,
    partialHint: "Contagem parcial — o total do servidor ainda está carregando.",
    sortLabel: "Ordenar por",
    sortModes: {
      oldest: "Mais antigos",
      newest: "Mais recentes",
      nextAction: "Próxima ação",
      highestValue: "Maior valor",
      stalest: "Parados há mais tempo",
    },
    collapse: "Recolher coluna",
    expand: "Expandir coluna",
    columnMenu: (stage: string) => `Ações da etapa ${stage}`,
    loadMore: (n: number) => `Carregar mais ${n}`,
    showingOf: (shown: number, total: number) => `${shown} de ${total}`,
    hover: {
      phone: "Telefone",
      origin: "Origem",
      tags: "Tags",
      daysInStage: "Nesta etapa",
      createdAt: "Criado em",
      funnels: "Funis",
      daysValue: (n: number) => `${n} ${n === 1 ? "dia" : "dias"}`,
      noTags: "Sem tags",
    },
    triage: {
      title: "Virou depósito",
      body: (n: number) =>
        `${n.toLocaleString("pt-BR")} leads parados na entrada. Triar em lista é mais rápido que arrastar um a um.`,
      oldest: (days: number) =>
        days === 0
          ? "O mais antigo chegou hoje."
          : `O mais antigo está aqui há ${days} ${days === 1 ? "dia" : "dias"}.`,
      toList: "Triar em lista",
      distribute: "Distribuir",
      distributeSoon: "A distribuição em lote usa a fila de rodízio e ainda não está pronta.",
      dropHint: "Solte para devolver à triagem",
      // A faixa larga que substitui a coluna de entrada: ninguém arrasta mil e
      // quinhentos cards, e o painel de 288px não cabia a idade nem a saída.
      bandTitle: (stage: string, n: number) =>
        `${stage} · ${n.toLocaleString("pt-BR")} ${n === 1 ? "lead parado" : "leads parados"}`,
      bandOldest: (days: number) =>
        days === 0
          ? "O mais antigo chegou hoje."
          : `O mais antigo está aqui há ${days} ${days === 1 ? "dia" : "dias"}.`,
      bandBody: "Triar em lista decide um a um e vai muito mais rápido que arrastar.",
      bandDropHint: "Solte para devolver este lead à triagem",
    },
    dnd: {
      grabbed: (lead: string) => `Pegou o lead ${lead}. Use as setas para mover e espaço para soltar.`,
      over: (stage: string) => `Sobre a etapa ${stage}.`,
      dropped: (lead: string, stage: string) => `${lead} movido para ${stage}.`,
      outside: "Solto fora de qualquer etapa — nada mudou.",
      cancelled: "Movimento cancelado.",
    },
    metrics: {
      conversion: "Taxa de conversão",
      avgCycle: "Tempo médio total",
      avgValue: "Valor médio convertido",
      trigger: "Métricas",
      scopeNote: "Calculado sobre todos os leads da loja, inclusive convertidos e perdidos.",
      periodNote: "Conversão considera os últimos 30 dias.",
    },
  },
  list: {
    /**
     * "Triar em lista é mais rápido que arrastar um a um" era a promessa — e a
     * lista que abria era uma tabela somente-leitura. O modo triagem põe as
     * ações de decisão na própria linha.
     */
    triage: {
      toggle: "Modo triagem",
      on: "Modo triagem: decida linha a linha",
      off: "Modo triagem desligado",
      summary: (n: number) => `${n.toLocaleString("pt-BR")} ${n === 1 ? "lead" : "leads"}`,
      sortedByOverdue: "ordenados por atraso",
      actions: {
        assign: "Atribuir vendedor",
        move: "Mover de etapa",
        conversation: "Abrir conversa",
        noConversation: "Este lead ainda não tem conversa",
        discard: "Marcar como perdido",
      },
    },
    columns: {
      selectVisible: "Selecionar os leads visíveis",
      name: "Nome",
      lead: "Lead",
      funnelStage: "Etapa",
      inStage: "Parado (d)",
      actions: "Ações",
      phone: "Telefone",
      stage: "Estágio",
      temperature: "Temperatura",
      origin: "Origem",
      estimatedValue: "Valor estimado",
      seller: "Vendedor",
      nextAction: "Próxima ação",
      daysInStage: "Dias no estágio",
      createdAt: "Criado em",
    },
    bulk: {
      selected: (n: number) => (n === 1 ? "1 lead selecionado" : `${n} leads selecionados`),
      clear: "Limpar seleção",
      addToFunnel: "Adicionar ao funil…",
      assignSeller: "Atribuir vendedor",
      markLost: "Marcar perdido",
      running: (done: number, total: number) => `${done} de ${total}…`,
      // No Geral a ação canônica é adicionar, não mover: o lead entra noutro
      // funil e CONTINUA na triagem até alguém tirá-lo de lá.
      defaultFunnelNote:
        "Adicionar põe o lead noutro funil; ele continua na triagem até ser tirado de lá.",
      addTitle: "Adicionar ao funil",
      addConfirm: "Adicionar",
      addedAll: (n: number, funil: string) =>
        `${n} ${n === 1 ? "lead adicionado" : "leads adicionados"} ao funil ${funil}.`,
      assignTitle: "Atribuir vendedor",
      assignConfirm: "Atribuir",
      assignedAll: (n: number, vendedor: string) =>
        `${n} ${n === 1 ? "lead atribuído" : "leads atribuídos"} a ${vendedor}.`,
      lostTitle: "Marcar como perdido",
      lostConfirm: "Marcar perdido",
      lostBody: "Escolha o motivo. Vale para todos os leads selecionados.",
      lostAll: (n: number) => `${n} ${n === 1 ? "lead marcado" : "leads marcados"} como perdido.`,
      reason: "Motivo",
      partial: (ok: number, fail: number) =>
        `${ok} ${ok === 1 ? "concluído" : "concluídos"}, ${fail} ${fail === 1 ? "falhou" : "falharam"}.`,
      allFailed: "Nenhum lead pôde ser alterado.",
      cancel: "Cancelar",
    },
    emptyTitle: "Nenhum lead encontrado",
    emptyDescription: "Ajuste os filtros ou crie um novo lead.",
    emptySearchTitle: (q: string) => `Nenhum lead para "${q}"`,
    errorTitle: "Não foi possível carregar os leads",
    retry: "Tentar novamente",
  },
  detail: {
    notFound: "Lead não encontrado",
    description: "O lead solicitado não existe ou foi removido.",
    data: "Dados do lead",
    createdAt: "Criado em",
    seller: "Vendedor responsável",
    convertedTo: "Convertido em cliente",
    viewCustomer: "Abrir ficha do cliente",
    lossReason: "Motivo da perda",
    lossNotes: "Observações da perda",

    /** O telefone deixa de ser texto e vira o botão que sempre foi. */
    phone: {
      copy: "Copiar número",
      copied: "Número copiado.",
      copyError: "Não foi possível copiar o número.",
      whatsapp: "Abrir no WhatsApp",
      call: "Ligar",
    },

    /** Estado editável no header — é o que muda com mais frequência. */
    state: {
      temperature: "Temperatura",
      seller: "Responsável",
      sellerQueue: "Sem responsável",
      sellerQueueHint: "fila",
      createdRelative: (rel: string) => `Criado ${rel}`,
      temperatureSaved: (label: string) => `Temperatura: ${label}.`,
      sellerSaved: (name: string) => `Responsável: ${name}.`,
      saveError: "Não foi possível salvar a alteração.",
    },

    /**
     * Bloco "Agora": no lugar da linha muda "Próxima ação · Sem próxima ação",
     * diz por que o lead está parado e oferece as saídas em um clique.
     */
    now: {
      title: "Nenhuma próxima ação marcada",
      waitingReply: (rel: string) =>
        `O contato escreveu ${rel} e ninguém respondeu. Escolha o que vem agora.`,
      waitingNoConversation: (rel: string) =>
        `O lead entrou ${rel} e ninguém marcou o próximo passo. Escolha o que vem agora.`,
      mark: "Marcar ação",
      cancel: "cancelar",
      done: "Concluir",
      remove: "Remover",
      markedBy: (who: string, when: string) => `Marcada por ${who} · ${when}`,
      markedUnknown: (when: string) => `Marcada para ${when}`,
      kinds: {
        ligar: "Ligar agora",
        orcamento: "Enviar orçamento",
        retomar: "Retomar contato",
        visita: "Agendar visita",
      },
      when: {
        today: "hoje",
        tomorrow: "amanhã",
        thisWeek: "esta semana",
      },
      saved: (label: string, when: string) => `Próxima ação: ${label} — ${when}.`,
      completed: "Ação concluída — marque a próxima.",
      removed: "Próxima ação removida.",
      saveError: "Não foi possível salvar a próxima ação.",
    },

    /**
     * Um lead está em VÁRIOS funis, cada um com etapa, valor e desfecho
     * próprios (`lead_funnel_entries`). A tela mostrava um estágio só.
     */
    funnels: {
      title: "Funis",
      add: "Funil",
      addTitle: "Adicionar a outro funil",
      remove: "Remover do funil",
      daysInStage: (n: number) => `${n} ${n === 1 ? "dia" : "dias"} na etapa`,
      addValue: "valor",
      valueLabel: (funnel: string) => `Valor estimado em ${funnel}`,
      valueSaved: (funnel: string, value: string) => `${funnel}: ${value}.`,
      valueCleared: (funnel: string) => `${funnel}: valor removido.`,
      valueError: "Não foi possível salvar o valor.",
      invalidValue: "Valor inválido.",
      currentStage: "Etapa atual",
      moveTo: (stage: string) => `Mover para ${stage}`,
      triageBadge: "Triagem",
      note: "Cada funil é uma oportunidade separada: etapa, valor e desfecho contam sozinhos no forecast.",
      empty: "Este lead não está em nenhum funil.",
    },

    /** As três abas rasas contavam a mesma história em pedaços. */
    timeline: {
      title: "Linha do tempo",
      filters: {
        all: "Tudo",
        conversation: "Conversas",
        note: "Notas",
        history: "Histórico",
      },
      composerPlaceholder: "Escrever uma nota interna…",
      composerAction: "Nota",
      /** Título de um item de nota no fio (singular do filtro "Notas"). */
      noteTitle: "Nota",
      noteSaved: "Nota registrada.",
      empty: "Nada registrado neste filtro.",
      by: (who: string) => `por ${who}`,
      conversationTitle: (n: number) =>
        `${n} ${n === 1 ? "mensagem" : "mensagens"} no WhatsApp`,
      leadCreated: "Lead criado",
      leadCreatedSub: (origin: string) => `Origem ${origin}`,
    },

    conversation: {
      title: "Conversa",
      open: "Abrir no Atendimento",
      empty: "Sem conversa vinculada a este lead.",
      loading: "Carregando a conversa…",
      more: (n: number) => `+${n} ${n === 1 ? "mensagem anterior" : "mensagens anteriores"}`,
      /** O envio vive no Atendimento — aqui a conversa é leitura. */
      replyHint: "Responder pelo Atendimento",
      system: "mensagem do sistema",
      media: "anexo",
    },

    tabs: {
      conversations: "Conversas",
      notes: "Notas",
      history: "Histórico",
    },
    emptyConversations: "Sem conversas vinculadas ao lead.",
    emptyNotes: "Sem notas registradas para este lead.",
    emptyHistory: "Sem eventos registrados.",
    notesComposerPlaceholder: "Escreva uma nota…",
    addNote: "Adicionar",
    noteSaveError: "Não foi possível salvar a nota.",
    actions: {
      edit: "Editar",
      markConverted: "Marcar como convertido",
      markLost: "Marcar como perdido",
      createQuote: "Criar orçamento",
    },
    fields: {
      estimatedValue: "Valor estimado",
      nextAction: "Próxima ação",
      temperature: "Temperatura",
      origin: "Origem",
      email: "E-mail",
      phone: "Telefone",
      tags: "Tags",
    },
    groups: { commercial: "Comercial", contact: "Contato", management: "Gestão" },
    /**
     * Edição no lugar, campo a campo. Campo vazio deixa de ser um travessão e
     * vira convite — some o modo "Editar" global com barra de salvar.
     */
    inline: {
      hint: "clique para editar",
      edit: (field: string) => `Editar ${field}`,
      addEmail: "adicionar e-mail",
      leadAge: "Idade do lead",
      leadAgeValue: (days: number) =>
        days === 0 ? "hoje" : `${days} ${days === 1 ? "dia" : "dias"}`,
      since: (date: string) => `· desde ${date}`,
      saved: (field: string) => `${field} salvo.`,
      cleared: (field: string) => `${field} removido.`,
      saveError: "Não foi possível salvar a alteração.",
    },
    inStageFor: "No estágio há",
    noTags: "Sem tags",
    addTag: "Adicionar tag",
    addTagAria: "Adicionar tag do catálogo ao lead",
    searchTagPlaceholder: "Buscar tag…",
    noCatalogTags: "Nenhuma tag no catálogo.",
    editAction: "Salvar alterações",
    cancel: "Cancelar",
    saving: "Salvando…",
  },
  newModal: {
    title: "Novo lead",
    description: "Registre um lead manualmente para iniciar o trabalho no pipeline.",
    name: "Nome",
    namePlaceholder: "Nome do contato",
    phone: "Telefone",
    phonePlaceholder: "(00) 00000-0000",
    email: "E-mail",
    emailPlaceholder: "opcional",
    origin: "Origem",
    estimatedValue: "Valor estimado (R$)",
    seller: "Vendedor responsável",
    stage: "Estágio inicial",
    temperature: "Temperatura",
    nextAction: "Próxima ação",
    cancel: "Cancelar",
    save: "Criar lead",
    saving: "Criando…",
    requiredName: "Informe o nome do contato.",
    requiredPhone: "Informe um telefone válido.",
    requiredOrigin: "Selecione uma origem.",
    invalidPhone: "Telefone deve conter de 10 a 11 dígitos.",
    invalidEmail: "Informe um e-mail válido.",
    createdToast: "Lead criado.",
    createError: "Não foi possível criar o lead.",
    linkError: "Lead criado, mas não foi possível vinculá-lo à conversa.",
  },
  convertModal: {
    /**
     * Um lead em dois funis são duas oportunidades. A conversão grava
     * `converted_to_customer_id` e o estágio legado — `convert_lead_mark` não
     * mexe em `lead_funnel_entries` —, então as participações continuam onde
     * estavam. Dizer isso na hora da decisão é mais honesto que deixar
     * descobrir no quadro uma semana depois.
     */
    opportunities: {
      body: (n: number) =>
        n === 1
          ? "Este lead tem 1 oportunidade aberta em funil:"
          : `Este lead tem ${n} oportunidades abertas em funis:`,
      hint: "Elas continuam abertas depois da conversão — feche ou remova cada uma para não inflar o forecast.",
      noValue: "sem valor",
      total: (value: string) => `Total em aberto: ${value}`,
    },
    title: "Converter lead em cliente",
    description: "Confirme os dados para criar a ficha do cliente.",
    descriptionLink: "Selecione o cliente já cadastrado para vincular a este lead.",
    modeLabel: "Tipo de conversão",
    modeNew: "Criar novo cliente",
    modeLink: "Vincular a cliente existente",
    typeLabel: "Tipo de cliente",
    typeB2B: "Empresa (B2B)",
    typeB2C: "Pessoa (B2C)",
    razaoSocial: "Razão social",
    razaoSocialPlaceholder: "Razão social registrada",
    nomeFantasia: "Nome fantasia",
    nomeFantasiaPlaceholder: "Nome fantasia",
    cnpj: "CNPJ",
    cnpjPlaceholder: "00.000.000/0000-00",
    cnpjChecking: "Consultando Receita…",
    cnpjLookupError: "Não foi possível validar o CNPJ na Receita agora.",
    cnpjRetry: "Tentar novamente",
    cnpjNotFound: "CNPJ não encontrado na Receita.",
    cnpjSituacaoWarning: (situacao: string) =>
      `CNPJ com situação ${situacao} na Receita Federal.`,
    contactName: "Contato principal",
    fullName: "Nome completo",
    cpf: "CPF",
    cpfPlaceholder: "000.000.000-00",
    email: "E-mail",
    phone: "Telefone",
    duplicateChecking: "Verificando se já existe cliente…",
    duplicateTitleCnpj: "Este CNPJ já está cadastrado",
    duplicateTitleCpf: "Este CPF já está cadastrado",
    duplicateOwner: (name: string) => `Carteira de ${name}`,
    duplicateOwnerQueue: "Sem vendedor responsável",
    duplicateHint: "Vincule o lead ao cliente existente em vez de criar uma ficha duplicada.",
    duplicateLinkCta: "Vincular a este cliente",
    searchLabel: "Cliente existente",
    searchPlaceholder: "Buscar por nome, CNPJ/CPF ou telefone…",
    searchHint: "Digite ao menos 2 caracteres para buscar.",
    searchNoResults: "Nenhum cliente encontrado.",
    changeCustomer: "Trocar",
    cancel: "Cancelar",
    submit: "Converter",
    submitting: "Convertendo…",
    continueLabel: "Continuar",
    back: "Voltar",
    stepCnpjLabel: "1 · CNPJ",
    stepContactLabel: "2 · Contato",
    requiredFullName: "Informe o nome completo.",
    requiredCpf: "Informe um CPF válido (11 dígitos).",
    requiredRazao: "Informe a razão social.",
    requiredFantasia: "Informe o nome fantasia.",
    requiredCnpj: "Informe um CNPJ válido (14 dígitos).",
    requiredContact: "Informe o contato principal.",
    successToast: "Lead convertido em cliente.",
    successToastLinked: "Lead vinculado ao cliente existente.",
    errorToast: "Não foi possível converter o lead.",
  },
  lostModal: {
    title: "Marcar lead como perdido",
    description: "Informe o motivo para preservar a memória da perda.",
    reason: "Motivo da perda",
    reasonPlaceholder: "Selecione um motivo",
    notes: "Observações (opcional)",
    notesPlaceholder: "Detalhes adicionais sobre a perda",
    cancel: "Cancelar",
    submit: "Marcar como perdido",
    submitting: "Salvando…",
    requiredReason: "Selecione um motivo.",
    successToast: "Lead registrado como perdido.",
    errorToast: "Não foi possível marcar o lead.",
  },
  closeModal: {
    title: "Convertido ou perdido?",
    description: "Escolha o destino final deste lead.",
    converted: "Foi convertido",
    lost: "Foi perdido",
    cancel: "Cancelar",
  },
  toasts: {
    moved: (stageName: string) => `Lead movido para "${stageName}".`,
    moveError: "Não foi possível mover o lead.",
    updated: "Lead atualizado.",
    updateError: "Não foi possível salvar as alterações.",
  },
  inbox: {
    badge: "Lead",
    badgeTooltip: (stageName: string) => `Lead no estágio "${stageName}"`,
  },
  fiche: {
    title: "Ficha do lead",
    // Read by screen readers only (sr-only header) — Radix requires every
    // Dialog/Sheet content to be described, or it warns in the console.
    sheetDescription: "Dados do lead, funis, dono responsável e ações de conversão.",
    sectionData: "Dados do lead",
    owner: "Dono do lead",
    ownerQueue: "Em fila",
    tags: "Tags",
    createdAt: "Criado em",
    estimatedValue: "Valor estimado",
    nextAction: "Próxima ação",
    email: "E-mail",
    invalidValue: "Valor inválido.",
    invalidEmail: "E-mail inválido.",
    stateConverted: "Convertido",
    stateLost: "Perdido",
    viewLead: "Ver lead",
    convert: "Converter em cliente",
    degradedNotice:
      "Não foi possível carregar os dados completos do lead. Exibindo as informações do contato.",
  },
} as const;
