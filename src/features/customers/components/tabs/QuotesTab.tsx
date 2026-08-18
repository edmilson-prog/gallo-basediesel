import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import type { ICustomer, IQuote } from "@/shared/types";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/Icon";
import { cn } from "@/lib/utils";
import { useQuotesProvider } from "@/providers/data/hooks/useQuotesProvider";
import { formatBRL, formatDateBR } from "@/shared/utils/format";
import { CUSTOMER_STRINGS } from "../../i18n/pt-BR";
import { TabSkeleton } from "../TabSkeleton";
import { TabEmptyState } from "../TabEmptyState";
import { CustomerEmptyState } from "../detail/CustomerEmptyState";

const COPY = CUSTOMER_STRINGS.quotes;
const PAGE_SIZE = 10;

const STATUS_TONE: Record<IQuote["status"], string> = {
  rascunho: "bg-zinc-500/15 text-zinc-700 dark:text-zinc-300",
  enviado: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
  aceito: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  recusado: "bg-rose-500/15 text-rose-700 dark:text-rose-300",
  expirado: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  convertido: "bg-primary/10 text-primary",
};

const ORIGIN_LABEL: Record<IQuote["origin"], string> = {
  sdr: COPY.origin.sdr,
  vendedor: COPY.origin.vendedor,
  cliente_portal: COPY.origin.cliente_portal,
  ecommerce: COPY.origin.ecommerce,
};

export interface IQuotesTabProps {
  customer: ICustomer;
  /** Drops the internal title — the detail page's `CustomerPanel` owns it. */
  headless?: boolean;
}

export function QuotesTab({ customer, headless }: IQuotesTabProps) {
  const provider = useQuotesProvider();
  const navigate = useNavigate();
  const [page, setPage] = useState(1);

  const query = useQuery({
    queryKey: ["customer-quotes", customer.id] as const,
    staleTime: 60 * 1000,
    queryFn: () =>
      provider
        .list({ customerId: customer.id, pageSize: 200 })
        .then((r) => [...r.data].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))),
  });

  const quotes = useMemo(() => query.data ?? [], [query.data]);
  const totalPages = Math.max(1, Math.ceil(quotes.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const visible = useMemo(
    () => quotes.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE),
    [quotes, currentPage],
  );

  return (
    <div className="space-y-3">
      <header className="flex items-center gap-2">
        {!headless && (
          <>
            <Icon icon="mdi:file-document-outline" size={16} className="text-muted-foreground" />
            <h3 className="text-sm font-semibold text-foreground">{COPY.title}</h3>
          </>
        )}
        <span className="ml-auto text-xs text-muted-foreground">
          {quotes.length > 0
            ? CUSTOMER_STRINGS.orders.pageLabel(visible.length, quotes.length)
            : null}
        </span>
      </header>

      {query.isLoading ? (
        <TabSkeleton rows={5} />
      ) : quotes.length === 0 ? (
        headless ? (
          <CustomerEmptyState
            icon="mdi:file-document-off-outline"
            title={COPY.emptyTitle}
            text={COPY.emptyHint}
          />
        ) : (
          <TabEmptyState icon="mdi:file-document-off-outline" message={COPY.empty} />
        )
      ) : (
        <>
          <ul className="space-y-1.5">
            {visible.map((quote) => (
              <li key={quote.id}>
                <button
                  type="button"
                  onClick={() => void navigate({ to: `/app/orcamentos/${quote.id}` as never })}
                  className="block w-full rounded-md border border-border bg-background p-2.5 text-left transition hover:border-primary/50 hover:bg-accent/40 focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="font-mono text-xs font-semibold text-foreground">
                      #{quote.number}
                    </span>
                    <span className="text-xs font-semibold text-foreground">
                      {formatBRL(quote.total)}
                    </span>
                  </div>
                  <div className="mt-1 flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                    <span>{formatDateBR(quote.createdAt)}</span>
                    {quote.discount > 0 && (
                      <span>{COPY.discountLabel(formatBRL(quote.discount))}</span>
                    )}
                  </div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-1">
                    <span
                      className={cn(
                        "inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium",
                        STATUS_TONE[quote.status],
                      )}
                    >
                      {COPY.status[quote.status]}
                    </span>
                    <span className="inline-flex items-center rounded-full border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground">
                      {ORIGIN_LABEL[quote.origin]}
                    </span>
                  </div>
                </button>
              </li>
            ))}
          </ul>

          {totalPages > 1 && (
            <div className="flex items-center justify-between gap-2 pt-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="gap-1"
              >
                <Icon icon="mdi:chevron-left" size={14} />
                Anterior
              </Button>
              <span className="text-xs text-muted-foreground">
                Página {currentPage} de {totalPages}
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="gap-1"
              >
                Próxima
                <Icon icon="mdi:chevron-right" size={14} />
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
