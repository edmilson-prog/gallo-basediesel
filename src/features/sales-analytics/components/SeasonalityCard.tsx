import { Card } from "@/components/ui/card";
import { Icon } from "@/components/Icon";
import { cn } from "@/lib/utils";
import { formatBRLCompact } from "@/shared/utils/format";
import { formatMonthKey, type ISeasonalitySignal } from "../utils/seasonality";
import { SALES_ANALYTICS_STRINGS as S } from "../i18n/pt-BR";

export interface ISeasonalityCardProps {
  signal: ISeasonalitySignal | null;
}

export function SeasonalityCard({ signal }: ISeasonalityCardProps) {
  if (!signal || !signal.isSignificant) return null;
  const isPositive = signal.changePct >= 0;
  return (
    <Card
      className={cn(
        "flex items-start gap-3 p-4",
        isPositive
          ? "border-emerald-500/40 bg-emerald-500/5"
          : "border-amber-500/40 bg-amber-500/5",
      )}
    >
      <span
        className={cn(
          "flex h-9 w-9 shrink-0 items-center justify-center rounded-md",
          isPositive
            ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
            : "bg-amber-500/10 text-amber-600 dark:text-amber-400",
        )}
        aria-hidden="true"
      >
        <Icon icon={isPositive ? "mdi:trending-up" : "mdi:trending-down"} size={20} />
      </span>
      <div className="flex flex-1 flex-col gap-1">
        <h3 className="text-sm font-semibold text-foreground">
          {S.seasonalityTitle}: {formatMonthKey(signal.monthKey)}
        </h3>
        <p className="text-xs text-muted-foreground">
          <span className="font-medium text-foreground">
            {isPositive ? "+" : ""}
            {signal.changePct}%
          </span>{" "}
          {S.seasonalityVsYearAgo} ({formatBRLCompact(signal.previousRevenue)} →{" "}
          {formatBRLCompact(signal.currentRevenue)})
        </p>
      </div>
    </Card>
  );
}
