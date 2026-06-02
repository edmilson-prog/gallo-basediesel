import { Icon } from "@/components/Icon";
import { cn } from "@/lib/utils";
import type { IProductIndicator } from "@/shared/types";
import { indicatorsPtBR as S } from "../i18n/pt-BR";

export const LIFECYCLE_COLORS: Record<IProductIndicator["status"], string> = {
  ativo: "bg-primary/10 text-primary border-primary/40",
  concluido: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/40",
  arquivado: "bg-muted text-muted-foreground border-border",
  cancelado: "bg-red-500/10 text-red-700 dark:text-red-300 border-red-500/40",
};

export const LIFECYCLE_ICONS: Record<IProductIndicator["status"], string> = {
  ativo: "mdi:play-circle-outline",
  concluido: "mdi:trophy-outline",
  arquivado: "mdi:archive-outline",
  cancelado: "mdi:close-circle-outline",
};

export function IndicatorLifecycleBadge({ status }: { status: IProductIndicator["status"] }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium",
        LIFECYCLE_COLORS[status],
      )}
    >
      <Icon icon={LIFECYCLE_ICONS[status]} size={13} />
      {S.lifecycleStatus[status]}
    </span>
  );
}
