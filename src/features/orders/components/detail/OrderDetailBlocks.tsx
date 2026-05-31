import type { ICommission, ICommissionPreview, IOrder, OrderStatus } from "@/shared/types";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/Icon";
import { cn } from "@/lib/utils";
import { formatBRL, formatDateTimeBR } from "@/shared/utils/format";
import { DetailCard } from "@/shared/detail-views";
import { OrderStatusBadge } from "../OrderStatusBadge";
import { OrderOriginBadge } from "../OrderOriginBadge";
import { ORDER_FULFILLMENT_LABEL, ORDER_PAYMENT_LABEL } from "../../utils/orderDetailStats";

export interface IOrderHeroProps {
  order: IOrder;
  agg: OrderStatus;
  onViewQuote: () => void;
}

export function OrderHero({ order, agg, onViewQuote }: IOrderHeroProps) {
  return (
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
                onClick={onViewQuote}
                className="h-6 gap-1 px-1.5 text-[11px]"
              >
                <Icon icon="mdi:file-document-outline" size={12} />
                Orçamento de origem
              </Button>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            Criado em {formatDateTimeBR(order.createdAt)}
            {order.updatedAt !== order.createdAt && (
              <> · atualizado {formatDateTimeBR(order.updatedAt)}</>
            )}
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs text-muted-foreground">Total</p>
          <p className="text-3xl font-bold tabular-nums text-foreground">
            {formatBRL(order.total)}
          </p>
        </div>
      </div>
    </Card>
  );
}

/** Cancellation banner. Returns null unless the order is canceled. */
export function OrderBanners({ order }: { order: IOrder }) {
  if (!order.canceledAt) return null;
  return (
    <div className="flex items-start gap-2 rounded-md border border-rose-500/30 bg-rose-500/5 p-3 text-sm">
      <Icon icon="mdi:close-circle-outline" size={18} className="mt-0.5 text-rose-600" />
      <div className="flex-1 text-rose-700 dark:text-rose-200">
        <p className="font-medium">Pedido cancelado</p>
        {order.cancelReason && <p className="text-xs">Motivo: {order.cancelReason}</p>}
        <p className="text-[11px] opacity-80">{formatDateTimeBR(order.canceledAt)}</p>
      </div>
    </div>
  );
}

export interface IOrderActionsProps {
  order: IOrder;
  agg: OrderStatus;
  canActOnOrder: boolean;
  cancellable: boolean;
  isManagerOrOwner: boolean;
  onMarkPaid: () => void;
  onStartFulfillment: () => void;
  onShip: () => void;
  onDeliver: () => void;
  onReturn: () => void;
  onInvoice: () => void;
  onCancel: () => void;
  className?: string;
}

export function OrderActions({
  order,
  agg,
  canActOnOrder,
  cancellable,
  isManagerOrOwner,
  onMarkPaid,
  onStartFulfillment,
  onShip,
  onDeliver,
  onReturn,
  onInvoice,
  onCancel,
  className,
}: IOrderActionsProps) {
  return (
    <div className={cn("flex flex-wrap gap-2", className)}>
      {canActOnOrder && agg === "aguardando_pagamento" && (
        <Button size="sm" onClick={onMarkPaid}>
          <Icon icon="mdi:cash-check" size={14} /> Marcar como pago
        </Button>
      )}
      {canActOnOrder && agg === "pago_aguardando_envio" && (
        <Button size="sm" onClick={onStartFulfillment}>
          <Icon icon="mdi:package-variant" size={14} /> Iniciar separação
        </Button>
      )}
      {canActOnOrder && agg === "em_separacao" && (
        <Button size="sm" onClick={onShip}>
          <Icon icon="mdi:truck-fast-outline" size={14} /> Marcar como enviado
        </Button>
      )}
      {canActOnOrder && agg === "enviado" && (
        <Button size="sm" onClick={onDeliver}>
          <Icon icon="mdi:package-variant-closed-check" size={14} /> Marcar entregue
        </Button>
      )}
      {canActOnOrder && (agg === "entregue" || agg === "concluido") && !order.canceledAt && (
        <Button size="sm" variant="outline" onClick={onReturn}>
          <Icon icon="mdi:keyboard-return" size={14} /> Registrar devolução
        </Button>
      )}
      {isManagerOrOwner &&
        order.paymentStatus === "pago" &&
        order.fulfillmentStatus !== "devolvido" &&
        !order.nfNumber && (
          <Button size="sm" variant="outline" onClick={onInvoice}>
            <Icon icon="mdi:receipt-text-outline" size={14} /> Gerar NF
          </Button>
        )}
      {canActOnOrder && cancellable && (
        <Button
          size="sm"
          variant="outline"
          className="text-rose-600 hover:bg-rose-500/10"
          onClick={onCancel}
        >
          <Icon icon="mdi:close-circle-outline" size={14} /> Cancelar pedido
        </Button>
      )}
      {!cancellable &&
        canActOnOrder &&
        !order.canceledAt &&
        (order.fulfillmentStatus === "expedido" || order.fulfillmentStatus === "entregue") && (
          <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
            <Icon icon="mdi:lock-outline" size={12} />
            Pedido já enviado — use "Registrar devolução".
          </span>
        )}
    </div>
  );
}

export interface IOrderPaymentBlockProps {
  order: IOrder;
  canActOnOrder: boolean;
  isManagerOrOwner: boolean;
  onMarkPaid: () => void;
  onRefund: () => void;
}

export function OrderPaymentBlock({
  order,
  canActOnOrder,
  isManagerOrOwner,
  onMarkPaid,
  onRefund,
}: IOrderPaymentBlockProps) {
  return (
    <DetailCard icon="mdi:credit-card-outline" title="Pagamento">
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
          <dd className="font-medium text-foreground">
            {ORDER_PAYMENT_LABEL[order.paymentStatus]}
          </dd>
        </div>
        {order.paidAt && (
          <div>
            <dt className="text-xs text-muted-foreground">Pago em</dt>
            <dd className="font-medium text-foreground">{formatDateTimeBR(order.paidAt)}</dd>
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
            <Button size="sm" onClick={onMarkPaid}>
              <Icon icon="mdi:cash-check" size={14} /> Marcar como pago
            </Button>
          )}
          {isManagerOrOwner &&
            (order.paymentStatus === "pago" || order.paymentStatus === "parcial") &&
            order.fulfillmentStatus !== "devolvido" && (
              <Button size="sm" variant="outline" onClick={onRefund}>
                <Icon icon="mdi:cash-refund" size={14} /> Refund (placeholder)
              </Button>
            )}
        </div>
      )}
    </DetailCard>
  );
}

export interface IOrderDeliveryBlockProps {
  order: IOrder;
  canActOnOrder: boolean;
  editable: boolean;
  onStartFulfillment: () => void;
  onShip: () => void;
  onDeliver: () => void;
}

export function OrderDeliveryBlock({
  order,
  canActOnOrder,
  editable,
  onStartFulfillment,
  onShip,
  onDeliver,
}: IOrderDeliveryBlockProps) {
  return (
    <DetailCard icon="mdi:truck-fast-outline" title="Entrega">
      <dl className="grid gap-3 text-sm md:grid-cols-3">
        <div>
          <dt className="text-xs text-muted-foreground">Status</dt>
          <dd className="font-medium text-foreground">
            {ORDER_FULFILLMENT_LABEL[order.fulfillmentStatus]}
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
            <dd className="font-medium text-foreground">{formatDateTimeBR(order.shippedAt)}</dd>
          </div>
        )}
        {order.deliveredAt && (
          <div>
            <dt className="text-xs text-muted-foreground">Entregue em</dt>
            <dd className="font-medium text-foreground">{formatDateTimeBR(order.deliveredAt)}</dd>
          </div>
        )}
        {order.returnedAt && (
          <div>
            <dt className="text-xs text-muted-foreground">Devolvido em</dt>
            <dd className="font-medium text-foreground">{formatDateTimeBR(order.returnedAt)}</dd>
          </div>
        )}
        {order.returnReason && (
          <div className="md:col-span-3">
            <dt className="text-xs text-muted-foreground">Motivo da devolução</dt>
            <dd className="text-foreground">{order.returnReason}</dd>
          </div>
        )}
      </dl>
      {canActOnOrder &&
        editable &&
        order.fulfillmentStatus === "pendente" &&
        order.paymentStatus === "pago" && (
          <div className="mt-3">
            <Button size="sm" variant="outline" onClick={onStartFulfillment}>
              <Icon icon="mdi:package-variant" size={14} /> Iniciar separação
            </Button>
          </div>
        )}
      {canActOnOrder && order.fulfillmentStatus === "separacao" && (
        <div className="mt-3">
          <Button size="sm" variant="outline" onClick={onShip}>
            <Icon icon="mdi:truck-fast-outline" size={14} /> Marcar como enviado
          </Button>
        </div>
      )}
      {canActOnOrder && order.fulfillmentStatus === "expedido" && (
        <div className="mt-3">
          <Button size="sm" variant="outline" onClick={onDeliver}>
            <Icon icon="mdi:package-variant-closed-check" size={14} /> Marcar como entregue
          </Button>
        </div>
      )}
    </DetailCard>
  );
}

export interface IOrderCommissionBlockProps {
  hasCommission: boolean;
  commissions: ICommission[];
  preview?: ICommissionPreview;
}

/** Commission block — verbatim from the current page Section 6, props instead of closures. */
export function OrderCommissionBlock({
  hasCommission,
  commissions,
  preview,
}: IOrderCommissionBlockProps) {
  return (
    <DetailCard
      icon="mdi:percent-outline"
      title={hasCommission ? "Comissão calculada" : "Comissão (Preview)"}
    >
      {hasCommission ? (
        <div className="space-y-3">
          {commissions.map((c) => (
            <div key={c.id} className="rounded-md border border-border bg-muted/40 p-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-foreground">
                    {formatBRL(c.totalCommission)}
                  </span>
                  {c.isSplit && (
                    <span className="rounded bg-warning/15 px-1.5 py-0.5 text-xs text-warning-foreground">
                      Split
                    </span>
                  )}
                  {c.goalBonus > 0 && (
                    <span className="rounded bg-success/15 px-1.5 py-0.5 text-xs text-success-foreground">
                      +Bônus meta
                    </span>
                  )}
                </div>
                <span className="text-xs text-muted-foreground">
                  Status: <span className="font-medium text-foreground">{c.status}</span>
                </span>
              </div>
              <dl className="mt-2 grid gap-2 text-xs md:grid-cols-4">
                <div>
                  <dt className="text-muted-foreground">Base</dt>
                  <dd className="font-medium text-foreground">{formatBRL(c.baseValue)}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Taxa</dt>
                  <dd className="font-medium text-foreground">{(c.rate * 100).toFixed(2)}%</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Base × Taxa</dt>
                  <dd className="font-medium text-foreground">{formatBRL(c.baseCommission)}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Bônus meta</dt>
                  <dd className="font-medium text-foreground">{formatBRL(c.goalBonus)}</dd>
                </div>
              </dl>
              {c.ruleSnapshot && (
                <p className="mt-2 text-xs text-muted-foreground">
                  Regra: <span className="text-foreground">{c.ruleSnapshot.name}</span>
                </p>
              )}
            </div>
          ))}
        </div>
      ) : preview ? (
        <>
          <dl className="grid gap-3 text-sm md:grid-cols-3">
            <div>
              <dt className="text-xs text-muted-foreground">Base</dt>
              <dd className="font-medium text-foreground">{formatBRL(preview.baseValue)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Taxa</dt>
              <dd className="font-medium text-foreground">
                {(preview.commissionRate * 100).toFixed(1)}%
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Estimativa</dt>
              <dd className="font-semibold text-foreground">
                {formatBRL(preview.estimatedCommission)}
              </dd>
            </div>
            {preview.rules.length > 0 && (
              <div className="md:col-span-3">
                <dt className="text-xs text-muted-foreground">Regras aplicadas</dt>
                <dd className="text-xs text-foreground">
                  <ul className="ml-4 list-disc space-y-0.5">
                    {preview.rules.map((r) => (
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
              Pedido ainda não confirmado como pago — após pagamento, a comissão definitiva
              (PRD-047) é gerada automaticamente.
            </p>
          </div>
        </>
      ) : (
        <p className="text-xs text-muted-foreground">
          Comissão será calculada quando o pedido for criado a partir de um orçamento.
        </p>
      )}
    </DetailCard>
  );
}
