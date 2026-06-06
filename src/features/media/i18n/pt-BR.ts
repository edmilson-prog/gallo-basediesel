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

/** Foundation-level strings reused by Fases 3-5 surfaces. */
export const MEDIA_STRINGS = {
  sensitiveCaption: "Conteúdo sensível — acesso restrito",
  requestAccess: "Solicitar acesso ao gestor",
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
    period: { all: "Qualquer data", "7d": "Últimos 7 dias", "30d": "Últimos 30 dias", "90d": "Últimos 90 dias" },
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
};
