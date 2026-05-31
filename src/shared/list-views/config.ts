/** A selectable layout for the commercial list pages (quotes, orders). */
export type ListLayout = "cockpit" | "console" | "rows";

export const LIST_LAYOUTS: readonly ListLayout[] = ["cockpit", "console", "rows"] as const;

export const DEFAULT_LIST_LAYOUT: ListLayout = "cockpit";

/** localStorage keys — one per list, so each list remembers its own view. */
export const QUOTES_LIST_LAYOUT_KEY = "gallo-quotes-list-layout";
export const ORDERS_LIST_LAYOUT_KEY = "gallo-orders-list-layout";

export const LIST_LAYOUT_LABELS: Record<ListLayout, string> = {
  cockpit: "Cockpit",
  console: "Console",
  rows: "Linhas",
};

export const LIST_LAYOUT_ICONS: Record<ListLayout, string> = {
  cockpit: "mdi:view-dashboard-outline",
  console: "mdi:view-split-vertical",
  rows: "mdi:view-sequential-outline",
};

export const LIST_LAYOUT_HINTS: Record<ListLayout, string> = {
  cockpit: "Indicadores e abas no topo, tabela ampla",
  console: "Indicadores e filtros num trilho à esquerda",
  rows: "Linhas com mais detalhe por item",
};
