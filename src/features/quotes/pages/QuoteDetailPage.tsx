import { useMemo, useState } from "react";
import { useNavigate, useParams } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { ICustomer, IQuote, ISeller } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useAuth } from "@/features/auth/useAuth";
import { useCurrentRole } from "@/features/rbac/hooks/useCurrentRole";
import { usePermission } from "@/features/rbac/hooks/usePermission";
import { useQuotesProvider } from "@/providers/data/hooks/useQuotesProvider";
import { useCustomersProvider } from "@/providers/data/hooks/useCustomersProvider";
import { useSellersProvider } from "@/providers/data/hooks/useSellersProvider";
import { useAuditsProvider } from "@/providers/data/hooks/useAuditsProvider";
import { useOrdersProvider } from "@/providers/data/hooks/useOrdersProvider";
import { auditLog } from "@/features/rbac/utils/auditLog";
import { useQuote } from "../hooks/useQuotesList";
import { QuoteStatusBadge } from "../components/QuoteStatusBadge";
import { QuoteOriginBadge } from "../components/QuoteOriginBadge";
import { ValidityIndicator } from "../components/ValidityIndicator";
import { generateQuoteNumber } from "../utils/quoteNumber";

const moneyFormatter = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

const dateTimeFormatter = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  year: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

const dateFormatter = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

function customerName(c: ICustomer | undefined): string {
  if (!c) return "—";
  return c.type === "B2B" ? c.nomeFantasia || c.razaoSocial : c.fullName;
}

function buildWhatsappText(quote: IQuote, customer: ICustomer | undefined): string {
  const lines = [
    "🧾 Orçamento GALLO BASE DIESEL",
    `Número: #${quote.number}`,
    customer ? `Cliente: ${customerName(customer)}` : "",
    "",
    "Items:",
    ...quote.items.map(
      (it) => `• ${it.partName} (qtd ${it.quantity}) — ${moneyFormatter.format(it.total)}`,
    ),
    "",
    `Subtotal: ${moneyFormatter.format(quote.subtotal)}`,
    quote.discount > 0 ? `Desconto: -${moneyFormatter.format(quote.discount)}` : "",
    `Frete: ${moneyFormatter.format(quote.shipping)}`,
    `Total: ${moneyFormatter.format(quote.total)}`,
    "",
    `Válido até: ${dateFormatter.format(new Date(quote.validUntil))}`,
  ];
  return lines.filter(Boolean).join("\n");
}

export function QuoteDetailPage() {
  const { id } = useParams({ from: "/app/orcamentos/$id" });
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { currentUser } = useAuth();
  const role = useCurrentRole();
  const canApprove = usePermission("quote", "approve");
  const provider = useQuotesProvider();
  const customersProvider = useCustomersProvider();
  const sellersProvider = useSellersProvider();
  const auditsProvider = useAuditsProvider();
  const ordersProvider = useOrdersProvider();
  const isManagerOrOwner = role === "Owner" || role === "Gestor";

  const quoteQuery = useQuote(id);
  const quote = quoteQuery.data;

  const customerQuery = useQuery({
    queryKey: ["customer", quote?.customerId] as const,
    queryFn: () => customersProvider.get(quote!.customerId!),
    enabled: Boolean(quote?.customerId),
    staleTime: 60_000,
  });

  const sellerQuery = useQuery({
    queryKey: ["seller", quote?.sellerId] as const,
    queryFn: async (): Promise<ISeller | null> => {
      if (!quote || quote.sellerId === "sdr-agent") return null;
      const all = await sellersProvider.list({});
      return all.find((s) => s.id === quote.sellerId) ?? null;
    },
    enabled: Boolean(quote),
    staleTime: 60_000,
  });

  const auditQuery = useQuery({
    queryKey: ["audits-quote", id] as const,
    queryFn: () =>
      auditsProvider.list({
        resource: "quote",
        resourceId: id,
        pageSize: 100,
      }),
    enabled: Boolean(quote),
    staleTime: 30_000,
  });

  const [confirmOpen, setConfirmOpen] = useState<null | "send" | "accept" | "reject" | "convert" | "cancel">(null);
  const [rejectReason, setRejectReason] = useState("");

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["quote", id] }),
      queryClient.invalidateQueries({ queryKey: ["quotes-list"] }),
      queryClient.invalidateQueries({ queryKey: ["audits-quote", id] }),
    ]);
  };

  // --- Actions ---
  const handleSend = async () => {
    if (!quote) return;
    if (quote.requiresApproval && !quote.approvedAt) {
      toast.error("Aprovação do gestor pendente antes de enviar.");
      return;
    }
    await provider.update(quote.id, { status: "enviado" });
    auditLog({
      action: "quote_status_change",
      resource: "quote",
      resourceId: quote.id,
      before: { status: quote.status },
      after: { status: "enviado" },
    });
    toast.success("Orçamento enviado.");
    await refresh();
  };

  const handleAccept = async () => {
    if (!quote) return;
    await provider.update(quote.id, { status: "aceito" });
    auditLog({
      action: "quote_status_change",
      resource: "quote",
      resourceId: quote.id,
      before: { status: quote.status },
      after: { status: "aceito" },
    });
    toast.success("Orçamento marcado como aceito.");
    await refresh();
  };

  const handleReject = async () => {
    if (!quote) return;
    await provider.update(quote.id, {
      status: "recusado",
      notes: rejectReason ? `[Recusa] ${rejectReason}` : quote.notes,
    });
    auditLog({
      action: "quote_status_change",
      resource: "quote",
      resourceId: quote.id,
      before: { status: quote.status },
      after: { status: "recusado", reason: rejectReason || undefined },
    });
    setRejectReason("");
    toast.success("Orçamento recusado.");
    await refresh();
  };

  const handleCancel = async () => {
    if (!quote) return;
    await provider.update(quote.id, { status: "rascunho" });
    auditLog({
      action: "quote_status_change",
      resource: "quote",
      resourceId: quote.id,
      before: { status: quote.status },
      after: { status: "rascunho", cancelled: true },
    });
    toast.success("Envio cancelado — voltando a rascunho.");
    await refresh();
  };

  const handleApprove = async () => {
    if (!quote) return;
    const now = new Date().toISOString();
    await provider.update(quote.id, {
      requiresApproval: false,
      approvedBy: currentUser?.sellerId ?? currentUser?.id ?? "system",
      approvedAt: now,
      rejectedReason: undefined,
    });
    auditLog({
      action: "quote_approval_approve",
      resource: "quote",
      resourceId: quote.id,
      after: { approvedAt: now },
    });
    toast.success("Desconto aprovado.");
    await refresh();
  };

  const handleRejectApproval = async () => {
    if (!quote) return;
    await provider.update(quote.id, {
      requiresApproval: true,
      rejectedReason: rejectReason || "Desconto fora dos parâmetros.",
    });
    auditLog({
      action: "quote_approval_reject",
      resource: "quote",
      resourceId: quote.id,
      after: { reason: rejectReason },
    });
    setRejectReason("");
    toast.success("Aprovação rejeitada — vendedor foi notificado.");
    await refresh();
  };

  const handleDuplicate = async () => {
    if (!quote) return;
    const allQuotes = await provider.list({ pageSize: 1000 });
    const newNumber = generateQuoteNumber(allQuotes.data, quote.storeId);
    const now = new Date();
    const validity = new Date(now.getTime() + 7 * 86400_000).toISOString();
    const created = await provider.create({
      ...quote,
      number: newNumber,
      status: "rascunho",
      requiresApproval: false,
      approvedBy: undefined,
      approvedAt: undefined,
      rejectedReason: undefined,
      convertedToOrderId: undefined,
      convertedAt: undefined,
      validUntil: validity,
      sellerId: currentUser?.sellerId ?? quote.sellerId,
      origin: "vendedor",
      conversationId: undefined,
    } as Omit<IQuote, "id" | "createdAt" | "updatedAt">);
    auditLog({
      action: "quote_duplicate",
      resource: "quote",
      resourceId: created.id,
      after: { sourceQuoteId: quote.id, number: created.number },
    });
    toast.success(`Orçamento duplicado: #${created.number}`);
    void navigate({ to: "/app/orcamentos/$id", params: { id: created.id } });
  };

  const handleConvertToOrder = async () => {
    if (!quote) return;
    const orderItems = quote.items.map((it) => ({
      id: `oi-${crypto.randomUUID()}`,
      partId: it.partId,
      partSku: it.partSku,
      partName: it.partName,
      quantity: it.quantity,
      unitPrice: it.unitPrice,
      unitCost: it.unitPrice * 0.7,
      discount: it.discount,
      total: it.total,
      marginValue: it.total - it.quantity * it.unitPrice * 0.7,
    }));
    const order = await ordersProvider.create({
      storeId: quote.storeId,
      customerId: quote.customerId ?? "",
      sellerId: quote.sellerId,
      quoteId: quote.id,
      items: orderItems,
      subtotal: quote.subtotal,
      discount: quote.discount,
      shipping: quote.shipping,
      total: quote.total,
      paymentCondition: quote.paymentCondition,
      paymentStatus: "pendente",
      fulfillmentStatus: "pendente",
      origin: "manual",
      division: quote.division,
    });
    const now = new Date().toISOString();
    await provider.update(quote.id, {
      status: "convertido",
      convertedToOrderId: order.id,
      convertedAt: now,
    });
    auditLog({
      action: "quote_convert_to_order",
      resource: "quote",
      resourceId: quote.id,
      after: { orderId: order.id },
    });
    toast.success(`Pedido criado a partir do orçamento.`);
    await refresh();
    void navigate({ to: "/app/pedidos" });
  };

  const handleWhatsappShare = () => {
    if (!quote) return;
    const text = buildWhatsappText(quote, customerQuery.data);
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      void navigator.clipboard.writeText(text);
    }
    auditLog({
      action: "quote_whatsapp_share",
      resource: "quote",
      resourceId: quote.id,
    });
    toast.success("Texto copiado — cole no WhatsApp do cliente.");
  };

  // --- Render ---
  if (quoteQuery.isLoading) {
    return (
      <div className="mx-auto max-w-5xl space-y-4 p-6">
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (quoteQuery.isError || !quote) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 p-12 text-center">
        <Icon icon="mdi:alert-circle-outline" size={36} className="text-destructive" />
        <p className="text-sm font-semibold text-foreground">Orçamento não encontrado</p>
        <Button variant="outline" onClick={() => void navigate({ to: "/app/orcamentos" })}>
          Voltar à listagem
        </Button>
      </div>
    );
  }

  const customer = customerQuery.data;
  const seller = sellerQuery.data;
  const audits = auditQuery.data?.data ?? [];

  const isRascunho = quote.status === "rascunho";
  const isEnviado = quote.status === "enviado";
  const isAceito = quote.status === "aceito";
  const isConvertido = quote.status === "convertido";
  const isOwnerOfQuote = quote.sellerId === currentUser?.sellerId;
  const canEdit = isManagerOrOwner || isOwnerOfQuote;

  return (
    <div className="mx-auto w-full max-w-5xl space-y-4 p-4 md:p-8">
      <button
        type="button"
        onClick={() => void navigate({ to: "/app/orcamentos" })}
        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
      >
        <Icon icon="mdi:chevron-left" size={14} />
        Voltar à listagem
      </button>

      {/* Section 1 — Header */}
      <Card className="p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-2">
            <h1 className="font-mono text-2xl font-bold tracking-tight text-foreground">
              #{quote.number}
            </h1>
            <div className="flex flex-wrap items-center gap-2">
              <QuoteStatusBadge status={quote.status} />
              <QuoteOriginBadge origin={quote.origin} />
              <ValidityIndicator validUntil={quote.validUntil} />
            </div>
            <p className="text-xs text-muted-foreground">
              Criado em {dateTimeFormatter.format(new Date(quote.createdAt))}
              {quote.updatedAt !== quote.createdAt && (
                <> · atualizado {dateTimeFormatter.format(new Date(quote.updatedAt))}</>
              )}
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs text-muted-foreground">Total</p>
            <p className="text-3xl font-bold tabular-nums text-foreground">
              {moneyFormatter.format(quote.total)}
            </p>
          </div>
        </div>

        {/* Origin banner — SDR */}
        {quote.origin === "sdr" && (
          <div className="mt-4 flex items-center gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/5 p-3 text-sm">
            <Icon icon="mdi:robot-outline" size={18} className="text-emerald-600 dark:text-emerald-300" />
            <span className="flex-1 text-emerald-700 dark:text-emerald-200">
              Criado pelo agente SDR durante a conversa do cliente.
            </span>
            {quote.conversationId && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => void navigate({ to: "/app/atendimento" })}
              >
                Ver conversa
                <Icon icon="mdi:open-in-new" size={14} />
              </Button>
            )}
          </div>
        )}

        {/* Approval banner */}
        {quote.requiresApproval && (
          <div className="mt-4 flex flex-col gap-3 rounded-md border border-orange-500/30 bg-orange-500/5 p-3 md:flex-row md:items-center md:justify-between">
            <div className="flex items-start gap-2 text-sm">
              <Icon icon="mdi:shield-alert-outline" size={18} className="text-orange-600 dark:text-orange-300" />
              <div>
                <p className="font-medium text-orange-700 dark:text-orange-200">
                  Aguardando aprovação do gestor
                </p>
                {quote.discountReason && (
                  <p className="text-xs text-orange-700/80 dark:text-orange-200/80">
                    Justificativa: {quote.discountReason}
                  </p>
                )}
                {quote.rejectedReason && (
                  <p className="text-xs text-rose-600 dark:text-rose-300">
                    Rejeitado anteriormente: {quote.rejectedReason}
                  </p>
                )}
              </div>
            </div>
            {canApprove && (
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => setConfirmOpen("reject")}>
                  Rejeitar
                </Button>
                <Button size="sm" onClick={() => void handleApprove()}>
                  Aprovar
                </Button>
              </div>
            )}
          </div>
        )}

        {/* Actions contextual */}
        <div className="mt-4 flex flex-wrap gap-2">
          {isRascunho && canEdit && (
            <Button size="sm" onClick={() => setConfirmOpen("send")} disabled={quote.requiresApproval}>
              <Icon icon="mdi:send-outline" size={14} /> Enviar
            </Button>
          )}
          {isEnviado && canEdit && (
            <>
              <Button size="sm" onClick={() => setConfirmOpen("accept")}>
                <Icon icon="mdi:check" size={14} /> Marcar aceito
              </Button>
              <Button size="sm" variant="outline" onClick={() => setConfirmOpen("reject")}>
                <Icon icon="mdi:close" size={14} /> Marcar recusado
              </Button>
              <Button size="sm" variant="outline" onClick={() => setConfirmOpen("cancel")}>
                <Icon icon="mdi:undo-variant" size={14} /> Cancelar envio
              </Button>
            </>
          )}
          {isAceito && canEdit && (
            <Button size="sm" onClick={() => setConfirmOpen("convert")}>
              <Icon icon="mdi:swap-horizontal-bold" size={14} /> Converter em pedido
            </Button>
          )}
          {isConvertido && (
            <Button size="sm" variant="outline" onClick={() => void navigate({ to: "/app/pedidos" })}>
              <Icon icon="mdi:open-in-new" size={14} /> Ver pedido
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={() => void handleDuplicate()}>
            <Icon icon="mdi:content-duplicate" size={14} /> Duplicar
          </Button>
          <Button size="sm" variant="outline" onClick={handleWhatsappShare}>
            <Icon icon="mdi:whatsapp" size={14} /> Enviar via WhatsApp
          </Button>
        </div>
      </Card>

      {/* Section 2 — Cliente */}
      <Card className="p-5">
        <SectionHeader icon="mdi:account-outline" title="Cliente" />
        {customer ? (
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-foreground">{customerName(customer)}</p>
              <p className="text-xs text-muted-foreground">
                {customer.type === "B2B" ? `CNPJ ${customer.cnpj}` : `CPF ${customer.cpf}`}
                {" · "}
                {customer.phone}
                {customer.email && <> · {customer.email}</>}
              </p>
              {quote.deliveryAddress && (
                <p className="mt-2 text-xs text-muted-foreground">
                  <Icon icon="mdi:map-marker-outline" size={12} className="mr-1 inline" />
                  {quote.deliveryAddress.street}, {quote.deliveryAddress.number} —{" "}
                  {quote.deliveryAddress.district}, {quote.deliveryAddress.city}/
                  {quote.deliveryAddress.state}
                </p>
              )}
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                void navigate({
                  to: "/app/clientes/$id",
                  params: { id: customer.id },
                })
              }
            >
              <Icon icon="mdi:account-eye-outline" size={14} /> Abrir ficha
            </Button>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">Cliente não encontrado.</p>
        )}
      </Card>

      {/* Section 3 — Items */}
      <Card className="p-5">
        <SectionHeader icon="mdi:format-list-bulleted" title="Items" />
        <div className="overflow-hidden rounded-md border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left">Peça</th>
                <th className="w-20 px-3 py-2 text-right">Qtd.</th>
                <th className="w-28 px-3 py-2 text-right">Unit.</th>
                <th className="w-24 px-3 py-2 text-right">Desc.</th>
                <th className="w-28 px-3 py-2 text-right">Subtotal</th>
              </tr>
            </thead>
            <tbody>
              {quote.items.map((it) => (
                <tr key={it.id} className="border-t border-border">
                  <td className="px-3 py-2">
                    <p className="text-sm font-medium text-foreground">{it.partName}</p>
                    <p className="text-[10px] text-muted-foreground">SKU {it.partSku}</p>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{it.quantity}</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {moneyFormatter.format(it.unitPrice)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {it.discount > 0 ? `-${moneyFormatter.format(it.discount)}` : "—"}
                  </td>
                  <td className="px-3 py-2 text-right font-semibold tabular-nums">
                    {moneyFormatter.format(it.total)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Section 4 — Valores */}
      <Card className="p-5">
        <SectionHeader icon="mdi:cash-multiple" title="Valores" />
        <div className="space-y-1 text-sm">
          <div className="flex justify-between text-muted-foreground">
            <span>Subtotal</span>
            <span className="tabular-nums">{moneyFormatter.format(quote.subtotal)}</span>
          </div>
          <div className="flex justify-between text-muted-foreground">
            <span>
              Desconto{" "}
              {quote.subtotal > 0 && (
                <span className="ml-1 text-[10px]">
                  ({((quote.discount / quote.subtotal) * 100).toFixed(1)}%)
                </span>
              )}
            </span>
            <span className="tabular-nums">-{moneyFormatter.format(quote.discount)}</span>
          </div>
          {quote.discountReason && (
            <p className="ml-4 text-[11px] italic text-muted-foreground">
              Justificativa: {quote.discountReason}
            </p>
          )}
          <div className="flex justify-between text-muted-foreground">
            <span>Frete</span>
            <span className="tabular-nums">+{moneyFormatter.format(quote.shipping)}</span>
          </div>
          <div className="flex justify-between border-t border-border pt-2 text-base font-semibold text-foreground">
            <span>Total</span>
            <span className="tabular-nums">{moneyFormatter.format(quote.total)}</span>
          </div>
        </div>
      </Card>

      {/* Section 5 — Condições */}
      <Card className="p-5">
        <SectionHeader icon="mdi:credit-card-outline" title="Condições" />
        <dl className="grid gap-3 text-sm md:grid-cols-3">
          <div>
            <dt className="text-xs text-muted-foreground">Forma de pagamento</dt>
            <dd className="font-medium text-foreground">{quote.paymentMethod ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Prazo</dt>
            <dd className="font-medium text-foreground">{quote.paymentTerms ?? quote.paymentCondition}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Validade</dt>
            <dd className="font-medium text-foreground">
              {dateFormatter.format(new Date(quote.validUntil))}
            </dd>
          </div>
          {seller && (
            <div>
              <dt className="text-xs text-muted-foreground">Vendedor</dt>
              <dd className="font-medium text-foreground">{seller.fullName}</dd>
            </div>
          )}
          {quote.notes && (
            <div className="md:col-span-3">
              <dt className="text-xs text-muted-foreground">Notas internas</dt>
              <dd className="text-foreground">{quote.notes}</dd>
            </div>
          )}
        </dl>
      </Card>

      {/* Section 6 — Histórico */}
      <Card className="p-5">
        <SectionHeader icon="mdi:history" title="Histórico" />
        {audits.length === 0 ? (
          <p className="text-xs text-muted-foreground">Sem eventos registrados ainda.</p>
        ) : (
          <ol className="space-y-2">
            {audits.map((a) => (
              <li
                key={a.id}
                className="flex items-start gap-3 border-l-2 border-border pl-3 text-xs"
              >
                <Icon
                  icon="mdi:circle-medium"
                  size={14}
                  className="-ml-[18px] mt-0.5 text-primary"
                />
                <div className="flex-1">
                  <p className="font-medium text-foreground">{describeAction(a.action)}</p>
                  <p className="text-muted-foreground">
                    {dateTimeFormatter.format(new Date(a.timestamp))} · {a.actorId}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        )}
      </Card>

      {/* Confirm dialogs */}
      <AlertDialog open={confirmOpen === "send"} onOpenChange={(o) => !o && setConfirmOpen(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Enviar orçamento?</AlertDialogTitle>
            <AlertDialogDescription>
              O status passará para "Enviado". Você poderá registrar a resposta do cliente depois.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setConfirmOpen(null);
                void handleSend();
              }}
            >
              Enviar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmOpen === "accept"} onOpenChange={(o) => !o && setConfirmOpen(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Marcar como aceito?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação confirma que o cliente aceitou o orçamento por algum canal. Em seguida você
              poderá convertê-lo em pedido.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setConfirmOpen(null);
                void handleAccept();
              }}
            >
              Confirmar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmOpen === "reject"} onOpenChange={(o) => !o && setConfirmOpen(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {quote.requiresApproval ? "Rejeitar desconto?" : "Marcar como recusado?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {quote.requiresApproval
                ? "O vendedor será notificado e poderá ajustar o desconto antes de submeter novamente."
                : "Registre o motivo da recusa para histórico (opcional)."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Textarea
            placeholder="Motivo (opcional)"
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
          />
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setRejectReason("")}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setConfirmOpen(null);
                if (quote.requiresApproval) void handleRejectApproval();
                else void handleReject();
              }}
            >
              Confirmar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmOpen === "cancel"} onOpenChange={(o) => !o && setConfirmOpen(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancelar envio?</AlertDialogTitle>
            <AlertDialogDescription>
              O orçamento voltará ao status "Rascunho" e poderá ser editado ou reenviado.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setConfirmOpen(null);
                void handleCancel();
              }}
            >
              Cancelar envio
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmOpen === "convert"} onOpenChange={(o) => !o && setConfirmOpen(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Converter em pedido?</AlertDialogTitle>
            <AlertDialogDescription>
              Um pedido será criado a partir deste orçamento, mantendo os mesmos items e condições.
              O orçamento será marcado como "Convertido".
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setConfirmOpen(null);
                void handleConvertToOrder();
              }}
            >
              Converter
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function SectionHeader({ icon, title }: { icon: string; title: string }) {
  return (
    <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
      <Icon icon={icon} size={16} className="text-muted-foreground" />
      {title}
    </h2>
  );
}

function describeAction(action: string): string {
  const map: Record<string, string> = {
    quote_create: "Orçamento criado",
    quote_update: "Orçamento atualizado",
    quote_status_change: "Status alterado",
    quote_approval_approve: "Desconto aprovado",
    quote_approval_reject: "Desconto rejeitado",
    quote_convert_to_order: "Convertido em pedido",
    quote_expired: "Expirado automaticamente",
    quote_duplicate: "Orçamento duplicado",
    quote_whatsapp_share: "Compartilhado via WhatsApp",
    create: "Criado",
    update: "Atualizado",
    delete: "Excluído",
  };
  return map[action] ?? action;
}
