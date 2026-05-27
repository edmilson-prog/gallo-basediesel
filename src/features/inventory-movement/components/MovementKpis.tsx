import { Card } from "@/components/ui/card";
import { Icon } from "@/components/Icon";
import { formatBRL } from "@/shared/utils/format";
import { INVENTORY_MOVEMENT_STRINGS as S } from "../i18n/pt-BR";

export interface IMovementKpis {
  total: number;
  outflowValue: number;
}

export function MovementKpis({ kpis }: { kpis: IMovementKpis }) {
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      <KpiCard
        icon="mdi:swap-vertical-circle-outline"
        label={S.kpiTotal}
        value={kpis.total.toLocaleString("pt-BR")}
      />
      <KpiCard
        icon="mdi:arrow-up-bold-box-outline"
        label={S.kpiOutflow}
        value={formatBRL(kpis.outflowValue)}
        emphasis="destructive"
      />
      <KpiCard icon="mdi:arrow-down-bold-box-outline" label={S.kpiInflow} value="—" placeholder />
      <KpiCard icon="mdi:tune-vertical" label={S.kpiAdjustments} value="—" placeholder />
    </div>
  );
}

function KpiCard({
  icon,
  label,
  value,
  emphasis,
  placeholder = false,
}: {
  icon: string;
  label: string;
  value: string;
  emphasis?: "destructive";
  placeholder?: boolean;
}) {
  return (
    <Card className="flex items-start gap-3 p-4">
      <div
        className={
          placeholder
            ? "grid h-10 w-10 place-items-center rounded-md bg-muted/60 text-muted-foreground"
            : "grid h-10 w-10 place-items-center rounded-md bg-primary/10 text-primary"
        }
      >
        <Icon icon={icon} size={20} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-medium uppercase tracking-wider text-muted-foreground">
          {label}
        </p>
        <div className="mt-1 flex items-baseline gap-2">
          <span
            className={
              emphasis === "destructive"
                ? "text-lg font-semibold text-destructive"
                : placeholder
                  ? "text-lg font-semibold text-muted-foreground"
                  : "text-lg font-semibold text-foreground"
            }
          >
            {value}
          </span>
          {placeholder && (
            <span className="rounded-full border border-border bg-muted/40 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wider text-muted-foreground">
              {S.kpiPlaceholderBadge}
            </span>
          )}
        </div>
        {placeholder && (
          <p className="mt-1 text-[11px] leading-tight text-muted-foreground">
            {S.kpiPlaceholderHint}
          </p>
        )}
      </div>
    </Card>
  );
}
