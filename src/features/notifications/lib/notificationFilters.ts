import type {
  NotificationCategory,
  NotificationSeverity,
  NotificationStatus,
  IListNotificationsParams,
} from "@/providers/notifications";

export type NotificationStatusFilter = "all" | "unread" | "archived";

export interface INotificationFilters {
  status: NotificationStatusFilter;
  categories: NotificationCategory[];
  severities: NotificationSeverity[];
}

/** Flat URL search shape (CSV for multi-selects). */
export interface INotificationsSearch {
  status?: string;
  categories?: string;
  severities?: string;
}

export const ALL_CATEGORIES: readonly NotificationCategory[] = [
  "transactional",
  "commercial",
  "operational",
  "gamification",
  "system",
  "marketing",
];
export const ALL_SEVERITIES: readonly NotificationSeverity[] = [
  "info",
  "success",
  "warning",
  "critical",
];

const VALID_STATUS = new Set<NotificationStatusFilter>(["all", "unread", "archived"]);
const VALID_CATEGORY = new Set<NotificationCategory>(ALL_CATEGORIES);
const VALID_SEVERITY = new Set<NotificationSeverity>(ALL_SEVERITIES);

export const EMPTY_NOTIFICATION_FILTERS: INotificationFilters = {
  status: "all",
  categories: [],
  severities: [],
};

function splitCsv(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function joinCsv(values: string[]): string | undefined {
  return values.length ? values.join(",") : undefined;
}

export function validateNotificationsSearch(raw: Record<string, unknown>): INotificationsSearch {
  const out: INotificationsSearch = {};
  if (typeof raw.status === "string" && raw.status.length > 0) out.status = raw.status;
  if (typeof raw.categories === "string" && raw.categories.length > 0)
    out.categories = raw.categories;
  if (typeof raw.severities === "string" && raw.severities.length > 0)
    out.severities = raw.severities;
  return out;
}

export function readNotificationFilters(search: INotificationsSearch): INotificationFilters {
  const status =
    search.status && VALID_STATUS.has(search.status as NotificationStatusFilter)
      ? (search.status as NotificationStatusFilter)
      : "all";
  const categories = splitCsv(search.categories).filter((c): c is NotificationCategory =>
    VALID_CATEGORY.has(c as NotificationCategory),
  );
  const severities = splitCsv(search.severities).filter((s): s is NotificationSeverity =>
    VALID_SEVERITY.has(s as NotificationSeverity),
  );
  return { status, categories, severities };
}

export function filtersToSearch(f: INotificationFilters): INotificationsSearch {
  return {
    status: f.status === "all" ? undefined : f.status,
    categories: joinCsv(f.categories),
    severities: joinCsv(f.severities),
  };
}

/** Maps UI filters → store list params (note the PLURAL field names). */
export function filtersToListParams(f: INotificationFilters): IListNotificationsParams {
  const statuses: NotificationStatus[] =
    f.status === "unread"
      ? ["unread"]
      : f.status === "archived"
        ? ["archived"]
        : ["unread", "read"];
  return {
    statuses,
    categories: f.categories.length ? f.categories : undefined,
    severities: f.severities.length ? f.severities : undefined,
  };
}

export function hasActiveNotificationFilters(f: INotificationFilters): boolean {
  return f.status !== "all" || f.categories.length > 0 || f.severities.length > 0;
}

export function toggleInArray<T>(arr: T[], value: T): T[] {
  return arr.includes(value) ? arr.filter((v) => v !== value) : [...arr, value];
}
