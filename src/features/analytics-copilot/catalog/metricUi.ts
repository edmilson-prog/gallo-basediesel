// src/features/analytics-copilot/catalog/metricUi.ts

/** UI presentation layer for catalog metrics (icon + hero category). Kept apart
 *  from the engine catalog so the natural-language vocabulary stays decoupled
 *  from how we render suggestions. */
export interface ICopilotCategory {
  id: string;
  label: string;
  /** Catalog metric ids that belong to this category, in display order. */
  metricIds: string[];
}

export interface IMetricUiMeta {
  /** Iconify name (mdi:*). */
  icon: string;
  categoryId: string;
}

export const COPILOT_CATEGORIES: ICopilotCategory[] = [
  {
    id: "faturamento",
    label: "Faturamento & Margem",
    metricIds: ["faturamento", "margem", "ticket_medio", "pedidos"],
  },
  {
    id: "clientes",
    label: "Clientes & Positivação",
    metricIds: ["positivacao", "carteira", "curva_abc"],
  },
  {
    id: "projecao",
    label: "Projeção",
    metricIds: ["forecast"],
  },
];

export const metricUiMeta: Record<string, IMetricUiMeta> = {
  faturamento: { icon: "mdi:cash-multiple", categoryId: "faturamento" },
  margem: { icon: "mdi:scale-balance", categoryId: "faturamento" },
  ticket_medio: { icon: "mdi:receipt-text-outline", categoryId: "faturamento" },
  pedidos: { icon: "mdi:clipboard-list-outline", categoryId: "faturamento" },
  positivacao: { icon: "mdi:account-check", categoryId: "clientes" },
  carteira: { icon: "mdi:account-alert", categoryId: "clientes" },
  curva_abc: { icon: "mdi:chart-arc", categoryId: "clientes" },
  forecast: { icon: "mdi:chart-timeline", categoryId: "projecao" },
};

export function categoryById(id: string): ICopilotCategory | undefined {
  return COPILOT_CATEGORIES.find((c) => c.id === id);
}

/** Icon for a metric id, with a safe fallback. */
export function metricIcon(metricId: string): string {
  return metricUiMeta[metricId]?.icon ?? "mdi:chart-line";
}
