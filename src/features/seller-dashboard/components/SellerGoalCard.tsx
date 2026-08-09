import type { IGoal, IGoalProgress } from "@/shared/types";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/Icon";
import { Skeleton } from "@/components/ui/skeleton";
import { formatBRL } from "@/shared/utils/format";
import type { IGoalPaceResult } from "../engine/goalPace";
import { SELLER_DASHBOARD_STRINGS as S } from "../i18n/pt-BR";

interface ISellerGoalCardProps {
  goal: IGoal | null;
  /** Live progress derived from paid orders — never the goal's stale snapshot. */
  progress: IGoalProgress | null;
  pace: IGoalPaceResult | null;
  isLoading: boolean;
  hasError: boolean;
}

export function SellerGoalCard({
  goal,
  progress,
  pace,
  isLoading,
  hasError,
}: ISellerGoalCardProps) {
  const header = (
    <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-foreground">
      <Icon icon="mdi:target" size={16} className="text-primary" />
      {S.goalTitle}
    </div>
  );

  if (isLoading) {
    return (
      <Card className="p-4">
        <Skeleton className="mb-3 h-4 w-32" />
        <Skeleton className="h-8 w-full" />
      </Card>
    );
  }

  if (hasError) {
    // "Nenhuma meta cadastrada" would be a false claim when the fetch failed.
    return (
      <Card className="p-4">
        {header}
        <p className="text-sm text-severity-critical">{S.goalError}</p>
      </Card>
    );
  }

  if (!goal || !progress || !pace) {
    return (
      <Card className="p-4">
        {header}
        <p className="text-sm text-muted-foreground">{S.goalEmpty}</p>
      </Card>
    );
  }

  const pct = Math.min(100, Math.max(0, pace.percent));
  const reached = pace.remaining <= 0;

  return (
    <Card className="p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <Icon icon="mdi:target" size={16} className="text-primary" />
          {S.goalTitle}
        </div>
        <span className="font-display text-lg font-bold text-primary">{pace.percent}%</span>
      </div>
      <div className="mb-2 flex items-end justify-between">
        <span className="font-display text-2xl font-bold text-foreground">
          {formatBRL(progress.currentValue)}
        </span>
        <span className="text-xs text-muted-foreground">
          {S.goalOf} {formatBRL(goal.targetValue)}
        </span>
      </div>
      <div className="h-2.5 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-primary transition-[width] duration-300"
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        {/* Once the target is reached, "Faltam R$ 0,00 — meta batida" reads as a
            contradiction; show the pace label on its own. */}
        {reached ? (
          <span className="font-semibold text-severity-success">{pace.paceLabel}</span>
        ) : (
          <>
            {S.goalMissing} <b className="text-foreground">{formatBRL(pace.remaining)}</b> —{" "}
            {pace.paceLabel}
          </>
        )}
      </p>
    </Card>
  );
}
