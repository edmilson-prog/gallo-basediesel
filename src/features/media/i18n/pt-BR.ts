import type { IMediaClassification, IMediaAsset } from "@/shared/types";

/** pt-BR labels for the assisted classification chips. */
export const CLASSIFICATION_LABELS: Record<IMediaClassification, string> = {
  nota_fiscal: "Nota fiscal",
  peca: "Peça",
  chassi_placa: "Chassi / placa",
  comprovante: "Comprovante",
  catalogo: "Catálogo",
  outro: "Outro",
};

/** pt-BR labels for the media kinds. */
export const KIND_LABELS: Record<IMediaAsset["kind"], string> = {
  image: "Imagem",
  audio: "Áudio",
  document: "Documento",
  video: "Vídeo",
};

// Canonical sensitive-access strings — referenced by both the top-level Plan-A keys
// and the nested `sensitive` block (Task 10) to avoid duplicate literals (DRY).
const _SENSITIVE_CAPTION = "Conteúdo sensível — acesso restrito";
const _REQUEST_ACCESS = "Solicitar acesso ao gestor";

/** Foundation-level strings reused by Fases 3-5 surfaces. */
export const MEDIA_STRINGS = {
  sensitiveCaption: _SENSITIVE_CAPTION,
  requestAccess: _REQUEST_ACCESS,
  retry: "Tentar novamente",
  emptyState: "Nenhuma mídia",
  galleryTitle: "Mídias",
  viewMode: {
    label: "Modo de visualização",
    grade: "Grade — miniaturas densas",
    cartoes: "Cartões — com nome e classificação",
    tipo: "Por tipo — imagens, documentos e áudios",
  },
  filters: {
    searchPlaceholder: "Buscar por nome, texto reconhecido ou transcrição…",
    searchLabel: "Buscar mídias",
    clearSearch: "Limpar busca",
    kindLabel: "Tipo de mídia",
    kindAll: "Todos",
    kind: { image: "Imagens", document: "Documentos", audio: "Áudios", video: "Vídeos" },
    authorLabel: "Autor",
    authorAll: "Todos os autores",
    author: { customer: "Cliente", seller: "Vendedor", sdr: "SDR", system: "Sistema" },
    periodLabel: "Período",
    period: {
      all: "Qualquer data",
      "7d": "Últimos 7 dias",
      "30d": "Últimos 30 dias",
      "90d": "Últimos 90 dias",
    },
    classificationLabel: "Classificação",
    classificationAll: "Todas",
    classification: {
      nota_fiscal: "Nota fiscal",
      peca: "Peça",
      chassi_placa: "Chassi/Placa",
      comprovante: "Comprovante",
      catalogo: "Catálogo",
      outro: "Outro",
    },
    activeBadge: (n: number) => `${n} filtro${n === 1 ? "" : "s"}`,
    clearAll: "Limpar filtros",
  },
  chip: {
    failure: "Falha",
    retry: "Tentar novamente",
    expiringDays: (n: number) => `${n}d`,
    expiringLabel: (n: number) => `Expira em ${n} dia${n === 1 ? "" : "s"}`,
    expired: "Expirada",
    expiredLabel: "URL expirada",
    sensitive: "Conteúdo sensível",
  },
  card: {
    unnamed: "Sem nome",
    noClassification: "Sem classificação",
  },
  grid: {
    ariaLabel: "Mídias",
  },
  groups: {
    images: "Imagens e vídeos",
    documents: "Documentos",
    audios: "Áudios",
    empty: "Nenhum item deste tipo.",
    playAudio: "Reproduzir áudio",
  },
  sensitive: {
    // Reference the module-level constants so caption/requestAccess are the same
    // string as the top-level Plan-A keys (DRY — single source of truth).
    caption: _SENSITIVE_CAPTION,
    dialogTitle: "Conteúdo sensível",
    dialogBody:
      "Esta mídia contém dados sensíveis (ex.: CPF/CNPJ em nota fiscal). Apenas Owner e Gestor podem visualizá-la. Solicite acesso ao seu gestor se precisar abri-la.",
    requestAccess: _REQUEST_ACCESS,
    requestSent: "Solicitação enviada ao gestor.",
    close: "Fechar",
  },
  audio: {
    play: "Reproduzir",
    pause: "Pausar",
    speed: "Velocidade",
    sliderLabel: "Posição do áudio",
    noTranscription: "Sem transcrição disponível.",
    transcriptionLabel: "Transcrição",
  },
  lightbox: {
    close: "Fechar",
    prev: "Anterior",
    next: "Próxima",
    zoomIn: "Aumentar zoom",
    zoomOut: "Reduzir zoom",
    openDoc: "Abrir documento",
    downloadDoc: "Baixar",
    details: "Detalhes e ações",
    meta: { author: "Autor", date: "Data", size: "Tamanho", classification: "Classificação", links: "Vínculos" },
    noLinks: "Sem vínculos.",
    openConversation: "Abrir conversa",
    counter: (i: number, total: number) => `${i} de ${total}`,
  },
  annotator: {
    tools: { point: "Ponto", arrow: "Seta", text: "Texto", select: "Selecionar" },
    listTitle: "Anotações",
    empty: "Nenhuma anotação ainda. Selecione uma ferramenta e clique na imagem.",
    labelPlaceholder: "Descrição da anotação…",
    save: "Salvar anotações",
    cancel: "Cancelar",
    remove: "Remover anotação",
    nudgeHint: "Use as setas para mover (Shift = 10px)",
  },
  gallery: {
    title: "Mídias",
    empty: "Nenhuma mídia ainda.",
    emptyFiltered: "Nenhuma mídia corresponde aos filtros.",
    loadError: "Não foi possível carregar as mídias.",
    retry: "Tentar novamente",
    loading: "Carregando mídias…",
  },
  retention: {
    title: "Retenção de mídia (LGPD)",
    description:
      "Períodos de retenção das mídias arquivadas. Placeholder de configuração — o expurgo automático entra na Fase 2.",
    common: {
      label: "Mídia comum",
      value: "365 dias",
    },
    sensitive: {
      label: "Mídia sensível",
      value: "1825 dias (5 anos)",
    },
  },
  actions: {
    annotate: "Anotar",
    classify: "Classificar",
    link: "Vincular",
    download: "Baixar",
    delete: "Excluir",
    deleteTitle: "Excluir esta mídia?",
    deleteBody: "A mídia será removida da galeria. Esta ação fica registrada na auditoria.",
    deleteConfirm: "Excluir",
    cancel: "Cancelar",
    classifiedToast: "Classificação atualizada.",
    linkedToast: "Vínculo salvo.",
    sensitivityToast: "Sensibilidade atualizada.",
    deletedToast: "Mídia excluída.",
    annotatedToast: "Anotações salvas.",
    retryPersistToast: "Reenvio iniciado.",
    suggestedClassification: (label: string) => `Sugestão: ${label}`,
    applySuggestion: "Aplicar sugestão",
    linkVehicle: "Vincular veículo",
    linkOrder: "Vincular pedido",
    linkPart: "Vincular peça",
    linkConfirmTitle: "Confirmar vínculo?",
    linkConfirmBody: "O vínculo será registrado na auditoria.",
    linkConfirm: "Vincular",
  },
};
