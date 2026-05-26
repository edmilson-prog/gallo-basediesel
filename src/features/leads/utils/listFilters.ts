import type { ID, LeadOrigin, LeadTemperature } from "@/shared/types";

export const LEAD_TEMPERATURES = ["frio", "morno", "quente"] as const;
export const LEAD_ORIGINS = ["whatsapp", "ecommerce", "indicacao", "google", "outro"] as const;
export const NEXT_ACTION_FILTERS = ["any", "overdue", "today", "thisWeek", "future"] as const;
export const PERIOD_FILTERS = ["any", "24h", "7d", "30d"] as const;

export type NextActionFilter = (typeof NEXT_ACTION_FILTERS)[number];
export type PeriodFilter = (typeof PERIOD_FILTERS)[number];

export const PAGE_SIZES = [25, 50, 100] as const;
export type PageSize = (typeof PAGE_SIZES)[number];
export const DEFAULT_PAGE_SIZE: PageSize = 50;

export const LEADS_ORDER_BY = [
  "name",
  "temperature",
  "estimatedValue",
  "nextActionAt",
  "createdAt",
  "daysInStage",
] as const;
export type LeadsOrderBy = (typeof LEADS_ORDER_BY)[number];
export type LeadsOrderDir = "asc" | "desc";

export interface ILeadsListSort {
  orderBy: LeadsOrderBy;
  orderDir: LeadsOrderDir;
}

export const DEFAULT_SORT: ILeadsListSort = {
  orderBy: "createdAt",
  orderDir: "desc",
};

export interface ILeadsListFilters {
  stageIds: ID[];
  temperatures: LeadTemperature[];
  origins: LeadOrigin[];
  sellerIds: ID[];
  storeIds: ID[];
  nextAction: NextActionFilter;
  period: PeriodFilter;
  valueMin?: number;
  valueMax?: number;
  search: string;
  includeLost: boolean;
  includeConverted: boolean;
}

export const EMPTY_FILTERS: ILeadsListFilters = {
  stageIds: [],
  temperatures: [],
  origins: [],
  sellerIds: [],
  storeIds: [],
  nextAction: "any",
  period: "any",
  valueMin: undefined,
  valueMax: undefined,
  search: "",
  includeLost: false,
  includeConverted: false,
};

export function hasAnyFilter(filters: ILeadsListFilters): boolean {
  return (
    filters.stageIds.length > 0 ||
    filters.temperatures.length > 0 ||
    filters.origins.length > 0 ||
    filters.sellerIds.length > 0 ||
    filters.storeIds.length > 0 ||
    filters.nextAction !== "any" ||
    filters.period !== "any" ||
    filters.valueMin !== undefined ||
    filters.valueMax !== undefined ||
    filters.search.trim().length > 0 ||
    filters.includeLost ||
    filters.includeConverted
  );
}
