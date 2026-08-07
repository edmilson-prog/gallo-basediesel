import { Card } from "@/components/ui/card";
import { Icon } from "@/components/Icon";
import { cn } from "@/lib/utils";
import type { ITrendInfo } from "@/features/manager-dashboard/utils/kpiMath";
import { formatBRL } from "@/shared/utils/format";
import { EXECUTIVE_COCKPIT_STRINGS as S } from "../i18n/pt-BR";

export interface IComparativoRow {
  label: string;
  current: number;
  previous: number;
  trend: ITrendInfo;
  isCurrency?: boolean;
}

export interface IComparativoCardProps {
  title?: string;
  rows: IComparativoRow[];
  comparisonLabel: string;
}

function formatValue(value: number, currency: boolean): string {
  if (currency) return formatBRL(value);
  return value.toLocaleString("pt-BR");
}

function colorClass(trend: ITrendInfo): string {
  if (trend.direction === "flat") return "text-muted-foreground";
  return trend.isImprovement
    ? "text-severity-success"
    : "text-severity-critical";
}

function arrowIcon(trend: ITrendInfo): string {
  if (trend.direction === "up") return "mdi:arrow-top-right";
  if (trend.direction === "down") return "mdi:arrow-bottom-right";
  return "mdi:minus";
}

export function ComparativoCard({
  title = S.comparisonTitle,
  rows,
  comparisonLabel,
}: IComparativoCardProps) {
  return (
    <Card className="flex h-full flex-col gap-3 p-5">
      <header className="flex items-baseline justify-between">
        <h2 className="text-base font-semibold tracking-tight text-foreground">{title}</h2>
        <Icon icon="mdi:scale-balance" size={20} className="text-muted-foreground" />
      </header>
      <ul className="flex flex-col gap-3" aria-label={title}>
        {rows.map((row) => (
          <li
            key={row.label}
            className="flex flex-col gap-1 rounded-md border border-border/60 bg-muted/30 p-3"
          >
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {row.label}
              </span>
              <span
                className={cn(
                  "inline-flex items-center gap-1 text-xs font-medium",
                  colorClass(row.trend),
                )}
              >
                <Icon icon={arrowIcon(row.trend)} size={14} />
                {row.trend.changePct === null
                  ? S.kpiTrendNoBase
                  : `${row.trend.changePct > 0 ? "+" : ""}${row.trend.changePct}%`}
              </span>
            </div>
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="text-lg font-semibold tracking-tight text-foreground">
                {formatValue(row.current, Boolean(row.isCurrency))}
              </span>
              <span className="text-xs text-muted-foreground">
                anterior: {formatValue(row.previous, Boolean(row.isCurrency))}
              </span>
            </div>
          </li>
        ))}
      </ul>
      <p className="mt-auto text-[11px] text-muted-foreground">{comparisonLabel}</p>
    </Card>
  );
}
