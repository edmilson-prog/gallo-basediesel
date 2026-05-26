import type { QuoteStatus } from "@/shared/types";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/Icon";

const STATUS_META: Record<QuoteStatus, { label: string; icon: string; className: string }> = {
  rascunho: {
    label: "Rascunho",
    icon: "mdi:file-document-edit-outline",
    className: "bg-muted text-muted-foreground border-border",
  },
  enviado: {
    label: "Enviado",
    icon: "mdi:send-outline",
    className: "bg-blue-500/10 text-blue-600 dark:text-blue-300 border-blue-500/30",
  },
  aceito: {
    label: "Aceito",
    icon: "mdi:check-circle-outline",
    className: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-300 border-emerald-500/30",
  },
  recusado: {
    label: "Recusado",
    icon: "mdi:close-circle-outline",
    className: "bg-rose-500/10 text-rose-600 dark:text-rose-300 border-rose-500/30",
  },
  expirado: {
    label: "Expirado",
    icon: "mdi:clock-alert-outline",
    className: "bg-orange-500/10 text-orange-600 dark:text-orange-300 border-orange-500/30",
  },
  convertido: {
    label: "Convertido",
    icon: "mdi:swap-horizontal-bold",
    className: "bg-violet-500/10 text-violet-600 dark:text-violet-300 border-violet-500/30",
  },
};

export function QuoteStatusBadge({
  status,
  size = "md",
  className,
}: {
  status: QuoteStatus;
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

export const QUOTE_STATUS_META = STATUS_META;
