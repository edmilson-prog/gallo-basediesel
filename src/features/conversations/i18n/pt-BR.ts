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
