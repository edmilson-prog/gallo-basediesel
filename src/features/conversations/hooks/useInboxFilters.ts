import { useCallback, useMemo } from "react";
import { useNavigate, useSearch } from "@tanstack/react-router";
import type { ConversationChannel, ConversationStatus, ID } from "@/shared/types";

export type PeriodFilter = "all" | "24h" | "7d" | "30d";
export type AssignmentFilter = "me" | "unassigned" | "queue" | "all" | string;
export type SortMode = "lastMessage" | "waiting" | "abc";

export interface IInboxFiltersState {
  status: ConversationStatus | "all";
  channel: ConversationChannel | "all";
  assignment: AssignmentFilter;
  /** Origin WhatsApp instance (multi-instância), or "all". */
  instance: ID | "all";
  tags: string[];
  period: PeriodFilter;
  search: string;
  sort: SortMode;
  /** Restrict to conversations that were escalated by the SDR (PRD-023). */
  escalated: boolean;
}

export interface IInboxFiltersSearch {
  status?: string;
  channel?: string;
  assignment?: string;
  instance?: string;
  tags?: string;
  period?: string;
  q?: string;
  sort?: string;
  escalated?: string;
}

const VALID_STATUS = new Set<ConversationStatus | "all">([
  "all",
  "aguardando",
  "em_andamento",
  "aguardando_cliente",
  "resolvida",
  "arquivada",
]);

const VALID_CHANNEL = new Set<ConversationChannel | "all">([
  "all",
  "whatsapp",
  "ecommerce",
  "phone",
  "site",
]);

const VALID_PERIOD = new Set<PeriodFilter>(["all", "24h", "7d", "30d"]);
const VALID_SORT = new Set<SortMode>(["lastMessage", "waiting", "abc"]);

const DEFAULT_FILTERS: IInboxFiltersState = {
  status: "all",
  channel: "all",
  assignment: "me",
  instance: "all",
  tags: [],
  period: "all",
  search: "",
  sort: "lastMessage",
  escalated: false,
};

/**
 * Validate the search-params dictionary produced by TanStack Router for the
 * `/app/atendimento` route. Lives next to the hook so the route file can
 * import it as `validateSearch`. Reject unknown values silently by falling
 * back to defaults — the URL stays robust to copy-paste oddities.
 */
export function validateInboxSearch(raw: Record<string, unknown>): IInboxFiltersSearch {
  const out: IInboxFiltersSearch = {};
  if (typeof raw.status === "string" && VALID_STATUS.has(raw.status as ConversationStatus | "all"))
    out.status = raw.status;
  if (
    typeof raw.channel === "string" &&
    VALID_CHANNEL.has(raw.channel as ConversationChannel | "all")
  )
    out.channel = raw.channel;
  if (typeof raw.assignment === "string") out.assignment = raw.assignment;
  if (typeof raw.instance === "string" && raw.instance.length > 0) out.instance = raw.instance;
  if (typeof raw.tags === "string" && raw.tags.length > 0) out.tags = raw.tags;
  if (typeof raw.period === "string" && VALID_PERIOD.has(raw.period as PeriodFilter))
    out.period = raw.period;
  if (typeof raw.q === "string" && raw.q.length > 0) out.q = raw.q;
  if (typeof raw.sort === "string" && VALID_SORT.has(raw.sort as SortMode)) out.sort = raw.sort;
  if (raw.escalated === "1" || raw.escalated === "true") out.escalated = "1";
  return out;
}

function parseTags(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
}

function readState(search: IInboxFiltersSearch, currentSellerId: ID | null): IInboxFiltersState {
  return {
    status: (search.status as IInboxFiltersState["status"] | undefined) ?? DEFAULT_FILTERS.status,
    channel:
      (search.channel as IInboxFiltersState["channel"] | undefined) ?? DEFAULT_FILTERS.channel,
    assignment: search.assignment ?? (currentSellerId ? DEFAULT_FILTERS.assignment : "all"),
    instance: search.instance ?? DEFAULT_FILTERS.instance,
    tags: parseTags(search.tags),
    period: (search.period as IInboxFiltersState["period"] | undefined) ?? DEFAULT_FILTERS.period,
    search: search.q ?? DEFAULT_FILTERS.search,
    sort: (search.sort as IInboxFiltersState["sort"] | undefined) ?? DEFAULT_FILTERS.sort,
    escalated: search.escalated === "1" || search.escalated === "true",
  };
}

/**
 * Read and write the inbox filter state through the URL.
 *
 * The URL is the single source of truth; setters write back via
 * `navigate({ search })`. Components consume the derived state, never the
 * raw query string. Default values are omitted from the URL so the bar
 * stays clean (e.g. `?status=aguardando` not `?status=aguardando&channel=all`).
 */
export function useInboxFilters(currentSellerId: ID | null): {
  filters: IInboxFiltersState;
  setStatus: (status: IInboxFiltersState["status"]) => void;
  setChannel: (channel: IInboxFiltersState["channel"]) => void;
  setAssignment: (assignment: AssignmentFilter) => void;
  setInstance: (instance: ID | "all") => void;
  setTags: (tags: string[]) => void;
  setPeriod: (period: PeriodFilter) => void;
  setSearch: (q: string) => void;
  setSort: (sort: SortMode) => void;
  setEscalated: (escalated: boolean) => void;
  reset: () => void;
  activeCount: number;
} {
  const search = useSearch({ from: "/app/atendimento" }) as IInboxFiltersSearch;
  // IMPORTANT: do NOT pass `from` here. With `from` set and no `to`, TanStack
  // Router resolves the navigation relative to the parent (`/app/atendimento`)
  // and drops the `$id` segment when the user is viewing a conversation —
  // which then triggers a re-navigation that strips the search params we just
  // wrote, making filter changes silently revert.
  const navigate = useNavigate();
  const filters = useMemo(() => readState(search, currentSellerId), [search, currentSellerId]);

  const apply = useCallback(
    (patch: Partial<IInboxFiltersSearch>) => {
      void navigate({
        // `to: "."` keeps whatever pathname the user is on (the inbox list at
        // `/app/atendimento` or a conversation at `/app/atendimento/$id`) and
        // only updates the search params.
        to: ".",
        search: (prev) => {
          const next: IInboxFiltersSearch = { ...(prev as IInboxFiltersSearch), ...patch };
          // Drop empty / default values so the URL stays minimal.
          for (const key of Object.keys(next) as (keyof IInboxFiltersSearch)[]) {
            const value = next[key];
            if (value === undefined || value === "") delete next[key];
          }
          return next;
        },
      });
    },
    [navigate],
  );

  return {
    filters,
    setStatus: (v) => apply({ status: v === "all" ? undefined : v }),
    setChannel: (v) => apply({ channel: v === "all" ? undefined : v }),
    setAssignment: (v) =>
      apply({
        assignment: v === DEFAULT_FILTERS.assignment ? undefined : v,
      }),
    setInstance: (v) => apply({ instance: v === "all" ? undefined : v }),
    setTags: (tags) => apply({ tags: tags.length === 0 ? undefined : tags.join(",") }),
    setPeriod: (v) => apply({ period: v === "all" ? undefined : v }),
    setSearch: (q) => apply({ q: q.length === 0 ? undefined : q }),
    setSort: (v) => apply({ sort: v === "lastMessage" ? undefined : v }),
    setEscalated: (v) => apply({ escalated: v ? "1" : undefined }),
    reset: () =>
      void navigate({
        to: ".",
        search: () => ({}),
      }),
    activeCount: countActive(filters),
  };
}

function countActive(filters: IInboxFiltersState): number {
  let n = 0;
  if (filters.status !== DEFAULT_FILTERS.status) n += 1;
  if (filters.channel !== DEFAULT_FILTERS.channel) n += 1;
  if (filters.assignment !== DEFAULT_FILTERS.assignment) n += 1;
  if (filters.instance !== DEFAULT_FILTERS.instance) n += 1;
  if (filters.tags.length > 0) n += 1;
  if (filters.period !== DEFAULT_FILTERS.period) n += 1;
  if (filters.search.length > 0) n += 1;
  if (filters.escalated) n += 1;
  return n;
}

/**
 * Translate the filter state into the param shape consumed by
 * `useConversationsList` / `IConversationsProvider.list`.
 *
 * The mapping is deliberately one-way: filters are validated/persisted in
 * URL form by `useInboxFilters`; this helper composes the provider call.
 */
export function filtersToListParams(
  filters: IInboxFiltersState,
  ctx: { currentSellerId: ID | null },
) {
  const params: Record<string, unknown> = {};

  // Status — defaulting to "all" excludes only archived conversations
  // (PRD-010 RF-007).
  if (filters.status === "all") {
    params.status = ["aguardando", "em_andamento", "aguardando_cliente", "resolvida"];
  } else {
    params.status = filters.status;
  }

  if (filters.channel !== "all") params.channel = filters.channel;
  if (filters.instance !== "all") params.whatsappAccountId = filters.instance;
  if (filters.tags.length > 0) params.tags = filters.tags;
  if (filters.search.length > 0) params.search = filters.search;

  // Assignment.
  if (filters.assignment === "me" && ctx.currentSellerId) {
    params.assignedSellerId = ctx.currentSellerId;
  } else if (filters.assignment === "unassigned") {
    params.unassigned = true;
  } else if (filters.assignment === "queue") {
    // Em fila: sem vendedor atribuído E SDR inativo E status "aguardando".
    params.unassigned = true;
    params.isSdrActive = false;
    params.status = "aguardando";
  } else if (filters.assignment !== "all" && filters.assignment !== "me") {
    // A specific seller id (Owner/Gestor picked someone from the dropdown).
    params.assignedSellerId = filters.assignment;
  }

  // Period → fromDate.
  if (filters.period !== "all") {
    const now = Date.now();
    const ms =
      filters.period === "24h"
        ? 24 * 3600_000
        : filters.period === "7d"
          ? 7 * 24 * 3600_000
          : 30 * 24 * 3600_000;
    params.fromDate = new Date(now - ms).toISOString();
  }

  // Sort.
  if (filters.sort === "waiting") {
    params.status = "aguardando";
    params.orderBy = "lastMessageAt";
    params.orderDir = "asc";
  } else if (filters.sort === "abc") {
    params.orderBy = "abcClass";
  } else {
    params.orderBy = "lastMessageAt";
    params.orderDir = "desc";
  }

  return params;
}
