import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import type { ID } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useQuotesProvider } from "@/providers/data/hooks/useQuotesProvider";
import { QuoteStatusBadge } from "./QuoteStatusBadge";
import { QuoteOriginBadge } from "./QuoteOriginBadge";
import { ValidityIndicator } from "./ValidityIndicator";

const moneyFormatter = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

const dateFormatter = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  year: "2-digit",
});

const PAGE_SIZE = 10;

/**
 * Drop-in component for the customer profile (PRD-012) "Orçamentos" tab.
 * Lists every quote of the given customer with pagination.
 */
export function CustomerQuotesList({ customerId }: { customerId: ID }) {
  const navigate = useNavigate();
  const provider = useQuotesProvider();
  const [page, setPage] = useState(1);

  const query = useQuery({
    queryKey: ["customer-quotes", customerId, page] as const,
    queryFn: () =>
      provider.list({
        customerId,
        page,
        pageSize: PAGE_SIZE,
        orderBy: "createdAt",
        orderDir: "desc",
      }),
    staleTime: 30_000,
    placeholderData: (prev) => prev,
  });

  if (query.isLoading) {
    return (
      <div className="space-y-2 p-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-14 w-full" />
        ))}
      </div>
    );
  }

  const quotes = query.data?.data ?? [];
  const total = query.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  if (quotes.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 p-6 text-center">
        <Icon icon="mdi:file-document-outline" size={32} className="text-muted-foreground" />
        <p className="text-sm font-medium text-foreground">Nenhum orçamento ainda</p>
        <p className="text-xs text-muted-foreground">
          Crie um orçamento manual a partir da listagem principal.
        </p>
        <Button size="sm" variant="outline" onClick={() => void navigate({ to: "/app/orcamentos/novo" })}>
          <Icon icon="mdi:plus" size={14} /> Novo orçamento
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-2 p-4">
      <ul className="space-y-1.5">
        {quotes.map((q) => (
          <li key={q.id}>
            <button
              type="button"
              onClick={() => void navigate({ to: "/app/orcamentos/$id", params: { id: q.id } })}
              className="flex w-full items-center justify-between gap-3 rounded-md border border-border bg-card p-3 text-left transition-colors hover:bg-muted/40"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs font-semibold text-foreground">
                    #{q.number}
                  </span>
                  <QuoteStatusBadge status={q.status} size="sm" />
                  <QuoteOriginBadge origin={q.origin} size="sm" />
                </div>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {q.items.length} {q.items.length === 1 ? "item" : "items"} · criado em{" "}
                  {dateFormatter.format(new Date(q.createdAt))}
                </p>
              </div>
              <div className="text-right">
                <p className="text-sm font-semibold tabular-nums text-foreground">
                  {moneyFormatter.format(q.total)}
                </p>
                <ValidityIndicator validUntil={q.validUntil} className="mt-0.5" />
              </div>
            </button>
          </li>
        ))}
      </ul>

      {totalPages > 1 && (
        <div className="flex items-center justify-between border-t border-border pt-2 text-xs">
          <span className="text-muted-foreground">
            Página {page} de {totalPages} · {total} total
          </span>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
            >
              <Icon icon="mdi:chevron-left" size={16} />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
            >
              <Icon icon="mdi:chevron-right" size={16} />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
