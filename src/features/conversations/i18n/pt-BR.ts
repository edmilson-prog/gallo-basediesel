/**
 * UI strings of the Inbox feature, grouped for future i18n.
 *
 * On the MVP we ship pt-BR only; adding a new locale means dropping a sibling
 * file and threading it through a `useInboxStrings()` selector. Keeping the
 * strings outside JSX leaves the components clean and lets them be reused
 * by tests / Storybook entries without parsing UI markup.
 */
export const INBOX_STRINGS = {
  pageTitle: "Conversas",

  // Header
  totalLabel: (n: number) => (n === 1 ? "1 conversa" : `${n} conversas`),
  unreadGlobal: (n: number) => `${n} não lida${n === 1 ? "" : "s"}`,
  realtimePaused: "Atualização pausada",
  realtimeActive: "Atualização em tempo real",
  realtimeConnecting: "Conectando ao tempo real…",
  realtimeToggleLabel: "Alternar atualização em tempo real",

  // Search
  searchPlaceholder: "Buscar nome, telefone ou mensagem…",
  searchLabel: "Buscar conversas",
  clearSearch: "Limpar busca",

  // Filters
  filtersTitle: "Filtros",
  clearAll: "Limpar tudo",
  activeFilters: (n: number) =>
    n === 0 ? "Sem filtros" : `${n} filtro${n === 1 ? "" : "s"} ativo${n === 1 ? "" : "s"}`,
  // Collapsible filter panel
  filtersToggle: "Filtros",
  filtersExpandAria: "Mostrar filtros",
  filtersCollapseAria: "Ocultar filtros",
  filtersActiveCountAria: (n: number) => (n === 1 ? "1 filtro ativo" : `${n} filtros ativos`),

  // Status filter
  statusLabel: "Status",
  statusOptions: {
    all: "Todas (exceto arquivadas)",
    aguardando: "Aguardando",
    em_andamento: "Em andamento",
    aguardando_cliente: "Aguardando cliente",
    resolvida: "Resolvidas",
    arquivada: "Arquivadas",
  },

  // Channel filter
  channelLabel: "Canal",
  channelOptions: {
    all: "Todos",
    whatsapp: "WhatsApp",
    ecommerce: "E-commerce",
    phone: "Telefone",
    site: "Site",
  },

  // Assignment filter
  assignmentLabel: "Atribuição",
  assignmentOptions: {
    me: "Atribuídas a mim",
    unassigned: "Sem atribuição",
    queue: "Em fila",
    all: "Todas",
    seller: "Por vendedor",
  },

  // Tags filter
  tagsLabel: "Tags",
  tagsEmpty: "Nenhuma tag disponível",
  tagsCounter: (n: number) => (n === 0 ? "Tags" : `Tags (${n})`),

  // Period filter
  periodLabel: "Período",
  periodOptions: {
    all: "Todos os períodos",
    "24h": "Últimas 24 horas",
    "7d": "Últimos 7 dias",
    "30d": "Últimos 30 dias",
  },

  // Sort
  sortLabel: "Ordenação",
  sortBy: "Ordenado por:",
  sortOptions: {
    lastMessage: "Mais recentes",
    waiting: "Tempo de espera",
    abc: "Prioridade ABC",
  },

  // Item
  unknownParticipant: "Lead anônimo",
  unreadBadge: (n: number) => (n > 9 ? "9+" : String(n)),
  sdrBadge: "SDR",
  sdrBadgeTooltip: "Esta conversa está sendo atendida pelo agente SDR",
  newBadge: "Novo!",
  mediaPreview: {
    image: "📎 Foto",
    audio: "🎵 Áudio",
    video: "🎬 Vídeo",
    document: "📄 Documento",
    sticker: "🌟 Sticker",
  },

  // Quick actions
  assignToMe: "Atribuir-me",
  transfer: "Transferir",
  archive: "Arquivar",
  unarchive: "Desarquivar",
  transferTo: "Transferir para",
  assignedToYou: "Conversa atribuída a você",
  transferredTo: (name: string) => `Conversa transferida para ${name}`,
  archived: "Conversa arquivada",
  undo: "Desfazer",
  undone: "Ação desfeita",
  actionFailed: "Não foi possível concluir a ação",

  // Empty states
  emptyDefault: {
    title: "Você ainda não tem conversas",
    description: "Quando algum cliente entrar em contato, ela aparecerá aqui.",
  },
  emptyFiltered: {
    title: "Nenhuma conversa corresponde aos filtros",
    description: "Ajuste os filtros ou limpe-os para ver toda a sua inbox.",
  },
  emptySearch: (term: string) => ({
    title: `Nada encontrado para "${term}"`,
    description: "Tente outro termo ou amplie os filtros.",
  }),

  // Error
  error: {
    title: "Não foi possível carregar conversas",
    description: "Verifique sua conexão e tente novamente.",
    retry: "Tentar novamente",
  },

  // Center placeholder (PRD-011 ainda pendente)
  selectAConversation: {
    title: "Selecione uma conversa",
    description: "Escolha um item na lista para ver mensagens, ficha e ações.",
  },

  // Accessibility
  ariaListItem: (params: { name: string; when: string; unread: number }) =>
    `Conversa com ${params.name}, última mensagem ${params.when}${
      params.unread > 0 ? `, ${params.unread} não lida${params.unread === 1 ? "" : "s"}` : ""
    }`,
  ariaList: "Lista de conversas",
  ariaLoadMore: "Carregando mais conversas",

  // Pagination
  loadingMore: "Carregando mais…",
  endOfList: "Você chegou ao fim da lista.",
} as const;

/**
 * UI strings of the Conversation viewer (PRD-011).
 *
 * Kept in the same module as INBOX_STRINGS for cohesion, but exported as its
 * own namespace so the conversation feature can import only what it needs.
 */
export const CONVERSATION_STRINGS = {
  // Header
  backToInbox: "Voltar à inbox",
  channelLabel: {
    whatsapp: "WhatsApp",
    ecommerce: "E-commerce",
    phone: "Telefone",
    site: "Site",
  } as const,
  statusLabel: {
    aguardando: "Aguardando",
    em_andamento: "Em andamento",
    aguardando_cliente: "Aguardando cliente",
    resolvida: "Resolvida",
    arquivada: "Arquivada",
  } as const,
  createQuote: "Criar orçamento",
  toggleFiche: "Ficha",
  toggleMedia: "Mídias",
  moreActions: "Mais ações",
  sdrActiveTag: "SDR ativo",
  sdrActiveTooltip: "Esta conversa está sendo atendida pelo agente SDR",
  loading: "Carregando conversa…",

  // Empty states
  notFound: {
    title: "Conversa não encontrada",
    description: "Esta conversa não existe ou foi removida.",
  },
  newConversation: {
    title: "Inicie a conversa",
    description: "Envie a primeira mensagem para abrir o atendimento.",
  },
  readOnlyAssign: "Esta conversa não está atribuída a você.",

  // Day separators
  today: "Hoje",
  yesterday: "Ontem",
  weekdays: [
    "domingo",
    "segunda-feira",
    "terça-feira",
    "quarta-feira",
    "quinta-feira",
    "sexta-feira",
    "sábado",
  ] as const,

  // Bubbles
  systemEvents: {
    sdrActivated: "🤖 Agente SDR foi ativado nesta conversa",
    sdrPaused: "🤖 Agente SDR foi pausado",
    transferred: (name: string) => `Conversa transferida para ${name}`,
    assumed: (name: string) => `${name} assumiu o atendimento`,
    resolved: "Conversa marcada como resolvida",
    reopened: "Conversa reaberta",
  },
  sdrBadge: "🤖 SDR",
  sdrBubbleTooltip: "Mensagem enviada pelo agente SDR",
  templateBadge: "Template",
  retry: "Tentar novamente",
  reprocess: "Reprocessar",
  download: "Baixar",
  audioTranscription: "Transcrição em breve",
  imageCaption: (caption: string) => caption || "Foto",
  documentMeta: (size: string) => size,

  // Status tooltips
  statusTooltip: {
    queued: "Enviando…",
    sent: (time: string) => `Enviada às ${time}`,
    delivered: (time: string) => `Entregue às ${time}`,
    read: (time: string) => `Lida às ${time}`,
    failed: "Falha no envio",
    failedWithReason: (reason: string) => `Falha no envio — ${reason}`,
  },

  // 24h window
  windowOpen: (h: number) => `Janela aberta — ${h}h restantes`,
  windowClosing: (m: number) => `Janela fechando — ${m} min restantes`,
  windowClosed: "Janela de 24h fechada — apenas templates HSM disponíveis",
  windowSuggestTemplate: "Considere usar um template HSM",
  windowOpenedByInbound: (when: string) => `Cliente respondeu há ${when}`,
  windowDisabledHint: "Use um template HSM para reabrir a conversa",
  windowSelectTemplate: "Selecionar template",

  // Message input
  inputPlaceholder: "Digite uma mensagem…",
  inputPlaceholderClosed: "Janela fechada — selecione um template",
  send: "Enviar",
  // Disabled-state reasons surfaced via tooltip on the Send/Schedule buttons (a11y).
  sendDisabledEmpty: "Digite uma mensagem",
  sendDisabledWindowClosed: "Janela 24h fechada — use um template",
  sendDisabledPendingFields: "Preencha os campos pendentes",
  attach: "Anexar",
  attachImage: "Imagem",
  attachDocument: "Documento",
  attachAudio: "Áudio (arquivo)",
  attachTooLarge: (maxMb: number) => `Arquivo acima de ${maxMb} MB — escolha um arquivo menor.`,
  attachUploadFailed: "Não foi possível enviar o anexo. Tente novamente.",
  emoji: "Inserir emoji",
  templatesButton: "Templates",
  templatesUnavailable: "Disponível no provider Meta",
  aiSuggestionsLabel: "Sugestões IA",

  // Typing indicator
  typing: "Cliente está digitando…",

  // Menu actions
  menu: {
    markResolved: "Marcar como resolvida",
    markUnread: "Marcar como não lida",
    transfer: "Transferir",
    escalate: "Escalar para gestor",
    archive: "Arquivar",
    unarchive: "Desarquivar",
    addNote: "Adicionar nota",
    pauseSdr: "Pausar SDR",
    resumeSdr: "Retomar SDR",
  },
  resolved: "Conversa marcada como resolvida",
  reopened: "Conversa reaberta",
  archived: "Conversa arquivada",
  unarchived: "Conversa desarquivada",
  markedUnread: "Conversa marcada como não lida",
  noteSaved: "Nota adicionada à ficha",
  noteAuthorMissing:
    "Sua conta não está vinculada a um vendedor — não é possível registrar a nota.",
  noteEmpty: "Escreva alguma coisa antes de salvar.",
  sdrPaused: "Agente SDR pausado",
  sdrResumed: "Agente SDR retomado",
  escalatedTo: (name: string) => `Conversa escalada para ${name}`,
  noManagerAvailable: "Nenhum gestor disponível para escalonamento.",
  undo: "Desfazer",
  undone: "Ação desfeita",
  actionFailed: "Não foi possível concluir a ação",

  // Library / quick-send menu sections (PRD-027 Plano B)
  attachSectionLibrary: "Biblioteca",
  attachSectionFile: "Arquivo avulso",
  openLibrary: "Abrir biblioteca",
  openLibraryShortcut: "⌘K",
  quickReply: "Resposta rápida",
  sendProduct: "Enviar produto",

  // Dialogs
  transferDialog: {
    title: "Transferir conversa",
    description: "Selecione o vendedor que receberá esta conversa.",
    placeholder: "Vendedor…",
    confirm: "Transferir",
    cancel: "Cancelar",
  },
  templateDialog: {
    title: "Enviar template HSM",
    description: "Templates pré-aprovados pelo Meta. Preencha as variáveis antes de enviar.",
    selectTemplate: "Escolher template",
    preview: "Pré-visualização",
    variablesTitle: "Variáveis",
    variablePlaceholder: (key: string) => `Valor para ${key}`,
    confirm: "Enviar template",
    cancel: "Cancelar",
    emptyVariables: "Preencha todas as variáveis para enviar.",
  },
  invalidNumberDialog: {
    title: "Número marcado como inválido",
    description:
      "Uma tentativa anterior indicou que este número não é WhatsApp. Deseja confirmar e enviar mesmo assim? A ação fica registrada na auditoria.",
    confirm: "Confirmar e enviar",
    cancel: "Cancelar",
  },
  invalidNumberBadge: "Número não é WhatsApp",
  invalidNumberBadgeTooltip:
    "Uma falha de entrega indicou que este número não está no WhatsApp. Envio exige confirmação de gestor.",
  markWhatsappValid: "Marcar como WhatsApp válido",
  markedWhatsappValid: "Número marcado como válido",
  noteDialog: {
    title: "Adicionar nota à ficha",
    description: "A nota fica visível para vendedores e gestores com acesso a este cliente.",
    placeholder: "Escreva sua nota…",
    confirm: "Salvar nota",
    cancel: "Cancelar",
  },
} as const;
