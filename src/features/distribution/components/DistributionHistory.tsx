import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/Icon";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { DistributionMatchedCriterion, IDistributionTrace, ISeller } from "@/shared/types";
import {
  FETCH_ALL_PAGE_SIZE,
  useCustomersProvider,
  useDistributionTracesProvider,
  useLeadsProvider,
  useSellersProvider,
} from "@/providers/data";

interface IDistributionHistoryProps {
  storeId: string;
}

const PAGE_SIZE = 10;
const CRITERIA: DistributionMatchedCriterion[] = [
  "carteira",
  "especialidade",
  "round_robin",
  "carga",
  "fallback_sdr",
  "fallback_fila",
];

export function DistributionHistory({ storeId }: IDistributionHistoryProps) {
  const tracesProvider = useDistributionTracesProvider();
  const sellersProvider = useSellersProvider();
  const customersProvider = useCustomersProvider();
  const leadsProvider = useLeadsProvider();

  const [traces, setTraces] = useState<IDistributionTrace[]>([]);
  const [sellers, setSellers] = useState<ISeller[]>([]);
  const [page, setPage] = useState(1);
  const [criterion, setCriterion] = useState<DistributionMatchedCriterion | "all">("all");
  const [sellerFilter, setSellerFilter] = useState<string>("all");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    sellersProvider
      .list({ active: true })
      .then((s) => {
        if (!cancelled) setSellers(s);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [sellersProvider]);

  // Customer/lead name lookups live under STABLE query keys with a long
  // staleTime: the parent remounts this component (key={historyKey}) after
  // every simulated inbound, and these full-table fetches must come from the
  // cache instead of repeating ~7 requests each time. The traces fetch below
  // intentionally re-runs on remount — that is the point of historyKey.
  const customersQuery = useQuery({
    queryKey: ["distribution-name-lookup", "customers"] as const,
    queryFn: () => customersProvider.list({ pageSize: FETCH_ALL_PAGE_SIZE }).then((r) => r.data),
    staleTime: 5 * 60_000,
  });
  const leadsQuery = useQuery({
    queryKey: ["distribution-name-lookup", "leads"] as const,
    queryFn: () => leadsProvider.list({ pageSize: FETCH_ALL_PAGE_SIZE }).then((r) => r.data),
    staleTime: 5 * 60_000,
  });

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    tracesProvider
      .list({
        storeId,
        criterionMatched: criterion === "all" ? undefined : criterion,
        selectedSellerId: sellerFilter === "all" ? undefined : sellerFilter,
        page,
        pageSize: PAGE_SIZE,
      })
      .then((res) => {
        if (cancelled) return;
        setTraces(res.data);
        setHasMore(res.total > page * PAGE_SIZE);
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [tracesProvider, storeId, criterion, sellerFilter, page]);

  const sellerName = useMemo(() => {
    const map = new Map(sellers.map((s) => [s.id, s.fullName]));
    return (id: string | null) => (id ? (map.get(id) ?? id) : "—");
  }, [sellers]);

  const participantLabel = useMemo(() => {
    const customers = customersQuery.data ?? [];
    const leads = leadsQuery.data ?? [];
    const cm = new Map(
      customers.map((c) => [c.id, c.type === "B2B" ? c.nomeFantasia : c.fullName]),
    );
    const lm = new Map(leads.map((l) => [l.id, l.name]));
    return (trace: IDistributionTrace) => {
      if (trace.customerId) return cm.get(trace.customerId) ?? trace.customerId;
      if (trace.leadId) return lm.get(trace.leadId) ?? trace.leadId;
      return "—";
    };
  }, [customersQuery.data, leadsQuery.data]);

  return (
    <section aria-labelledby="distribution-history" className="space-y-3">
      <header>
        <h2 id="distribution-history" className="text-base font-semibold">
          Histórico de distribuições
        </h2>
        <p className="text-sm text-muted-foreground">
          Auditoria das últimas decisões automáticas — clique numa linha para ver o trace completo.
        </p>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <Select
          value={criterion}
          onValueChange={(v) => {
            setCriterion(v as DistributionMatchedCriterion | "all");
            setPage(1);
          }}
        >
          <SelectTrigger className="h-8 w-44 text-xs">
            <SelectValue placeholder="Critério" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os critérios</SelectItem>
            {CRITERIA.map((c) => (
              <SelectItem key={c} value={c}>
                {describeCriterion(c)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={sellerFilter}
          onValueChange={(v) => {
            setSellerFilter(v);
            setPage(1);
          }}
        >
          <SelectTrigger className="h-8 w-48 text-xs">
            <SelectValue placeholder="Vendedor" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os vendedores</SelectItem>
            {sellers.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.fullName}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardContent className="p-0">
          {loading && traces.length === 0 ? (
            <div className="p-4 text-sm text-muted-foreground">Carregando…</div>
          ) : traces.length === 0 ? (
            <div className="p-4 text-sm text-muted-foreground">
              Nenhuma distribuição registrada com esses filtros.
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {traces.map((trace) => {
                const isOpen = expanded === trace.id;
                return (
                  <li key={trace.id}>
                    <button
                      type="button"
                      onClick={() => setExpanded(isOpen ? null : trace.id)}
                      className={cn(
                        "flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm transition-colors hover:bg-accent/30",
                        isOpen && "bg-accent/30",
                      )}
                    >
                      <span className="w-32 shrink-0 font-mono text-xs text-muted-foreground">
                        {formatTimestamp(trace.timestamp)}
                      </span>
                      <span className="flex-1 truncate font-medium">{participantLabel(trace)}</span>
                      <Badge variant="outline" className="text-xs">
                        {describeCriterion(trace.criterionMatched)}
                      </Badge>
                      <span className="w-40 truncate text-xs text-muted-foreground">
                        →{" "}
                        {trace.selectedSellerId
                          ? sellerName(trace.selectedSellerId)
                          : trace.criterionMatched === "fallback_sdr"
                            ? "SDR"
                            : "Fila"}
                      </span>
                      <Icon
                        icon={isOpen ? "mdi:chevron-up" : "mdi:chevron-down"}
                        size={16}
                        className="text-muted-foreground"
                      />
                    </button>
                    {isOpen && (
                      <div className="space-y-2 bg-muted/30 px-4 py-3 text-xs">
                        <p>
                          <strong>ID:</strong> <span className="font-mono">{trace.id}</span>
                        </p>
                        <p>
                          <strong>Conversa:</strong>{" "}
                          <span className="font-mono">{trace.conversationId}</span>
                        </p>
                        <p>
                          <strong>Modo na hora da decisão:</strong> {trace.mode}
                        </p>
                        <p className="text-muted-foreground">Candidatos avaliados:</p>
                        <ul className="space-y-1">
                          {trace.candidatesEvaluated.map((cand, i) => (
                            <li
                              key={`${cand.sellerId}-${i}`}
                              className={cn(
                                "flex items-center gap-2 rounded border border-border/60 bg-background px-2 py-1",
                                cand.selected && "border-primary/50 bg-primary/10",
                              )}
                            >
                              <Icon
                                icon={cand.selected ? "mdi:check-circle" : "mdi:circle-outline"}
                                size={12}
                                className={cand.selected ? "text-primary" : "text-muted-foreground"}
                              />
                              <span className="font-medium">{sellerName(cand.sellerId)}</span>
                              <span className="text-muted-foreground">— {cand.reason}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>Página {page}</span>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={page === 1 || loading}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            Anterior
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={!hasMore || loading}
            onClick={() => setPage((p) => p + 1)}
          >
            Próxima
          </Button>
        </div>
      </div>
    </section>
  );
}

function describeCriterion(c: DistributionMatchedCriterion): string {
  const map: Record<DistributionMatchedCriterion, string> = {
    carteira: "Carteira",
    especialidade: "Especialidade",
    round_robin: "Round-robin",
    carga: "Carga",
    fallback_sdr: "SDR (fallback)",
    fallback_fila: "Fila",
  };
  return map[c];
}

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}
