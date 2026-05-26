import type { QuoteOrigin } from "@/shared/types";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/Icon";

const ORIGIN_META: Record<QuoteOrigin, { label: string; icon: string; className: string }> = {
  sdr: {
    label: "SDR",
    icon: "mdi:robot-outline",
    className: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-300 border-emerald-500/30",
  },
  vendedor: {
    label: "Manual",
    icon: "mdi:account-tie-outline",
    className: "bg-sky-500/10 text-sky-600 dark:text-sky-300 border-sky-500/30",
  },
  cliente_portal: {
    label: "Portal",
    icon: "mdi:domain",
    className: "bg-orange-500/10 text-orange-600 dark:text-orange-300 border-orange-500/30",
  },
  ecommerce: {
    label: "E-commerce",
    icon: "mdi:cart-outline",
    className: "bg-violet-500/10 text-violet-600 dark:text-violet-300 border-violet-500/30",
  },
};

export function QuoteOriginBadge({
  origin,
  size = "md",
  className,
}: {
  origin: QuoteOrigin;
  size?: "sm" | "md";
  className?: string;
}) {
  const meta = ORIGIN_META[origin];
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

export const QUOTE_ORIGIN_META = ORIGIN_META;
