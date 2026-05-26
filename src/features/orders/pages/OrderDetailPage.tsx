import { useMemo, useState } from "react";
import { useNavigate, useParams } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { ICustomer, IOrder, ISeller } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/features/auth/useAuth";
import { useCurrentRole } from "@/features/rbac/hooks/useCurrentRole";
import { usePermission } from "@/features/rbac/hooks/usePermission";
import { useOrdersProvider } from "@/providers/data/hooks/useOrdersProvider";
import { useCustomersProvider } from "@/providers/data/hooks/useCustomersProvider";
import { useSellersProvider } from "@/providers/data/hooks/useSellersProvider";
import { useAuditsProvider } from "@/providers/data/hooks/useAuditsProvider";
import { useVehiclesProvider } from "@/providers/data/hooks/useVehiclesProvider";
import { useOrder } from "../hooks/useOrdersList";
import { OrderStatusBadge } from "../components/OrderStatusBadge";
import { OrderOriginBadge } from "../components/OrderOriginBadge";
import { OrderItemsTable } from "../components/OrderItemsTable";
import {
  CancelDialog,
  DeliverDialog,
  InvoiceDialog,
  MarkPaidDialog,
  RefundDialog,
  ReturnDialog,
  ShipDialog,
  StartFulfillmentDialog,
  type OrderDialogKind,
} from "../components/OrderActionDialogs";
import {
  canCancelOrder,
  computeOrderStatus,
  isOrderEditable,
} from "../utils/orderStatus";
import {
  cancelOrder,
  deliverOrder,
  generateInvoicePlaceholder,
  markOrderPaid,
  refundOrder,
  returnOrder,
  shipOrder,
  startOrderFulfillment,
} from "../api/orderTransitions";
import { applyOrderItemToVehicle } from "../api/applyItemToVehicle";

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

function customerName(c: ICustomer | undefined): string {
  if (!c) return "—";
  return c.type === "B2B" ? c.nomeFantasia || c.razaoSocial : c.fullName;
}

export function OrderDetailPage() {
  const { id } = useParams({ from: "/app/pedidos/$id" });
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { currentUser } = useAuth();
  const role = useCurrentRole();
  // PRD-032 RF-032: cancelling a paid order requires the broader delete permission;
  // Owner/Gestor have it implicitly. We treat the standard `delete` action as the
  // semantic equivalent of "order.cancel" until a dedicated PermissionAction lands.
  const canCancelPermission = usePermission("order", "delete");
  const isManagerOrOwner = role === "Owner" || role === "Gestor";

  const ordersProvider = useOrdersProvider();
  const customersProvider = useCustomersProvider();
  const sellersProvider = useSellersProvider();
  const auditsProvider = useAuditsProvider();
  const vehiclesProvider = useVehiclesProvider();

  const orderQuery = useOrder(id);
  const order = orderQuery.data;

  const customerQuery = useQuery({
    queryKey: ["customer", order?.customerId] as const,
    queryFn: () => customersProvider.get(order!.customerId),
    enabled: Boolean(order?.customerId),
    staleTime: 60_000,
  });

  const sellerQuery = useQuery({
    queryKey: ["seller", order?.sellerId] as const,
    queryFn: async (): Promise<ISeller | null> => {
      if (!order || order.sellerId === "sdr-agent") return null;
      const all = await sellersProvider.list({});
      return all.find((s) => s.id === order.sellerId) ?? null;
    },
    enabled: Boolean(order),
    staleTime: 60_000,
  });

  const auditQuery = useQuery({
    queryKey: ["audits-order", id] as const,
    queryFn: () =>
      auditsProvider.list({
        resource: "order",
        resourceId: id,
        pageSize: 100,
      }),
    enabled: Boolean(order),
    staleTime: 30_000,
  });

  const [dialog, setDialog] = useState<OrderDialogKind>(null);

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["order", id] }),
      queryClient.invalidateQueries({ queryKey: ["orders-list"] }),
      queryClient.invalidateQueries({ queryKey: ["audits-order", id] }),
      queryClient.invalidateQueries({
        queryKey: ["vehicles-for-order", order?.customerId],
      }),
    ]);
  };

  const wrap = async <T,>(promise: Promise<T>, success: string): Promise<T | null> => {
    try {
      const result = await promise;
      toast.success(success);
      await refresh();
      return result;
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "Falha ao atualizar pedido.");
      return null;
    } finally {
      setDialog(null);
    }
  };

  if (orderQuery.isLoading) {
    return (
      <div className="mx-auto max-w-5xl space-y-4 p-6">
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (orderQuery.isError || !order) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 p-12 text-center">
        <Icon icon="mdi:alert-circle-outline" size={36} className="text-destructive" />
        <p className="text-sm font-semibold text-foreground">Pedido não encontrado</p>
        <Button variant="outline" onClick={() => void navigate({ to: "/app/pedidos" })}>
          Voltar à listagem
        </Button>
      </div>
    );
  }

  const customer = customerQuery.data;
  const seller = sellerQuery.data;
  const audits = auditQuery.data?.data ?? [];
  const agg = computeOrderStatus(order);
  const editable = isOrderEditable(order);
  const cancellable = canCancelOrder(order) && (canCancelPermission || isManagerOrOwner);
  const isOwnerOfOrder = order.sellerId === currentUser?.sellerId;
  const canActOnOrder = isManagerOrOwner || isOwnerOfOrder;

  return (
    <div className="mx-auto w-full max-w-5xl space-y-4 p-4 md:p-8">
      <button
        type="button"
        onClick={() => void navigate({ to: "/app/pedidos" })}
        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
      >
        <Icon icon="mdi:chevron-left" size={14} />
        Voltar à listagem
      </button>

      {/* 1 — Header */}
      <Card className="p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-2">
            <h1 className="font-mono text-2xl font-bold tracking-tight text-foreground">
              #{order.number ?? order.id.replace(/^order-/, "PD-")}
            </h1>
            <div className="flex flex-wrap items-center gap-2">
              <OrderStatusBadge status={agg} />
              <OrderOriginBadge order={order} />
              {order.quoteId && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() =>
                    void navigate({
                      to: "/app/orcamentos/$id",
                      params: { id: order.quoteId! },
                    })
                  }
                  className="h-6 gap-1 px-1.5 text-[11px]"
                >
                  <Icon icon="mdi:file-document-outline" size={12} />
                  Orçamento de origem
                </Button>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              Criado em {dateTimeFormatter.format(new Date(order.createdAt))}
              {order.updatedAt !== order.createdAt && (
                <> · atualizado {dateTimeFormatter.format(new Date(order.updatedAt))}</>
              )}
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs text-muted-foreground">Total</p>
            <p className="text-3xl font-bold tabular-nums text-foreground">
              {moneyFormatter.format(order.total)}
            </p>
          </div>
        </div>

        {/* Cancellation banner */}
        {order.canceledAt && (
          <div className="mt-4 flex items-start gap-2 rounded-md border border-rose-500/30 bg-rose-500/5 p-3 text-sm">
            <Icon icon="mdi:close-circle-outline" size={18} className="mt-0.5 text-rose-600" />
            <div className="flex-1 text-rose-700 dark:text-rose-200">
              <p className="font-medium">Pedido cancelado</p>
              {order.cancelReason && (
                <p className="text-xs">Motivo: {order.cancelReason}</p>
              )}
              <p className="text-[11px] opacity-80">
                {dateTimeFormatter.format(new Date(order.canceledAt))}
              </p>
            </div>
          </div>
        )}

        {/* Contextual actions */}
        <div className="mt-4 flex flex-wrap gap-2">
          {canActOnOrder && agg === "aguardando_pagamento" && (
            <Button size="sm" onClick={() => setDialog("markPaid")}>
              <Icon icon="mdi:cash-check" size={14} /> Marcar como pago
            </Button>
          )}
          {canActOnOrder && agg === "pago_aguardando_envio" && (
            <Button size="sm" onClick={() => setDialog("startFulfillment")}>
              <Icon icon="mdi:package-variant" size={14} /> Iniciar separação
            </Button>
          )}
          {canActOnOrder && agg === "em_separacao" && (
            <Button size="sm" onClick={() => setDialog("ship")}>
              <Icon icon="mdi:truck-fast-outline" size={14} /> Marcar como enviado
            </Button>
          )}
          {canActOnOrder && agg === "enviado" && (
            <Button size="sm" onClick={() => setDialog("deliver")}>
              <Icon icon="mdi:package-variant-closed-check" size={14} /> Marcar entregue
            </Button>
          )}
          {canActOnOrder && (agg === "entregue" || agg === "concluido") && !order.canceledAt && (
            <Button size="sm" variant="outline" onClick={() => setDialog("return")}>
              <Icon icon="mdi:keyboard-return" size={14} /> Registrar devolução
            </Button>
          )}
          {/* NF placeholder */}
          {isManagerOrOwner &&
            order.paymentStatus === "pago" &&
            order.fulfillmentStatus !== "devolvido" &&
            !order.nfNumber && (
              <Button size="sm" variant="outline" onClick={() => setDialog("invoice")}>
                <Icon icon="mdi:receipt-text-outline" size={14} /> Gerar NF
              </Button>
            )}
          {/* Cancel */}
          {canActOnOrder && cancellable && (
            <Button
              size="sm"
              variant="outline"
              className="text-rose-600 hover:bg-rose-500/10"
              onClick={() => setDialog("cancel")}
            >
              <Icon icon="mdi:close-circle-outline" size={14} /> Cancelar pedido
            </Button>
          )}
          {!cancellable &&
            canActOnOrder &&
            !order.canceledAt &&
            (order.fulfillmentStatus === "expedido" ||
              order.fulfillmentStatus === "entregue") && (
              <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                <Icon icon="mdi:lock-outline" size={12} />
                Pedido já enviado — use "Registrar devolução".
              </span>
            )}
        </div>
      </Card>

      {/* 2 — Cliente */}
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
              {order.deliveryAddress && (
                <p className="mt-2 text-xs text-muted-foreground">
                  <Icon icon="mdi:map-marker-outline" size={12} className="mr-1 inline" />
                  {order.deliveryAddress.street}, {order.deliveryAddress.number} —{" "}
                  {order.deliveryAddress.district}, {order.deliveryAddress.city}/
                  {order.deliveryAddress.state}
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

      {/* 3 — Items */}
      <Card className="p-5">
        <SectionHeader icon="mdi:format-list-bulleted" title="Items" />
        <OrderItemsTable
          order={order}
          readOnly={!canActOnOrder}
          onApplyVehicle={async (itemId, vehicleId) => {
            try {
              await applyOrderItemToVehicle({
                ordersProvider,
                vehiclesProvider,
                order,
                itemId,
                vehicleId,
              });
              toast.success(
                vehicleId
                  ? "Aplicação registrada — histórico do veículo atualizado."
                  : "Aplicação removida.",
              );
              await refresh();
            } catch (err) {
              console.error(err);
              toast.error(
                err instanceof Error ? err.message : "Falha ao aplicar item ao veículo.",
              );
            }
          }}
        />
        <ValueSummary order={order} />
      </Card>

      {/* 4 — Pagamento */}
      <Card className="p-5">
        <SectionHeader icon="mdi:credit-card-outline" title="Pagamento" />
        <dl className="grid gap-3 text-sm md:grid-cols-3">
          <div>
            <dt className="text-xs text-muted-foreground">Método</dt>
            <dd className="font-medium text-foreground">{order.paymentMethod ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Prazo</dt>
            <dd className="font-medium text-foreground">
              {order.paymentTerms ?? order.paymentCondition}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Status</dt>
            <dd className="font-medium text-foreground">{paymentLabel(order.paymentStatus)}</dd>
          </div>
          {order.paidAt && (
            <div>
              <dt className="text-xs text-muted-foreground">Pago em</dt>
              <dd className="font-medium text-foreground">
                {dateTimeFormatter.format(new Date(order.paidAt))}
              </dd>
            </div>
          )}
          {order.nfNumber && (
            <div>
              <dt className="text-xs text-muted-foreground">NF</dt>
              <dd className="font-medium text-foreground">#{order.nfNumber}</dd>
            </div>
          )}
        </dl>
        {canActOnOrder && !order.canceledAt && (
          <div className="mt-3 flex flex-wrap gap-2">
            {order.paymentStatus === "pendente" && (
              <Button size="sm" onClick={() => setDialog("markPaid")}>
                <Icon icon="mdi:cash-check" size={14} /> Marcar como pago
              </Button>
            )}
            {isManagerOrOwner &&
              (order.paymentStatus === "pago" || order.paymentStatus === "parcial") &&
              order.fulfillmentStatus !== "devolvido" && (
                <Button size="sm" variant="outline" onClick={() => setDialog("refund")}>
                  <Icon icon="mdi:cash-refund" size={14} /> Refund (placeholder)
                </Button>
              )}
          </div>
        )}
      </Card>

      {/* 5 — Entrega */}
      <Card className="p-5">
        <SectionHeader icon="mdi:truck-fast-outline" title="Entrega" />
        <dl className="grid gap-3 text-sm md:grid-cols-3">
          <div>
            <dt className="text-xs text-muted-foreground">Status</dt>
            <dd className="font-medium text-foreground">
              {fulfillmentLabel(order.fulfillmentStatus)}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Transportadora</dt>
            <dd className="font-medium text-foreground">{order.carrier ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Rastreamento</dt>
            <dd className="font-mono text-xs text-foreground">{order.trackingCode ?? "—"}</dd>
          </div>
          {order.shippedAt && (
            <div>
              <dt className="text-xs text-muted-foreground">Enviado em</dt>
              <dd className="font-medium text-foreground">
                {dateTimeFormatter.format(new Date(order.shippedAt))}
              </dd>
            </div>
          )}
          {order.deliveredAt && (
            <div>
              <dt className="text-xs text-muted-foreground">Entregue em</dt>
              <dd className="font-medium text-foreground">
                {dateTimeFormatter.format(new Date(order.deliveredAt))}
              </dd>
            </div>
          )}
          {order.returnedAt && (
            <div>
              <dt className="text-xs text-muted-foreground">Devolvido em</dt>
              <dd className="font-medium text-foreground">
                {dateTimeFormatter.format(new Date(order.returnedAt))}
              </dd>
            </div>
          )}
          {order.returnReason && (
            <div className="md:col-span-3">
              <dt className="text-xs text-muted-foreground">Motivo da devolução</dt>
              <dd className="text-foreground">{order.returnReason}</dd>
            </div>
          )}
        </dl>
        {canActOnOrder && editable && order.fulfillmentStatus === "pendente" && order.paymentStatus === "pago" && (
          <div className="mt-3">
            <Button size="sm" variant="outline" onClick={() => setDialog("startFulfillment")}>
              <Icon icon="mdi:package-variant" size={14} /> Iniciar separação
            </Button>
          </div>
        )}
        {canActOnOrder && order.fulfillmentStatus === "separacao" && (
          <div className="mt-3">
            <Button size="sm" variant="outline" onClick={() => setDialog("ship")}>
              <Icon icon="mdi:truck-fast-outline" size={14} /> Marcar como enviado
            </Button>
          </div>
        )}
        {canActOnOrder && order.fulfillmentStatus === "expedido" && (
          <div className="mt-3">
            <Button size="sm" variant="outline" onClick={() => setDialog("deliver")}>
              <Icon icon="mdi:package-variant-closed-check" size={14} /> Marcar como entregue
            </Button>
          </div>
        )}
      </Card>

      {/* 6 — Comissão Preview */}
      <Card className="p-5">
        <SectionHeader icon="mdi:percent-outline" title="Comissão (Preview)" />
        {order.commissionPreview ? (
          <>
            <dl className="grid gap-3 text-sm md:grid-cols-3">
              <div>
                <dt className="text-xs text-muted-foreground">Base</dt>
                <dd className="font-medium text-foreground">
                  {moneyFormatter.format(order.commissionPreview.baseValue)}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Taxa</dt>
                <dd className="font-medium text-foreground">
                  {(order.commissionPreview.commissionRate * 100).toFixed(1)}%
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Estimativa</dt>
                <dd className="font-semibold text-foreground">
                  {moneyFormatter.format(order.commissionPreview.estimatedCommission)}
                </dd>
              </div>
              {order.commissionPreview.rules.length > 0 && (
                <div className="md:col-span-3">
                  <dt className="text-xs text-muted-foreground">Regras aplicadas</dt>
                  <dd className="text-xs text-foreground">
                    <ul className="ml-4 list-disc space-y-0.5">
                      {order.commissionPreview.rules.map((r) => (
                        <li key={r}>{r}</li>
                      ))}
                    </ul>
                  </dd>
                </div>
              )}
            </dl>
            <div className="mt-3 flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-700 dark:text-amber-200">
              <Icon icon="mdi:alert-outline" size={14} className="mt-0.5" />
              <p>
                Preview informativo — cálculo definitivo, com regras complexas (metas, splits,
                bônus), chega no PRD-047 (Onda 2).
              </p>
            </div>
          </>
        ) : (
          <p className="text-xs text-muted-foreground">
            Comissão será calculada quando o pedido for criado a partir de um orçamento.
          </p>
        )}
      </Card>

      {/* 7 — Histórico */}
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
        {seller && (
          <p className="mt-3 text-[11px] text-muted-foreground">
            Vendedor responsável: <span className="text-foreground">{seller.fullName}</span>
          </p>
        )}
      </Card>

      {/* Dialogs */}
      <MarkPaidDialog
        open={dialog === "markPaid"}
        onCancel={() => setDialog(null)}
        onConfirm={() =>
          void wrap(markOrderPaid({ ordersProvider, order }), "Pagamento confirmado.")
        }
      />
      <StartFulfillmentDialog
        open={dialog === "startFulfillment"}
        onCancel={() => setDialog(null)}
        onConfirm={() =>
          void wrap(
            startOrderFulfillment({ ordersProvider, order }),
            "Separação iniciada.",
          )
        }
      />
      <ShipDialog
        open={dialog === "ship"}
        initialCarrier={order.carrier}
        initialTracking={order.trackingCode}
        onCancel={() => setDialog(null)}
        onConfirm={(payload) =>
          void wrap(
            shipOrder({ ordersProvider, order, input: payload }),
            "Pedido enviado.",
          )
        }
      />
      <DeliverDialog
        open={dialog === "deliver"}
        onCancel={() => setDialog(null)}
        onConfirm={() =>
          void wrap(deliverOrder({ ordersProvider, order }), "Entrega confirmada.")
        }
      />
      <ReturnDialog
        open={dialog === "return"}
        onCancel={() => setDialog(null)}
        onConfirm={(reason) =>
          void wrap(
            returnOrder({ ordersProvider, order, input: { reason } }),
            "Devolução registrada.",
          )
        }
      />
      <CancelDialog
        open={dialog === "cancel"}
        postPayment={order.paymentStatus === "pago" || order.paymentStatus === "parcial"}
        onCancel={() => setDialog(null)}
        onConfirm={(reason) =>
          void wrap(
            cancelOrder({
              ordersProvider,
              order,
              input: { reason, actorId: currentUser?.id },
            }),
            "Pedido cancelado.",
          )
        }
      />
      <RefundDialog
        open={dialog === "refund"}
        onCancel={() => setDialog(null)}
        onConfirm={() =>
          void wrap(refundOrder({ ordersProvider, order }), "Estorno registrado.")
        }
      />
      <InvoiceDialog
        open={dialog === "invoice"}
        onCancel={() => setDialog(null)}
        onConfirm={() =>
          void wrap(
            generateInvoicePlaceholder({ ordersProvider, order }),
            "Nota fiscal gerada (placeholder).",
          )
        }
      />
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

function ValueSummary({ order }: { order: IOrder }) {
  return (
    <div className="mt-3 space-y-1 text-sm">
      <div className="flex justify-between text-muted-foreground">
        <span>Subtotal</span>
        <span className="tabular-nums">{moneyFormatter.format(order.subtotal)}</span>
      </div>
      <div className="flex justify-between text-muted-foreground">
        <span>Desconto</span>
        <span className="tabular-nums">-{moneyFormatter.format(order.discount)}</span>
      </div>
      <div className="flex justify-between text-muted-foreground">
        <span>Frete</span>
        <span className="tabular-nums">+{moneyFormatter.format(order.shipping)}</span>
      </div>
      <div className="flex justify-between border-t border-border pt-2 text-base font-semibold text-foreground">
        <span>Total</span>
        <span className="tabular-nums">{moneyFormatter.format(order.total)}</span>
      </div>
    </div>
  );
}

function paymentLabel(status: IOrder["paymentStatus"]): string {
  switch (status) {
    case "pago":
      return "Pago";
    case "parcial":
      return "Parcial";
    case "pendente":
      return "Pendente";
    case "estornado":
      return "Estornado";
    case "vencido":
      return "Vencido";
  }
}

function fulfillmentLabel(status: IOrder["fulfillmentStatus"]): string {
  switch (status) {
    case "entregue":
      return "Entregue";
    case "expedido":
      return "Expedido";
    case "separacao":
      return "Em separação";
    case "pendente":
      return "Pendente";
    case "cancelado":
      return "Cancelado";
    case "devolvido":
      return "Devolvido";
  }
}

function describeAction(action: string): string {
  const map: Record<string, string> = {
    order_create: "Pedido criado",
    order_payment_status_change: "Pagamento atualizado",
    order_fulfillment_status_change: "Entrega atualizada",
    order_payment_refund: "Estorno registrado",
    order_invoice_generate: "NF gerada",
    order_cancel: "Pedido cancelado",
    order_return: "Devolução registrada",
    order_address_update: "Endereço de entrega alterado",
    order_vehicle_apply: "Item aplicado a veículo",
    order_vehicle_unapply: "Aplicação removida",
    sdr_order_stub_created: "Pedido criado pelo SDR",
    create: "Criado",
    update: "Atualizado",
    delete: "Excluído",
  };
  return map[action] ?? action;
}
