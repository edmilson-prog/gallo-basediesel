import type { OrderStatus } from "@/shared/types";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/Icon";

const STATUS_META: Record<
  OrderStatus,
  { label: string; icon: string; className: string }
> = {
  aguardando_pagamento: {
    label: "Aguardando pagamento",
    icon: "mdi:clock-outline",
    className: "bg-amber-500/10 text-amber-600 dark:text-amber-300 border-amber-500/30",
  },
  pago_aguardando_envio: {
    label: "Pago — aguardando envio",
    icon: "mdi:cash-check",
    className: "bg-blue-500/10 text-blue-600 dark:text-blue-300 border-blue-500/30",
  },
  em_separacao: {
    label: "Em separação",
    icon: "mdi:package-variant",
    className: "bg-violet-500/10 text-violet-600 dark:text-violet-300 border-violet-500/30",
  },
  enviado: {
    label: "Enviado",
    icon: "mdi:truck-fast-outline",
    className: "bg-sky-500/10 text-sky-600 dark:text-sky-300 border-sky-500/30",
  },
  entregue: {
    label: "Entregue",
    icon: "mdi:package-variant-closed-check",
    className: "bg-teal-500/10 text-teal-600 dark:text-teal-300 border-teal-500/30",
  },
  concluido: {
    label: "Concluído",
    icon: "mdi:check-circle-outline",
    className: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-300 border-emerald-500/30",
  },
  cancelado: {
    label: "Cancelado",
    icon: "mdi:close-circle-outline",
    className: "bg-rose-500/10 text-rose-600 dark:text-rose-300 border-rose-500/30",
  },
  devolvido: {
    label: "Devolvido",
    icon: "mdi:keyboard-return",
    className: "bg-orange-500/10 text-orange-600 dark:text-orange-300 border-orange-500/30",
  },
};

export function OrderStatusBadge({
  status,
  size = "md",
  className,
}: {
  status: OrderStatus;
  size?: "sm" | "md";
  className?: string;
}) {
  const meta = STATUS_META[status];
  const sizing = size === "sm" ? "text-[10px] px-1.5 py-0.5 gap-1" : "text-xs px-2 py-0.5 gap-1.5";
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md border font-medium",
        sizing,
        meta.className,
        className,
      )}
    >
      <Icon icon={meta.icon} size={size === "sm" ? 12 : 14} />
      {meta.label}
    </span>
  );
}

export const ORDER_STATUS_META = STATUS_META;
