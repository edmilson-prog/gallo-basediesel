import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Icon } from "@/components/Icon";
import { cn } from "@/lib/utils";

export interface ISdrKpiCardProps {
  label: string;
  helpText: string;
  icon: string;
  value: number | null;
  formatValue?: (value: number) => string;
  changePct: number | null;
  /** When true, a *decrease* counts as an improvement (green). */
  lowerIsBetter?: boolean;
  isLoading?: boolean;
}

function defaultFormat(value: number): string {
  return value.toLocaleString("pt-BR");
}

function TrendBadge({ changePct, lowerIsBetter }: { changePct: number; lowerIsBetter: boolean }) {
  if (changePct === 0) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-muted/60 px-2 py-0.5 text-xs text-muted-foreground">
        <Icon icon="mdi:minus" size={12} />
        Estável
      </span>
    );
  }
  const direction = changePct > 0 ? "up" : "down";
  const isImprovement = lowerIsBetter ? direction === "down" : direction === "up";
  const colorClass = isImprovement
    ? "text-emerald-700 bg-emerald-100 dark:text-emerald-300 dark:bg-emerald-500/15"
    : "text-red-700 bg-red-100 dark:text-red-300 dark:bg-red-500/15";
  const arrow = direction === "up" ? "mdi:arrow-top-right" : "mdi:arrow-bottom-right";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
        colorClass,
      )}
    >
      <Icon icon={arrow} size={12} />
      {changePct > 0 ? "+" : ""}
      {changePct}%
    </span>
  );
}

export function SdrKpiCard({
  label,
  helpText,
  icon,
  value,
  formatValue = defaultFormat,
  changePct,
  lowerIsBetter = false,
  isLoading = false,
}: ISdrKpiCardProps) {
  return (
    <Card className="flex h-full flex-col gap-3 p-5">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-md bg-primary/10 text-primary">
            <Icon icon={icon} size={20} />
          </span>
          <span className="text-sm font-medium text-foreground">{label}</span>
        </span>
        {!isLoading && changePct !== null && (
          <TrendBadge changePct={changePct} lowerIsBetter={lowerIsBetter} />
        )}
      </div>
      <div className="flex flex-1 items-end justify-between gap-2">
        {isLoading ? (
          <Skeleton className="h-9 w-24" />
        ) : value === null ? (
          <span className="text-sm text-muted-foreground">Sem dados</span>
        ) : (
          <span className="text-3xl font-semibold tracking-tight text-foreground">
            {formatValue(value)}
          </span>
        )}
      </div>
      <p className="text-xs text-muted-foreground">{helpText}</p>
    </Card>
  );
}
