/**
 * UI strings of the Inbox feature, grouped for future i18n.
 *
 * On the MVP we ship pt-BR only; adding a new locale means dropping a sibling
 * file and threading it through a `useInboxStrings()` selector. Keeping the
 * strings outside JSX leaves the components clean and lets them be reused
 * by tests / Storybook entries without parsing UI markup.
 */
/**
 * Emoji prefixes for structured-share previews — single source so the named
 * variant (`📍 <name>`) and the generic fallback label (`📍 Localização`) can
 * never drift to different icons. Used by `getMessagePreview`.
 */
export const STRUCTURED_PREVIEW_ICON = { contact: "👤", location: "📍" } as const;

export const INBOX_STRINGS = {
  pageTitle: "Conversas",

  // Header
  totalLabel: (n: number) => (n === 1 ? "1 conversa" : `${n} conversas`),
  unreadGlobal: (n: number) => `${n} não lida${n === 1 ? "" : "s"}`,
  realtimePaused: "Atualização pausada",
  realtimeActive: "Atualização em tempo real",
  realtimeConnecting: "Conectando ao tempo real…",
  realtimeToggleLabel: "Alternar atualização em tempo real",

  // Search (contact identity only — see messageSearch below for message content)
  searchPlaceholder: "Buscar nome ou telefone…",
  searchLabel: "Buscar conversas",
  clearSearch: "Limpar busca",

  // Message content search (dedicated action — Opção D)
  messageSearch: {
    cta: (term: string) => `Buscar "${term}" nas mensagens →`,
    bannerTitle: (term: string) => `Resultados em mensagens de "${term}"`,
    bannerBack: "← Voltar aos contatos",
    provenanceLabel: (date: string) => `trecho de mensagem · ${date}`,
    extraMatches: (n: number) => `+${n} outra${n === 1 ? "" : "s"}`,
    outboundPrefix: "Você: ",
    emptyTitle: "Nenhuma mensagem encontrada",
    emptyDescription: (term: string) => `Nenhuma conversa tem "${term}" no texto das mensagens.`,
  },

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
    em_andamento: "Em atendimento",
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
    queue: "Em fila",
    all: "Todas",
    seller: "Por vendedor",
    selectedCount: (n: number) => `${n} selecionados`,
  },

  // Instance filter (multi-instância) — only shown when the store has 2+ numbers
  instanceLabel: "Instância",
  instanceAllOption: "Todas",

  // Tags filter
  tagsLabel: "Tags",
  tagsEmpty: "Nenhuma tag disponível",
  tagsCounter: (n: number) => (n === 0 ? "Tags" : `Tags (${n})`),
  tagsArchivedSuffix: "(arquivada)",

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
  collaboratingBadge: "Colaborando",
  newBadge: "Novo!",
  mediaPreview: {
    image: "📎 Foto",
    audio: "🎵 Áudio",
    video: "🎬 Vídeo",
    document: "📄 Documento",
    sticker: "🌟 Sticker",
    location: `${STRUCTURED_PREVIEW_ICON.location} Localização`,
    contact: `${STRUCTURED_PREVIEW_ICON.contact} Contato`,
  },

  // Quick actions
  assignToMe: "Atribuir-me",
  transfer: "Transferir",
  archive: "Arquivar",
  unarchive: "Desarquivar",
  transferTo: "Transferir para",
  assignedToYou: "Conversa atribuída a você",
  transferredTo: (name: string) => `Conversa transferida para ${name}`,
  returnToQueue: "Devolver para a fila",
  returnedToQueue: "Conversa devolvida à fila",
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
  ariaListItem: (params: { name: string; when: string; unread: number; status?: string }) =>
    `Conversa com ${params.name}, última mensagem ${params.when}${
      params.unread > 0 ? `, ${params.unread} não lida${params.unread === 1 ? "" : "s"}` : ""
    }${params.status ? `, status: ${params.status}` : ""}`,
  ariaList: "Lista de conversas",
  ariaLoadMore: "Carregando mais conversas",

  // Pagination
  loadingMore: "Carregando mais…",
  endOfList: "Você chegou ao fim da lista.",
  loadMoreError: "Não foi possível carregar mais conversas.",
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
  /** Label for the assigned-seller chip (list + header). */
  assignee: "Responsável",
  channelLabel: {
    whatsapp: "WhatsApp",
    ecommerce: "E-commerce",
    phone: "Telefone",
    site: "Site",
  } as const,
  statusLabel: {
    aguardando: "Aguardando",
    em_andamento: "Em atendimento",
    aguardando_cliente: "Aguardando cliente",
    resolvida: "Resolvida",
    arquivada: "Arquivada",
  } as const,
  statusAriaLabel: {
    aguardando: "Aguardando atendimento",
    em_andamento: "Em atendimento",
    aguardando_cliente: "Aguardando resposta do cliente",
    resolvida: "Resolvida",
    arquivada: "Arquivada",
  } as const,
  statusControl: {
    triggerLabel: "Alterar status da conversa",
    statusChanged: (label: string) => `Status alterado para "${label}"`,
    actionFailed: "Não foi possível alterar o status",
    autoAssignedToYou: "Conversa atribuída a você",
    autoReturnedToQueue: "Conversa devolvida à fila",
    closedAndRemoved: "Conversa encerrada e removida da lista.",
    modeSwitchLabel: "Modo de exibição do status",
    modes: {
      pill: "Pílula",
      menu: "Menu",
      segmented: "Segmentado",
    },
  },
  toggleFiche: "Ficha",
  toggleMedia: "Mídias",
  toggleHistory: "Histórico",
  moreActions: "Mais ações",
  sdrActiveTag: "SDR ativo",
  sdrActiveTooltip: "Esta conversa está sendo atendida pelo agente SDR",
  loading: "Carregando conversa…",

  // Empty states
  notFound: {
    title: "Conversa indisponível",
    description: "Esta conversa não existe mais, foi removida ou você não tem mais acesso a ela.",
  },
  newConversation: {
    title: "Inicie a conversa",
    description: "Envie a primeira mensagem para abrir o atendimento.",
  },
  readOnlyAssign: "Esta conversa não está atribuída a você.",
  assignGate: {
    title: "Conversa na fila, sem responsável",
    description: "Assuma a conversa para responder ao cliente.",
    assignCta: "Assumir e responder",
    note: "Nota interna",
    noSellerHint: "Peça a um gestor para atribuir esta conversa a você.",
  },
  instanceLocked: {
    titleDisconnected: "Número desconectado",
    titlePending: "Número conectando",
    descriptionDisconnected: (label: string) =>
      `${label} está desconectado — não é possível enviar nem receber por aqui.`,
    descriptionDisconnectedGeneric: "Este número está desconectado — não é possível enviar nem receber por aqui.",
    descriptionPending: (label: string) =>
      `${label} ainda está conectando — aguarde para responder por aqui.`,
    descriptionPendingGeneric: "Este número ainda está conectando — aguarde para responder por aqui.",
    manageCta: "Ver instância",
    manageHintNonOwner: "Peça a um dono para verificar a conexão.",
    listBadgeDisconnected: "Número desconectado",
    listBadgePending: "Número conectando",
  },

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
  close: "Fechar",
  downloadImage: "Baixar imagem",
  downloadAudio: "Baixar áudio",
  downloadVideo: "Baixar vídeo",
  downloadDocument: "Baixar documento",
  audioTranscription: "Transcrição em breve",
  imageCaption: (caption: string) => caption || "Foto",
  location: {
    label: "Localização",
    openMap: "Ver no mapa",
    noCoords: "Sem coordenadas",
  },
  contact: {
    label: "Contato",
    copyNumber: "Copiar número",
    copied: "Número copiado",
    noPhone: "Sem telefone",
  },
  documentMeta: (size: string) => size,

  // Status tooltips
  statusTooltip: {
    queued: "Enviando…",
    sent: (time: string) => `Enviada às ${time}`,
    delivered: (time: string) => `Entregue às ${time}`,
    read: (time: string) => `Lida às ${time}`,
    // Audio voice notes: WhatsApp reports PLAYED → read, so "read" means the
    // recipient actually listened. Surface that semantics, not "visualizada".
    heard: (time: string) => `Ouvido às ${time}`,
    failed: "Falha no envio",
    failedWithReason: (reason: string) => `Falha no envio — ${reason}`,
  },
  /** aria-label for the played/heard status icon on outbound audio bubbles. */
  heardLabel: "Ouvido",

  // Inbound receive-times disclosure — the bubble shows a single time by
  // default and reveals BOTH timestamps on expand: when the customer sent it
  // (sentAt, the WhatsApp time) and when our server received/stored it
  // (receivedAt, the row's created_at).
  receiveTimes: {
    expand: "Ver horários de envio e recebimento",
    collapse: "Ocultar horários",
    sentLabel: "Enviada pelo cliente",
    receivedLabel: "Recebida no sistema",
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
  sendDisabledUploading: "Aguarde o anexo terminar de enviar",
  attach: "Anexar",
  attachImage: "Imagem",
  attachDocument: "Documento",
  attachAudio: "Áudio (arquivo)",
  attachTooLarge: (maxMb: number) => `Arquivo acima de ${maxMb} MB — escolha um arquivo menor.`,
  attachUploadFailed: "Não foi possível enviar o anexo. Tente novamente.",
  attachUploading: "Enviando anexo…",
  attachDropHint: "Solte o arquivo aqui para anexar",
  attachUnsupportedType: "Tipo de arquivo não suportado. Envie imagem, áudio ou documento.",
  attachMultipleIgnored: "Apenas o primeiro arquivo foi anexado — os demais foram ignorados.",
  emoji: "Inserir emoji",
  templatesButton: "Templates",
  templatesUnavailable: "Disponível no provider Meta",
  aiSuggestionsLabel: "Sugestões IA",

  // Voice note recording (composer)
  voice: {
    record: "Gravar áudio",
    recording: "Gravando…",
    stop: "Parar",
    cancel: "Cancelar gravação",
    discard: "Descartar",
    send: "Enviar áudio",
    preview: "Pré-visualização da nota de voz",
    play: "Reproduzir",
    pause: "Pausar",
    permissionDenied:
      "Permissão de microfone negada. Habilite o acesso ao microfone nas configurações do navegador.",
    unavailable: "Não foi possível acessar o microfone. Verifique se há um dispositivo conectado.",
    tooShort: "Gravação muito curta — segure por mais tempo.",
  },

  // Typing indicator
  typing: "Cliente está digitando…",

  // Menu actions
  menu: {
    markResolved: "Marcar como resolvida",
    markUnread: "Marcar como não lida",
    transfer: "Transferir",
    returnToQueue: "Devolver para a fila",
    escalate: "Escalar para gestor",
    archive: "Arquivar",
    unarchive: "Desarquivar",
    addNote: "Adicionar nota",
    pauseSdr: "Pausar SDR",
    resumeSdr: "Retomar SDR",
    syncPhoto: "Atualizar foto do contato",
    renameContact: "Renomear contato",
  },

  // Conversation tags (chip + picker)
  tags: {
    sectionLabel: "Tags da conversa",
    add: "Adicionar",
    addShort: "+ Tag",
    searchPlaceholder: "Buscar tag…",
    empty: "Nenhuma tag encontrada",
    createInline: (query: string) => `Criar tag "${query}"`,
    updateFailed: "Não foi possível atualizar as tags.",
    createFailed: "Não foi possível criar a tag.",
    archivedSuffix: "(arquivada)",
    removeAria: (label: string) => `Remover ${label}`,
    overflowAria: (n: number) => `Mais ${n} tag(s)`,
    pickerAria: "Gerenciar tags da conversa",
  },

  photoSyncing: "Atualizando foto do contato…",
  photoUpdated: "Foto do contato atualizada",
  photoUnavailable: "O WhatsApp não retornou foto para este contato (sem foto ou perfil privado)",
  photoSyncFailed: "Não foi possível buscar a foto agora. Tente novamente.",
  resolved: "Conversa marcada como resolvida",
  reopened: "Conversa reaberta",
  archived: "Conversa arquivada",
  returnedToQueue: "Conversa devolvida à fila",
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

  // Internal attendant notes pinned to the conversation (board + @mentions).
  conversationNotes: {
    entryTooltip: "Anotações da conversa",
    panelTitle: "Anotações",
    panelDescription: "Recados internos entre atendentes — o cliente não vê.",
    composerPlaceholder: "Escreva uma anotação… use @ para marcar um atendente",
    submit: "Adicionar",
    saveEdit: "Salvar",
    cancel: "Cancelar",
    empty: "Nenhuma anotação ainda.",
    emptyHint: "Use este espaço para deixar recados aos outros atendentes.",
    loadError: "Não foi possível carregar as anotações.",
    retry: "Tentar novamente",
    pinnedSection: "Fixadas",
    pin: "Fixar",
    unpin: "Desafixar",
    edit: "Editar",
    delete: "Excluir",
    edited: "editada",
    mentionMenuLabel: "Atendentes para marcar",
    mentionEmpty: "Nenhum atendente encontrado",
    authorYou: "você",
    internalBadge: "Nota interna — só a equipe vê",
    composerTitle: "Anotação interna",
    composerHint: "Visível apenas para a equipe — o cliente não recebe.",
    close: "Fechar",
    consult: {
      open: "Consultar anotações",
      summary: (n: number) => `${n} ${n === 1 ? "anotação" : "anotações"}`,
      searchPlaceholder: "Buscar nas anotações…",
      scopeAll: "Todas",
      scopeMentions: "Me marcam",
      scopePinned: "Fixadas",
      modeIndex: "Índice",
      modeOnly: "Só notas",
      modeHighlight: "Realçar",
      noMatches: "Nenhuma anotação para este filtro.",
      prev: "Anterior",
      next: "Próxima",
      counter: (i: number, total: number) => `${i} / ${total}`,
    },
  },
} as const;
