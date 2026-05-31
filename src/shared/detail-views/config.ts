/** A selectable layout for the commercial detail pages (quote, order). */
export type DetailLayout = "cockpit" | "operational" | "document";

export const DETAIL_LAYOUTS: readonly DetailLayout[] = [
  "cockpit",
  "operational",
  "document",
] as const;

export const DEFAULT_DETAIL_LAYOUT: DetailLayout = "cockpit";

/** localStorage keys — one per detail page, so each remembers its own view. */
export const QUOTE_DETAIL_LAYOUT_KEY = "gallo-quote-detail-layout";
export const ORDER_DETAIL_LAYOUT_KEY = "gallo-order-detail-layout";

export const DETAIL_LAYOUT_LABELS: Record<DetailLayout, string> = {
  cockpit: "Cockpit",
  operational: "Operacional",
  document: "Documento",
};

export const DETAIL_LAYOUT_ICONS: Record<DetailLayout, string> = {
  cockpit: "mdi:view-dashboard-outline",
  operational: "mdi:cog-sync-outline",
  document: "mdi:file-document-outline",
};

export const DETAIL_LAYOUT_HINTS: Record<DetailLayout, string> = {
  cockpit: "Visão geral com KPIs e trilho lateral",
  operational: "Fluxo de status, ações e blocos operacionais",
  document: "Formato de documento para conferir e imprimir",
};
