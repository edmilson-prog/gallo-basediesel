import type { ReleaseCategory, ReleaseKind } from "@/shared/types/about";

export const ABOUT_I18N = {
  page: {
    title: "Sobre a plataforma",
    subtitle: "Identidade, mantenedor e histórico de versões.",
  },

  identity: {
    productName: "GALLO BASE DIESEL",
    tagline:
      "Plataforma de inteligência comercial para distribuidora de peças pesadas — posicionada acima do ERP DINTEC como cérebro comercial e relacional.",
    maintainerPrefix: "Mantida por ",
    maintainerName: "AILA Sistemas Inteligentes",
    maintainerEmail: "edmilson@ailainteligente.com",
    submarks: {
      parts: "PARTS",
      service: "SERVICE",
      industrial: "INDUSTRIAL",
    },
  },

  currentVersion: {
    metaDate: "Data",
    metaKind: "Tipo",
    metaBlock: "Bloco",
    metaDeliveries: "Entregas",
    whatsNew: "O que há de novo",
    codenamePrefix: "Codinome",
    deliveriesSuffix: "alterações",
  },

  history: {
    title: "Histórico de versões",
    countSuffix: "releases",
    searchPlaceholder: "Buscar por versão, codinome, recurso…",
    filterKindAll: "Todos os tipos",
    filterPeriodAll: "Todos os períodos",
    filterPeriodThisMonth: "Este mês",
    filterPeriodLast3Months: "Últimos 3 meses",
    filterPeriodThisYear: "Este ano",
    itemsSuffix: "itens",
    emptyTitle: "Nenhuma release encontrada",
    emptyDescription: "Ajuste os filtros ou limpe a busca para ver mais.",
    clearFilters: "Limpar filtros",
    rawFallbackNote: "Conteúdo cru exibido por limitação de formatação.",
  },

  loading: "Carregando histórico…",
  error: {
    title: "Não foi possível carregar o histórico",
    description: "O arquivo CHANGELOG.md não pôde ser baixado. Tente novamente em instantes.",
    retry: "Tentar novamente",
  },

  footer: {
    stack: {
      title: "Stack técnica",
      description: "React 19 · TanStack Router · Tailwind v4 · shadcn/ui · TanStack Query · Vercel",
    },
    support: {
      title: "Suporte",
      description: "Resposta em 1 dia útil",
    },
    docs: {
      title: "Documentação",
      descriptionTemplate: "50 PRDs catalogados · {{count}} releases entregues",
    },
  },
} as const;

export const RELEASE_KIND_LABEL: Record<ReleaseKind, string> = {
  major: "Major",
  minor: "Minor",
  patch: "Patch",
};

export const RELEASE_CATEGORY_LABEL: Record<ReleaseCategory, string> = {
  added: "Adicionado",
  changed: "Modificado",
  fixed: "Corrigido",
  removed: "Removido",
  deprecated: "Descontinuado",
  security: "Segurança",
  notes: "Notas",
  migration: "Migração",
};
