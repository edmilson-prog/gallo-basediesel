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
} as const;
