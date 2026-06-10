import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { Query } from "@tanstack/react-query";
import { getActiveDataSource, type DataSource } from "@/providers/data";

/** A failing query a mounted screen depends on, resolved to a friendly domain. */
export interface IDataFailure {
  /** Serialized query key — stable identity for de-duping/logging. */
  id: string;
  /** Human label for the affected domain (no technical jargon for end users). */
  label: string;
  /**
   * `unimplemented` → the active source has no implementation for this domain
   * yet (a known Fase 2 gap raised as `NotImplementedError`); `error` → a
   * genuine load failure (network, RLS, an unexpected bug).
   */
  kind: "unimplemented" | "error";
  /** Raw error message — surfaced only to the DEV console, never to the UI. */
  message: string;
}

export interface IDataHealth {
  /** Number of distinct failing domains currently observed. */
  failingCount: number;
  /** True when at least one query a mounted screen depends on failed to load. */
  isFailing: boolean;
  /** De-duped per-domain failures; split by {@link IDataFailure.kind}. */
  failures: IDataFailure[];
  /** Active data origin (`mock` or `supabase`), for labelling the break. */
  source: DataSource;
  /** Refetch every errored query (the banner's "try again" action). */
  retry: () => void;
}

/**
 * Canonical domain prefix → friendly pt-BR label. Query keys across the app use
 * ad-hoc first segments (`vehicles-list`, `customers-for-vehicles`, `abc-page`),
 * so we match by prefix (longest first) and fall back to a humanized segment.
 */
const DOMAIN_LABELS: Record<string, string> = {
  "notification-prefs": "Preferências de notificação",
  notifications: "Notificações",
  notification: "Notificações",
  customers: "Clientes",
  customer: "Clientes",
  vehicles: "Veículos",
  vehicle: "Veículos",
  leads: "Leads",
  lead: "Leads",
  orders: "Pedidos",
  order: "Pedidos",
  quotes: "Orçamentos",
  quote: "Orçamentos",
  conversations: "Atendimento",
  conversation: "Atendimento",
  messages: "Mensagens",
  parts: "Catálogo",
  catalog: "Catálogo",
  commissions: "Comissões",
  commission: "Comissões",
  expenses: "Despesas",
  cashflow: "Fluxo de caixa",
  goals: "Metas",
  goal: "Metas",
  dre: "DRE",
  abc: "Curva ABC",
  sellers: "Vendedores",
  seller: "Vendedores",
  stores: "Lojas",
  segments: "Segmentos",
  recommendations: "Recomendações",
  transfers: "Transferências de carteira",
  media: "Mídia",
  portal: "Portal B2B",
  sdr: "SDR",
  audits: "Auditoria",
  badges: "Indicadores do menu",
};

/** Prefixes sorted longest-first so `notification-prefs` wins over `notification`. */
const KNOWN_PREFIXES = Object.keys(DOMAIN_LABELS).sort((a, b) => b.length - a.length);

/** Strips presentational suffixes used in ad-hoc query keys, then title-cases. */
function humanize(segment: string): string {
  const base = segment
    .replace(/-(list|page|detail|config|search)$/i, "")
    .replace(/-for-.*$/i, "")
    .replace(/[-_]+/g, " ")
    .trim();
  if (!base) return segment;
  return base.charAt(0).toUpperCase() + base.slice(1);
}

/** Resolves the friendly domain label from a query's first key segment. */
function labelForQuery(query: Query): string {
  const first = query.queryKey[0];
  if (typeof first !== "string") return "Dados";
  const match = KNOWN_PREFIXES.find((key) => first === key || first.startsWith(`${key}-`));
  const label = match ? DOMAIN_LABELS[match] : undefined;
  return label ?? humanize(first);
}

/** A `NotImplementedError` marks a known, intentional Fase 2 gap (not a break). */
function isUnimplemented(error: unknown): boolean {
  return error instanceof Error && error.name === "NotImplementedError";
}

/**
 * Reduces every errored query (with an active observer) to one entry per domain.
 * A genuine error outranks a known gap for the same domain.
 */
function collectFailures(queries: Query[]): IDataFailure[] {
  const byLabel = new Map<string, IDataFailure>();
  for (const query of queries) {
    if (query.state.status !== "error" || query.getObserversCount() === 0) continue;
    const error = query.state.error;
    const label = labelForQuery(query);
    const kind: IDataFailure["kind"] = isUnimplemented(error) ? "unimplemented" : "error";
    const entry: IDataFailure = {
      id: JSON.stringify(query.queryKey),
      label,
      kind,
      message: error instanceof Error ? error.message : String(error),
    };
    const existing = byLabel.get(label);
    // Keep the first hit, but upgrade a known gap to a genuine error if one shows.
    if (!existing || (existing.kind === "unimplemented" && kind === "error")) {
      byLabel.set(label, entry);
    }
  }
  // Real errors first, then known gaps; alphabetical within each group.
  return [...byLabel.values()].sort((a, b) =>
    a.kind === b.kind ? a.label.localeCompare(b.label) : a.kind === "error" ? -1 : 1,
  );
}

/**
 * Observes the TanStack Query cache and reports whether the active data origin
 * (mock or Supabase) is currently failing to serve data to a screen the user is
 * looking at — and, crucially, *which* domains failed and *why*. Only counts
 * queries with active observers so background/stale errors don't false-alarm.
 * In DEV it logs the exact failing query keys + errors. Drives the
 * {@link DataSourceBanner}.
 */
export function useDataHealth(): IDataHealth {
  const queryClient = useQueryClient();
  const [failures, setFailures] = useState<IDataFailure[]>([]);
  const appliedSigRef = useRef<string>("");

  useEffect(() => {
    const cache = queryClient.getQueryCache();
    const recompute = () => {
      const next = collectFailures(cache.getAll());
      const signature = next.map((f) => `${f.kind}:${f.id}`).join("|");
      if (signature === appliedSigRef.current) return; // no change → skip re-render
      appliedSigRef.current = signature;
      setFailures(next);
      if (import.meta.env.DEV && next.length > 0) {
        console.warn(
          "[useDataHealth] queries em erro:",
          next.map(({ label, kind, id, message }) => ({ label, kind, queryKey: id, message })),
        );
      }
    };
    recompute();
    return cache.subscribe(recompute);
  }, [queryClient]);

  const retry = useCallback(() => {
    void queryClient.refetchQueries({ predicate: (query) => query.state.status === "error" });
  }, [queryClient]);

  return {
    failingCount: failures.length,
    isFailing: failures.length > 0,
    failures,
    source: getActiveDataSource(),
    retry,
  };
}
