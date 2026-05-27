import type { IOrder } from "@/shared/types";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/Icon";

type OrderOriginKind = "sdr" | "quote" | "manual" | "ecommerce" | "portal";

const META: Record<OrderOriginKind, { label: string; icon: string; className: string }> = {
  sdr: {
    label: "SDR",
    icon: "mdi:robot-outline",
    className: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-300 border-emerald-500/30",
  },
  quote: {
    label: "Orçamento",
    icon: "mdi:file-document-outline",
    className: "bg-violet-500/10 text-violet-600 dark:text-violet-300 border-violet-500/30",
  },
  manual: {
    label: "Manual",
    icon: "mdi:account-tie-outline",
    className: "bg-sky-500/10 text-sky-600 dark:text-sky-300 border-sky-500/30",
  },
  ecommerce: {
    label: "E-commerce",
    icon: "mdi:cart-outline",
    className: "bg-orange-500/10 text-orange-600 dark:text-orange-300 border-orange-500/30",
  },
  portal: {
    label: "Portal",
    icon: "mdi:domain",
    className: "bg-zinc-500/10 text-zinc-600 dark:text-zinc-300 border-zinc-500/30",
  },
};

/** Determine the user-facing origin kind from an {@link IOrder} (PRD-032). */
export function resolveOrderOriginKind(order: IOrder): OrderOriginKind {
  if (order.conversationId || order.origin === "whatsapp") return "sdr";
  if (order.quoteId) return "quote";
  if (order.origin === "ecommerce") return "ecommerce";
  if (order.origin === "portal") return "portal";
  return "manual";
}

export function OrderOriginBadge({
  order,
  size = "md",
  className,
}: {
  order: IOrder;
  size?: "sm" | "md";
  className?: string;
}) {
  const kind = resolveOrderOriginKind(order);
  const meta = META[kind];
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

export const ORDER_ORIGIN_META = META;
