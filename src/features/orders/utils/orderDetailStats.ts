import type { IOrder } from "@/shared/types";
import type { IDetailStat, IStepperStep, IStepperTerminal, StatTone } from "@/shared/detail-views";
import { formatBRL, formatDateBR, formatRelativeTimeBR } from "@/shared/utils/format";
import { computeOrderStatus } from "./orderStatus";

const sumQty = (o: IOrder): number => o.items.reduce((acc, it) => acc + it.quantity, 0);

export const ORDER_PAYMENT_LABEL: Record<IOrder["paymentStatus"], string> = {
  pendente: "Pendente",
  parcial: "Parcial",
  pago: "Pago",
  estornado: "Estornado",
  vencido: "Vencido",
};

export const ORDER_FULFILLMENT_LABEL: Record<IOrder["fulfillmentStatus"], string> = {
  pendente: "Pendente",
  separacao: "Em separação",
  expedido: "Expedido",
  entregue: "Entregue",
  cancelado: "Cancelado",
  devolvido: "Devolvido",
};

/** Resolved commission for the KPI: calculated (from PRD-047) or estimated (preview). */
export interface IOrderCommissionStat {
  value: number;
  calculated: boolean;
}

/** The 5 KPI cells for the order detail page. `commission` is optional (calculated total). */
export function orderDetailStats(
  order: IOrder,
  now: Date,
  commission?: IOrderCommissionStat,
): IDetailStat[] {
  const paid = order.paymentStatus === "pago";
  const paymentTone: StatTone = paid
    ? "good"
    : order.paymentStatus === "vencido" || order.paymentStatus === "estornado"
      ? "bad"
      : "warn";

  const deliveryTone: StatTone =
    order.fulfillmentStatus === "entregue"
      ? "good"
      : order.fulfillmentStatus === "cancelado" || order.fulfillmentStatus === "devolvido"
        ? "bad"
        : order.fulfillmentStatus === "expedido"
          ? "default"
          : "warn";
  const deliverySub = order.deliveredAt
    ? formatRelativeTimeBR(order.deliveredAt, now)
    : order.shippedAt
      ? formatRelativeTimeBR(order.shippedAt, now)
      : "—";

  const lineCount = order.items.length;

  const commissionValue = commission
    ? formatBRL(commission.value)
    : order.commissionPreview
      ? formatBRL(order.commissionPreview.estimatedCommission)
      : "—";
  const commissionSub = commission
    ? commission.calculated
      ? "calculada"
      : "estimada"
    : order.commissionPreview
      ? "estimada"
      : "—";

  return [
    {
      icon: "mdi:cash-check",
      label: "Pagamento",
      value: ORDER_PAYMENT_LABEL[order.paymentStatus],
      sub: paid ? formatBRL(order.total) : `de ${formatBRL(order.total)}`,
      tone: paymentTone,
    },
    {
      icon: "mdi:truck-outline",
      label: "Entrega",
      value: ORDER_FULFILLMENT_LABEL[order.fulfillmentStatus],
      sub: deliverySub,
      tone: deliveryTone,
    },
    {
      icon: "mdi:format-list-numbered",
      label: "Itens",
      value: `${sumQty(order)} peças`,
      sub: `${lineCount} ${lineCount === 1 ? "linha" : "linhas"}`,
    },
    { icon: "mdi:percent-outline", label: "Comissão", value: commissionValue, sub: commissionSub },
    {
      icon: "mdi:calendar-plus",
      label: "Criado",
      value: formatRelativeTimeBR(order.createdAt, now),
      sub: formatDateBR(order.createdAt),
    },
  ];
}

const ORDER_STEP_LABELS: Record<
  | "aguardando_pagamento"
  | "pago_aguardando_envio"
  | "em_separacao"
  | "enviado"
  | "entregue"
  | "concluido",
  string
> = {
  aguardando_pagamento: "Pagamento",
  pago_aguardando_envio: "Pago",
  em_separacao: "Separação",
  enviado: "Enviado",
  entregue: "Entregue",
  concluido: "Concluído",
};

/** Stepper steps for the Operacional layout. Off-path terminal: cancelado / devolvido. */
export function orderStepperSteps(order: IOrder): {
  steps: IStepperStep[];
  terminal: IStepperTerminal | null;
} {
  const agg = computeOrderStatus(order);
  if (agg === "cancelado") {
    return { steps: [], terminal: { label: "Pedido cancelado", tone: "bad" } };
  }
  if (agg === "devolvido") {
    return { steps: [], terminal: { label: "Pedido devolvido", tone: "warn" } };
  }
  const flow = [
    "aguardando_pagamento",
    "pago_aguardando_envio",
    "em_separacao",
    "enviado",
    "entregue",
    "concluido",
  ] as const;
  const currentIdx = flow.indexOf(agg as (typeof flow)[number]);
  const steps: IStepperStep[] = flow.map((s, i) => ({
    key: s,
    label: ORDER_STEP_LABELS[s],
    state: i < currentIdx ? "done" : i === currentIdx ? "current" : "todo",
  }));
  return { steps, terminal: null };
}
