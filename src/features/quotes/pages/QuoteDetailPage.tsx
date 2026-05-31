import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import { useNavigate, useParams } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { ICustomer, IQuote, ISeller } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { Button } from "@/components/ui/button";
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
import {
  CockpitShell,
  DetailCard,
  DetailCustomerCard,
  DetailHistory,
  DetailLayoutSwitcher,
  DetailStatStrip,
  DetailSummaryCard,
  DocumentShell,
  OperationalShell,
  QUOTE_DETAIL_LAYOUT_KEY,
  StatusStepper,
  useDetailLayout,
} from "@/shared/detail-views";
import { formatDateBR, formatDateTimeBR } from "@/shared/utils/format";
import { useQuote } from "../hooks/useQuotesList";
import { QuoteStatusBadge } from "../components/QuoteStatusBadge";
import { generateQuoteNumber } from "../utils/quoteNumber";
import { quoteDetailStats, quoteStepperSteps } from "../utils/quoteDetailStats";
import {
  QuoteActions,
  QuoteBanners,
  QuoteConditionsBlock,
  QuoteHero,
  QuoteItemsBlock,
} from "../components/detail/QuoteDetailBlocks";
import { createOrderFromQuote } from "@/features/orders/api/createOrderFromQuote";

const moneyFormatter = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
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

  const [confirmOpen, setConfirmOpen] = useState<
    null | "send" | "accept" | "reject" | "convert" | "cancel"
  >(null);
  const [rejectReason, setRejectReason] = useState("");

  const [layout, setLayout] = useDetailLayout(QUOTE_DETAIL_LAYOUT_KEY);
  const now = useMemo(() => new Date(), []);
  const stats = useMemo(() => (quote ? quoteDetailStats(quote, now) : []), [quote, now]);
  const stepper = useMemo(
    () => (quote ? quoteStepperSteps(quote) : { steps: [], terminal: null }),
    [quote],
  );

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
    if (!quote.customerId) {
      toast.error("Cliente não vinculado ao orçamento — converta o lead primeiro.");
      return;
    }
    try {
      const order = await createOrderFromQuote(quote.id, {
        ordersProvider,
        quotesProvider: provider,
      });
      toast.success(`Pedido #${order.number ?? order.id} criado.`);
      await refresh();
      void navigate({ to: "/app/pedidos/$id", params: { id: order.id } });
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "Falha ao converter orçamento em pedido.");
    }
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
  const seller = sellerQuery.data ?? null;
  const audits = auditQuery.data?.data ?? [];

  const isOwnerOfQuote = quote.sellerId === currentUser?.sellerId;
  const canEdit = isManagerOrOwner || isOwnerOfQuote;

  const header = (
    <div className="flex items-center justify-between gap-2">
      <button
        type="button"
        onClick={() => void navigate({ to: "/app/orcamentos" })}
        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
      >
        <Icon icon="mdi:chevron-left" size={14} />
        Voltar à listagem
      </button>
      <DetailLayoutSwitcher value={layout} onChange={setLayout} />
    </div>
  );

  const banners = (
    <QuoteBanners
      quote={quote}
      canApprove={canApprove}
      onApprove={() => void handleApprove()}
      onRejectApproval={() => setConfirmOpen("reject")}
      onViewConversation={() => void navigate({ to: "/app/atendimento" })}
    />
  );

  const actions = (
    <QuoteActions
      quote={quote}
      canEdit={canEdit}
      onSend={() => setConfirmOpen("send")}
      onAccept={() => setConfirmOpen("accept")}
      onReject={() => setConfirmOpen("reject")}
      onCancelSend={() => setConfirmOpen("cancel")}
      onConvert={() => setConfirmOpen("convert")}
      onViewPedido={() => void navigate({ to: "/app/pedidos" })}
      onDuplicate={() => void handleDuplicate()}
      onWhatsapp={handleWhatsappShare}
    />
  );

  const items = <QuoteItemsBlock items={quote.items} />;
  const conditions = <QuoteConditionsBlock quote={quote} seller={seller} />;
  const summary = (
    <DetailSummaryCard
      subtotal={quote.subtotal}
      discount={quote.discount}
      shipping={quote.shipping}
      total={quote.total}
    />
  );
  const customerCard = (
    <DetailCustomerCard
      customer={customer}
      name={customerName(customer)}
      deliveryAddress={quote.deliveryAddress}
      onOpenFicha={() =>
        customer && void navigate({ to: "/app/clientes/$id", params: { id: customer.id } })
      }
    />
  );
  const history = <DetailHistory audits={audits} describeAction={describeAction} />;

  const dialogs = (
    <>
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

      <AlertDialog
        open={confirmOpen === "convert"}
        onOpenChange={(o) => !o && setConfirmOpen(null)}
      >
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
    </>
  );

  let body: ReactNode;
  if (layout === "operational") {
    body = (
      <OperationalShell
        header={header}
        hero={<QuoteHero quote={quote} />}
        stepper={
          <div className="space-y-3">
            <StatusStepper steps={stepper.steps} terminal={stepper.terminal} />
            {banners}
          </div>
        }
        actions={actions}
        grid={
          <>
            {summary}
            {customerCard}
            {conditions}
          </>
        }
        main={
          <>
            {items}
            {history}
          </>
        }
      />
    );
  } else if (layout === "document") {
    body = (
      <DocumentShell
        header={header}
        docHeader={
          <div className="flex items-start justify-between border-b border-border pb-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                GALLO BASE DIESEL
              </p>
              <h1 className="font-mono text-xl font-bold text-foreground">#{quote.number}</h1>
            </div>
            <div className="text-right text-xs text-muted-foreground">
              <p>Criado em {formatDateTimeBR(quote.createdAt)}</p>
              <div className="mt-1 flex justify-end">
                <QuoteStatusBadge status={quote.status} />
              </div>
            </div>
          </div>
        }
        parties={
          <div className="grid gap-4 md:grid-cols-2">
            {customerCard}
            {conditions}
          </div>
        }
        items={items}
        totals={<div className="w-full max-w-xs">{summary}</div>}
        footer={
          <div className="border-t border-border pt-4 text-xs text-muted-foreground">
            <p>Validade: {formatDateBR(quote.validUntil)}</p>
            {quote.notes && <p className="mt-1">Observações: {quote.notes}</p>}
          </div>
        }
      />
    );
  } else {
    body = (
      <CockpitShell
        header={header}
        hero={
          <div className="space-y-3">
            <QuoteHero quote={quote} />
            {banners}
          </div>
        }
        kpis={<DetailStatStrip stats={stats} />}
        main={
          <>
            {items}
            {conditions}
            {history}
          </>
        }
        rail={
          <>
            <DetailCard icon="mdi:lightning-bolt-outline" title="Ações">
              {actions}
            </DetailCard>
            {summary}
            {customerCard}
          </>
        }
      />
    );
  }

  return (
    <>
      {body}
      {dialogs}
    </>
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
