import { Icon } from "@/components/Icon";
import { cn } from "@/lib/utils";
import type { IProductIndicator } from "@/shared/types";
import { indicatorsPtBR as S } from "../i18n/pt-BR";

export const LIFECYCLE_COLORS: Record<IProductIndicator["status"], string> = {
  ativo: "bg-primary/10 text-primary border-primary/40",
  concluido: "border-severity-success/40 bg-severity-success/10 text-severity-success",
  arquivado: "bg-muted text-muted-foreground border-border",
  cancelado: "border-severity-critical/40 bg-severity-critical/10 text-severity-critical",
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
