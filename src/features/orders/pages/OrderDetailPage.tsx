import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import { useNavigate, useParams } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { ICustomer, ISeller } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { Button } from "@/components/ui/button";
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
import { canCancelOrder, computeOrderStatus, isOrderEditable } from "../utils/orderStatus";
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
import { useCommissionForOrder } from "@/features/commissions/hooks/useCommissionForOrder";
import { useSettingsProvider } from "@/providers/data/hooks/useSettingsProvider";
import { notifyCustomerOfStatusChange } from "@/features/ecommerce-integration";
import { getCustomerName } from "@/features/customers/utils/customerDisplay";
import {
  CockpitShell,
  DetailCard,
  DetailCustomerCard,
  DetailHistory,
  DetailLayoutSwitcher,
  DetailStatStrip,
  DetailSummaryCard,
  DocumentShell,
  ORDER_DETAIL_LAYOUT_KEY,
  OperationalShell,
  StatusStepper,
  useDetailLayout,
} from "@/shared/detail-views";
import { formatDateTimeBR } from "@/shared/utils/format";
import {
  orderDetailStats,
  orderStepperSteps,
  type IOrderCommissionStat,
} from "../utils/orderDetailStats";
import {
  OrderActions,
  OrderBanners,
  OrderCommissionBlock,
  OrderDeliveryBlock,
  OrderHero,
  OrderPaymentBlock,
} from "../components/detail/OrderDetailBlocks";

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
  const settingsProvider = useSettingsProvider();

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

  const commissionsForOrder = useCommissionForOrder(id, {
    storeId: order?.storeId,
    enabled: Boolean(order),
  });

  const [dialog, setDialog] = useState<OrderDialogKind>(null);

  const [layout, setLayout] = useDetailLayout(ORDER_DETAIL_LAYOUT_KEY);
  const now = useMemo(() => new Date(), []);
  const commissionStat = useMemo<IOrderCommissionStat | undefined>(() => {
    if (commissionsForOrder.hasCommission && commissionsForOrder.commissions.length > 0) {
      const total = commissionsForOrder.commissions.reduce((acc, c) => acc + c.totalCommission, 0);
      return { value: total, calculated: true };
    }
    return undefined;
  }, [commissionsForOrder]);
  const stats = useMemo(
    () => (order ? orderDetailStats(order, now, commissionStat) : []),
    [order, now, commissionStat],
  );
  const stepper = useMemo(
    () => (order ? orderStepperSteps(order) : { steps: [], terminal: null }),
    [order],
  );

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

  // PRD-067 RF-014 — placeholder customer notification on e-commerce status changes.
  const notifyStatus = async (
    status: "paid" | "shipped" | "delivered" | "canceled",
    reason?: string,
  ): Promise<void> => {
    if (!order || order.origin !== "ecommerce") return;
    try {
      const settings = await settingsProvider.get(order.storeId);
      if (!settings.ecommerceIntegration.notifyCustomer) return;
      const customer = await customersProvider.get(order.customerId).catch(() => null);
      notifyCustomerOfStatusChange(
        order,
        status,
        settings.ecommerceIntegration,
        customer ? getCustomerName(customer) : "Cliente",
        reason,
      );
    } catch (err) {
      console.error("[OrderDetailPage] status notification failed", err);
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

  const header = (
    <div className="flex items-center justify-between gap-2">
      <button
        type="button"
        onClick={() => void navigate({ to: "/app/pedidos" })}
        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
      >
        <Icon icon="mdi:chevron-left" size={14} />
        Voltar à listagem
      </button>
      <DetailLayoutSwitcher value={layout} onChange={setLayout} />
    </div>
  );

  const hero = (
    <OrderHero
      order={order}
      agg={agg}
      onViewQuote={() =>
        order.quoteId && void navigate({ to: "/app/orcamentos/$id", params: { id: order.quoteId } })
      }
    />
  );
  const banners = <OrderBanners order={order} />;
  const actions = (
    <OrderActions
      order={order}
      agg={agg}
      canActOnOrder={canActOnOrder}
      cancellable={cancellable}
      isManagerOrOwner={isManagerOrOwner}
      onMarkPaid={() => setDialog("markPaid")}
      onStartFulfillment={() => setDialog("startFulfillment")}
      onShip={() => setDialog("ship")}
      onDeliver={() => setDialog("deliver")}
      onReturn={() => setDialog("return")}
      onInvoice={() => setDialog("invoice")}
      onCancel={() => setDialog("cancel")}
    />
  );

  const items = (
    <DetailCard icon="mdi:format-list-bulleted" title="Itens">
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
            toast.error(err instanceof Error ? err.message : "Falha ao aplicar item ao veículo.");
          }
        }}
      />
    </DetailCard>
  );

  const payment = (
    <OrderPaymentBlock
      order={order}
      canActOnOrder={canActOnOrder}
      isManagerOrOwner={isManagerOrOwner}
      onMarkPaid={() => setDialog("markPaid")}
      onRefund={() => setDialog("refund")}
    />
  );
  const delivery = (
    <OrderDeliveryBlock
      order={order}
      canActOnOrder={canActOnOrder}
      editable={editable}
      onStartFulfillment={() => setDialog("startFulfillment")}
      onShip={() => setDialog("ship")}
      onDeliver={() => setDialog("deliver")}
    />
  );
  const commission = (
    <OrderCommissionBlock
      hasCommission={commissionsForOrder.hasCommission}
      commissions={commissionsForOrder.commissions}
      preview={order.commissionPreview}
    />
  );
  const summary = (
    <DetailSummaryCard
      subtotal={order.subtotal}
      discount={order.discount}
      shipping={order.shipping}
      total={order.total}
    />
  );
  const customerCard = (
    <DetailCustomerCard
      customer={customer}
      name={customerName(customer)}
      deliveryAddress={order.deliveryAddress}
      onOpenFicha={() =>
        customer && void navigate({ to: "/app/clientes/$id", params: { id: customer.id } })
      }
    />
  );
  const history = (
    <DetailHistory
      audits={audits}
      describeAction={describeAction}
      footer={
        seller ? (
          <p className="mt-3 text-[11px] text-muted-foreground">
            Vendedor responsável: <span className="text-foreground">{seller.fullName}</span>
          </p>
        ) : undefined
      }
    />
  );

  const dialogs = (
    <>
      <MarkPaidDialog
        open={dialog === "markPaid"}
        onCancel={() => setDialog(null)}
        onConfirm={() =>
          void wrap(markOrderPaid({ ordersProvider, order }), "Pagamento confirmado.").then((r) => {
            if (r) void notifyStatus("paid");
          })
        }
      />
      <StartFulfillmentDialog
        open={dialog === "startFulfillment"}
        onCancel={() => setDialog(null)}
        onConfirm={() =>
          void wrap(startOrderFulfillment({ ordersProvider, order }), "Separação iniciada.")
        }
      />
      <ShipDialog
        open={dialog === "ship"}
        initialCarrier={order.carrier}
        initialTracking={order.trackingCode}
        onCancel={() => setDialog(null)}
        onConfirm={(payload) =>
          void wrap(shipOrder({ ordersProvider, order, input: payload }), "Pedido enviado.").then(
            (r) => {
              if (r) void notifyStatus("shipped");
            },
          )
        }
      />
      <DeliverDialog
        open={dialog === "deliver"}
        onCancel={() => setDialog(null)}
        onConfirm={() =>
          void wrap(deliverOrder({ ordersProvider, order }), "Entrega confirmada.").then((r) => {
            if (r) void notifyStatus("delivered");
          })
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
          ).then((r) => {
            if (r) void notifyStatus("canceled", reason);
          })
        }
      />
      <RefundDialog
        open={dialog === "refund"}
        onCancel={() => setDialog(null)}
        onConfirm={() => void wrap(refundOrder({ ordersProvider, order }), "Estorno registrado.")}
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
    </>
  );

  let body: ReactNode;
  if (layout === "operational") {
    body = (
      <OperationalShell
        header={header}
        hero={hero}
        stepper={
          <div className="space-y-3">
            <StatusStepper steps={stepper.steps} terminal={stepper.terminal} />
            {banners}
          </div>
        }
        actions={actions}
        grid={
          <>
            {payment}
            {delivery}
            {commission}
          </>
        }
        main={
          <>
            {items}
            {summary}
            {customerCard}
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
              <h1 className="font-mono text-xl font-bold text-foreground">
                #{order.number ?? order.id.replace(/^order-/, "PD-")}
              </h1>
            </div>
            <div className="text-right text-xs text-muted-foreground">
              <p>Criado em {formatDateTimeBR(order.createdAt)}</p>
              <div className="mt-1 flex justify-end">
                <OrderStatusBadge status={agg} />
              </div>
            </div>
          </div>
        }
        parties={
          <div className="grid gap-4 md:grid-cols-2">
            {customerCard}
            <OrderPaymentBlock
              order={order}
              canActOnOrder={false}
              isManagerOrOwner={false}
              onMarkPaid={() => undefined}
              onRefund={() => undefined}
            />
          </div>
        }
        items={items}
        totals={<div className="w-full max-w-xs">{summary}</div>}
        footer={
          <OrderDeliveryBlock
            order={order}
            canActOnOrder={false}
            editable={false}
            onStartFulfillment={() => undefined}
            onShip={() => undefined}
            onDeliver={() => undefined}
          />
        }
      />
    );
  } else {
    body = (
      <CockpitShell
        header={header}
        hero={
          <div className="space-y-3">
            {hero}
            {banners}
          </div>
        }
        kpis={<DetailStatStrip stats={stats} />}
        main={
          <>
            {items}
            {payment}
            {delivery}
            {commission}
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
