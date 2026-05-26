import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { IAuditLog, ID, ISeller } from "@/shared/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Icon } from "@/components/Icon";
import { useAuditsProvider } from "@/providers/data/hooks/useAuditsProvider";
import { EmptyState } from "@/features/shell/components/EmptyState";
import { formatDateTime } from "../utils/formatters";

const TRANSFER_ACTIONS = ["transfer.create", "transfer.revert", "transfer.expire"] as const;

const ACTION_LABEL: Record<string, string> = {
  "transfer.create": "Criou",
  "transfer.revert": "Reverteu",
  "transfer.expire": "Expirou (auto)",
};

const ACTION_VARIANT: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  "transfer.create": "default",
  "transfer.revert": "secondary",
  "transfer.expire": "outline",
};

const PAGE_SIZE = 20;

export interface ITransferAuditTabProps {
  storeId?: ID;
  sellersById: Map<ID, ISeller>;
}

export function TransferAuditTab({ storeId, sellersById }: ITransferAuditTabProps) {
  const provider = useAuditsProvider();
  const [page, setPage] = useState(1);
  const [expanded, setExpanded] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ["carteira-audit", storeId ?? null, page],
    queryFn: () =>
      provider.list({
        storeId,
        actions: [...TRANSFER_ACTIONS],
        resources: ["transfer"],
        page,
        pageSize: PAGE_SIZE,
      }),
    staleTime: 15_000,
  });

  const total = query.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const items: IAuditLog[] = useMemo(() => query.data?.data ?? [], [query.data]);

  if (query.isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-16 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  if (query.isError) {
    return (
      <EmptyState
        icon="mdi:alert-circle-outline"
        title="Falha ao carregar auditoria"
        description="Tente novamente em alguns instantes."
      />
    );
  }

  if (items.length === 0) {
    return (
      <EmptyState
        icon="mdi:history"
        title="Sem eventos de transferência"
        description="Ações de criação, reversão e expiração aparecerão aqui."
      />
    );
  }

  return (
    <div className="space-y-3">
      <ul className="space-y-2">
        {items.map((entry) => {
          const actor = sellersById.get(entry.actorId)?.fullName ?? entry.actorId;
          const isExpanded = expanded === entry.id;
          return (
            <li key={entry.id} className="rounded-lg border border-border bg-card">
              <button
                type="button"
                aria-expanded={isExpanded}
                onClick={() => setExpanded((cur) => (cur === entry.id ? null : entry.id))}
                className="flex w-full items-center gap-3 px-4 py-3 text-left"
              >
                <div className="grid h-9 w-9 place-items-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                  {actor.slice(0, 2).toUpperCase()}
                </div>
                <div className="flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium text-foreground">{actor}</span>
                    <Badge variant={ACTION_VARIANT[entry.action] ?? "outline"} className="text-xs">
                      {ACTION_LABEL[entry.action] ?? entry.action}
                    </Badge>
                    <span className="text-xs text-muted-foreground">·</span>
                    <span className="text-xs text-muted-foreground">{entry.resourceId}</span>
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {formatDateTime(entry.timestamp)}
                  </p>
                </div>
                <Icon
                  icon={isExpanded ? "mdi:chevron-up" : "mdi:chevron-down"}
                  size={18}
                  className="text-muted-foreground"
                />
              </button>
              {isExpanded && (
                <div className="grid gap-3 border-t border-border px-4 py-3 md:grid-cols-2">
                  {entry.before !== undefined && entry.before !== null ? (
                    <div>
                      <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Antes
                      </div>
                      <pre className="overflow-x-auto rounded-md bg-muted p-3 text-xs text-foreground">
                        {JSON.stringify(entry.before, null, 2)}
                      </pre>
                    </div>
                  ) : null}
                  {entry.after !== undefined && entry.after !== null ? (
                    <div>
                      <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Depois
                      </div>
                      <pre className="overflow-x-auto rounded-md bg-muted p-3 text-xs text-foreground">
                        {JSON.stringify(entry.after, null, 2)}
                      </pre>
                    </div>
                  ) : null}
                  {entry.before === undefined && entry.after === undefined && (
                    <p className="text-xs text-muted-foreground">
                      Sem snapshot before/after disponível.
                    </p>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>

      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>
          Página {page} de {totalPages} · {total} eventos
        </span>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            Anterior
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          >
            Próxima
          </Button>
        </div>
      </div>
    </div>
  );
}
