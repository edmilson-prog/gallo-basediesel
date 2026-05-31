import type { IOrder, OrderStatus } from "@/shared/types";
import type { IStatCell } from "@/shared/list-views";
import { formatBRL } from "@/shared/utils/format";
import { computeOrderStatus, isPaymentOverdue } from "./orderStatus";

const sumTotal = (list: IOrder[]): number => list.reduce((acc, o) => acc + o.total, 0);

/**
 * The 5 KPI cells for the orders list, computed over `orders` (the pre-status
 * filtered set). `now` is injected for deterministic overdue math.
 */
export function orderStatCells(orders: IOrder[], now: Date): IStatCell[] {
  const active = orders.filter((o) => {
    const s = computeOrderStatus(o);
    return s !== "cancelado" && s !== "devolvido";
  });
  const received = orders.filter((o) => o.paymentStatus === "pago");
  const receivable = orders.filter(
    (o) =>
      o.paymentStatus === "pendente" ||
      o.paymentStatus === "parcial" ||
      o.paymentStatus === "vencido",
  );
  const toShip = orders.filter(
    (o) =>
      !o.canceledAt && (o.fulfillmentStatus === "pendente" || o.fulfillmentStatus === "separacao"),
  ).length;
  const overdue = orders.filter(
    (o) => o.paymentStatus === "vencido" || isPaymentOverdue(o, now),
  ).length;

  return [
    { icon: "mdi:cash-multiple", label: "Valor total", value: formatBRL(sumTotal(active)) },
    {
      icon: "mdi:cash-check",
      label: "Recebido",
      value: formatBRL(sumTotal(received)),
      tone: "good",
    },
    { icon: "mdi:cash-clock", label: "A receber", value: formatBRL(sumTotal(receivable)) },
    {
      icon: "mdi:package-variant",
      label: "A expedir",
      value: toShip,
      tone: toShip > 0 ? "warn" : "default",
    },
    {
      icon: "mdi:alert-circle-outline",
      label: "Vencidos",
      value: overdue,
      tone: overdue > 0 ? "bad" : "default",
    },
  ];
}

/** Count of orders per aggregate status, over the pre-status filtered set (for the tabs). */
export function orderStatusCounts(orders: IOrder[]): Record<OrderStatus, number> {
  const counts: Record<OrderStatus, number> = {
    aguardando_pagamento: 0,
    pago_aguardando_envio: 0,
    em_separacao: 0,
    enviado: 0,
    entregue: 0,
    concluido: 0,
    cancelado: 0,
    devolvido: 0,
  };
  for (const o of orders) counts[computeOrderStatus(o)] += 1;
  return counts;
}
