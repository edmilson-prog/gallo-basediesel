import { Link } from "@tanstack/react-router";
import type { IQuote, QuoteStatus } from "@/shared/types";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Icon } from "@/components/Icon";
import { useSeoMeta } from "@/features/storefront/hooks/useSeoMeta";
import { formatBRL, formatDateBR } from "@/shared/utils/format";
import { cn } from "@/lib/utils";
import { useCustomerAuth } from "../hooks/useCustomerAuth";
import { useCustomerQuotes } from "../hooks/useCustomerQuotes";
import { STOREFRONT_ACCOUNT_STRINGS as S } from "../i18n/pt-BR";

const QUOTE_STATUS_LABEL: Record<QuoteStatus, string> = {
  rascunho: "Rascunho",
  enviado: "Aguardando resposta",
  aceito: "Aceito",
  recusado: "Recusado",
  expirado: "Expirado",
  convertido: "Convertido em pedido",
};

const QUOTE_STATUS_CLASSES: Record<QuoteStatus, string> = {
  rascunho: "bg-muted text-muted-foreground border-border",
  enviado: "bg-blue-500/10 text-blue-600 dark:text-blue-300 border-blue-500/30",
  aceito: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-300 border-emerald-500/30",
  recusado: "bg-rose-500/10 text-rose-600 dark:text-rose-300 border-rose-500/30",
  expirado: "bg-amber-500/10 text-amber-600 dark:text-amber-300 border-amber-500/30",
  convertido: "bg-teal-500/10 text-teal-600 dark:text-teal-300 border-teal-500/30",
};

export function AccountQuotesPage() {
  const { customer } = useCustomerAuth();
  const quotesQuery = useCustomerQuotes(customer?.id);

  useSeoMeta({ title: "Orçamentos · GALLO PARTS" });

  const quotes = quotesQuery.data ?? [];

  return (
    <div className="space-y-5">
      <header className="space-y-1">
        <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground">
          {S.quotesTitle}
        </h1>
        <p className="text-sm text-muted-foreground">{S.quotesSubtitle}</p>
      </header>

      {quotesQuery.isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="h-24 animate-pulse rounded-lg border border-border bg-muted/40"
            />
          ))}
        </div>
      ) : quotes.length === 0 ? (
        <Card className="flex flex-col items-center gap-3 p-10 text-center">
          <Icon icon="mdi:file-document-outline" size={36} className="text-muted-foreground" />
          <div>
            <p className="text-base font-semibold text-foreground">{S.quotesEmptyTitle}</p>
            <p className="mt-1 text-sm text-muted-foreground">{S.quotesEmptyHint}</p>
          </div>
        </Card>
      ) : (
        <div className="space-y-3">
          {quotes.map((quote) => (
            <QuoteCard key={quote.id} quote={quote} />
          ))}
        </div>
      )}
    </div>
  );
}

function QuoteCard({ quote }: { quote: IQuote }) {
  const itemsCount = quote.items.reduce((acc, it) => acc + it.quantity, 0);
  return (
    <Card className="flex flex-col gap-3 p-4 transition-shadow hover:shadow-md sm:flex-row sm:items-center sm:justify-between">
      <div className="flex-1 space-y-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-semibold text-foreground">{quote.number}</p>
          <Badge
            variant="outline"
            className={cn("text-[10px]", QUOTE_STATUS_CLASSES[quote.status])}
          >
            {QUOTE_STATUS_LABEL[quote.status]}
          </Badge>
        </div>
        <p className="text-xs text-muted-foreground">
          {formatDateBR(quote.createdAt)} · {S.quotesCardItems(itemsCount)}
        </p>
        <p className="text-xs text-muted-foreground">
          {S.quotesCardValid(formatDateBR(quote.validUntil))}
        </p>
        <p className="text-sm font-semibold text-foreground">Total: {formatBRL(quote.total)}</p>
      </div>
      <Button asChild variant="outline" size="sm">
        <Link to="/loja/conta/orcamentos/$id" params={{ id: quote.id }}>
          Ver detalhes
          <Icon icon="mdi:arrow-right" size={14} className="ml-1" aria-hidden />
        </Link>
      </Button>
    </Card>
  );
}

export { QUOTE_STATUS_LABEL, QUOTE_STATUS_CLASSES };
