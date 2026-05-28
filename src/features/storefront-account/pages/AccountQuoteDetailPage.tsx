import { useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { IQuoteItem } from "@/shared/types";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Icon } from "@/components/Icon";
import { useQuotesProvider } from "@/providers/data/hooks/useQuotesProvider";
import { useOrdersProvider } from "@/providers/data/hooks/useOrdersProvider";
import { createOrderFromQuote } from "@/features/orders/api/createOrderFromQuote";
import { useSeoMeta } from "@/features/storefront/hooks/useSeoMeta";
import { formatBRL, formatDateBR } from "@/shared/utils/format";
import { cn } from "@/lib/utils";
import { useCustomerAuth } from "../hooks/useCustomerAuth";
import { QUOTE_STATUS_CLASSES, QUOTE_STATUS_LABEL } from "./AccountQuotesPage";
import { STOREFRONT_ACCOUNT_STRINGS as S } from "../i18n/pt-BR";

export interface IAccountQuoteDetailPageProps {
  quoteId: string;
}

export function AccountQuoteDetailPage({ quoteId }: IAccountQuoteDetailPageProps) {
  const { customer } = useCustomerAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const quotesProvider = useQuotesProvider();
  const ordersProvider = useOrdersProvider();
  const [accepting, setAccepting] = useState(false);

  const quoteQuery = useQuery({
    queryKey: ["customer-account", "quote-detail", quoteId] as const,
    staleTime: 30_000,
    queryFn: () => quotesProvider.get(quoteId),
    retry: false,
  });

  useSeoMeta({ title: `Orçamento ${quoteQuery.data?.number ?? ""} · GALLO PARTS` });

  if (quoteQuery.isLoading) {
    return <div className="h-64 animate-pulse rounded-lg border border-border bg-muted/40" />;
  }
  if (!quoteQuery.data) {
    return <NotFound message={S.quoteDetailNotFound} />;
  }

  const quote = quoteQuery.data;
  if (customer && quote.customerId !== customer.id) {
    return <NotFound message={S.quoteDetailNotYours} />;
  }

  const isExpired = quote.status === "expirado" || Date.parse(quote.validUntil) < Date.now();
  const isAccepted = quote.status === "aceito" || quote.status === "convertido";
  const canAccept = quote.status === "enviado" && !isExpired;

  const handleAccept = async () => {
    if (!canAccept || accepting) return;
    setAccepting(true);
    toast.loading(S.quoteDetailAcceptingToast, { id: "accept-quote" });
    try {
      await quotesProvider.update(quote.id, { status: "aceito" });
      const order = await createOrderFromQuote(quote.id, {
        ordersProvider,
        quotesProvider,
        extras: { origin: "ecommerce" },
        actorId: customer?.id,
      });
      toast.success(S.quoteDetailAcceptedToast, { id: "accept-quote" });
      void queryClient.invalidateQueries({ queryKey: ["customer-account"] });
      void navigate({ to: "/loja/conta/pedidos/$id", params: { id: order.id } });
    } catch (err) {
      console.error("[AccountQuoteDetailPage] accept failed", err);
      toast.error("Não foi possível aceitar o orçamento.", { id: "accept-quote" });
    } finally {
      setAccepting(false);
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <Button asChild variant="ghost" size="sm">
          <Link to="/loja/conta/orcamentos">
            <Icon icon="mdi:arrow-left" size={14} className="mr-1" aria-hidden />
            {S.quoteDetailBack}
          </Link>
        </Button>
      </div>

      <Card className="space-y-3 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <h1 className="font-display text-xl font-semibold text-foreground sm:text-2xl">
              {S.quoteDetailHeader(quote.number)}
            </h1>
            <p className="text-xs text-muted-foreground">
              Emitido em {formatDateBR(quote.createdAt)} ·{" "}
              {S.quoteDetailValidity(formatDateBR(quote.validUntil))}
            </p>
          </div>
          <Badge variant="outline" className={cn("text-xs", QUOTE_STATUS_CLASSES[quote.status])}>
            {QUOTE_STATUS_LABEL[quote.status]}
          </Badge>
        </div>

        {canAccept ? (
          <Button onClick={handleAccept} disabled={accepting}>
            <Icon icon="mdi:check-bold" size={16} className="mr-2" aria-hidden />
            {S.quoteDetailAccept}
          </Button>
        ) : isAccepted ? (
          <p className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-700 dark:text-emerald-300">
            {S.quoteDetailAlreadyAccepted}
          </p>
        ) : isExpired ? (
          <p className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
            {S.quoteDetailExpired}
          </p>
        ) : null}
      </Card>

      <Card className="space-y-3 p-5">
        <h2 className="text-sm font-semibold text-foreground">{S.quoteDetailItems}</h2>
        <ul className="divide-y divide-border">
          {quote.items.map((item) => (
            <QuoteItemRow key={item.id} item={item} />
          ))}
        </ul>
      </Card>

      <Card className="space-y-2 p-5">
        <h2 className="text-sm font-semibold text-foreground">Resumo</h2>
        <dl className="grid gap-1 text-sm">
          <Row label="Subtotal" value={formatBRL(quote.subtotal)} />
          {quote.discount > 0 && <Row label="Desconto" value={`- ${formatBRL(quote.discount)}`} />}
          <Row label="Frete" value={formatBRL(quote.shipping)} />
          <Row label="Total" value={formatBRL(quote.total)} bold />
          {quote.paymentCondition && <Row label="Pagamento" value={quote.paymentCondition} />}
        </dl>
      </Card>
    </div>
  );
}

function QuoteItemRow({ item }: { item: IQuoteItem }) {
  return (
    <li className="flex items-center justify-between gap-3 py-3">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-foreground">{item.partName}</p>
        <p className="text-xs text-muted-foreground">
          SKU {item.partSku} · {item.quantity}x {formatBRL(item.unitPrice)}
        </p>
      </div>
      <p className="text-sm font-semibold text-foreground">{formatBRL(item.total)}</p>
    </li>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-xs uppercase tracking-wider text-muted-foreground">{label}</dt>
      <dd className={bold ? "text-base font-semibold text-foreground" : "text-foreground"}>
        {value}
      </dd>
    </div>
  );
}

function NotFound({ message }: { message: string }) {
  return (
    <Card className="flex flex-col items-center gap-3 p-10 text-center">
      <Icon icon="mdi:alert-circle-outline" size={32} className="text-muted-foreground" />
      <p className="text-sm text-foreground">{message}</p>
      <Button asChild variant="outline" size="sm">
        <Link to="/loja/conta/orcamentos">
          <Icon icon="mdi:arrow-left" size={14} className="mr-1" aria-hidden />
          {S.quoteDetailBack}
        </Link>
      </Button>
    </Card>
  );
}
