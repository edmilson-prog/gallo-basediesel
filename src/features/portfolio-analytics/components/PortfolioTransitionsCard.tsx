import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Icon } from "@/components/Icon";
import { PORTFOLIO_STRINGS as S } from "../i18n/pt-BR";
import type { IPortfolioMetrics } from "../engine/calculatePortfolioMetrics";

export interface IPortfolioTransitionsCardProps {
  metrics: IPortfolioMetrics | null;
  isLoading?: boolean;
}

interface IRowProps {
  icon: string;
  label: string;
  value: number;
  tone: "good" | "warn" | "bad" | "neutral";
}

function toneClasses(tone: IRowProps["tone"]): string {
  switch (tone) {
    case "good":
      return "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400";
    case "warn":
      return "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400";
    case "bad":
      return "bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-400";
    case "neutral":
    default:
      return "bg-muted/40 text-muted-foreground";
  }
}

function Row({ icon, label, value, tone }: IRowProps) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-background/40 px-3 py-2">
      <div className="flex items-center gap-2">
        <span
          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md ${toneClasses(tone)}`}
        >
          <Icon icon={icon} size={16} />
        </span>
        <span className="text-sm text-foreground">{label}</span>
      </div>
      <span className="text-base font-semibold tracking-tight text-foreground">
        {value.toLocaleString("pt-BR")}
      </span>
    </div>
  );
}

export function PortfolioTransitionsCard({ metrics, isLoading }: IPortfolioTransitionsCardProps) {
  return (
    <Card className="flex h-full flex-col gap-3 p-5">
      <header className="flex items-baseline justify-between">
        <h2 className="flex items-center gap-2 text-base font-semibold tracking-tight text-foreground">
          <Icon icon="mdi:swap-horizontal-bold" size={18} className="text-primary" />
          {S.sectionTransitions}
        </h2>
      </header>
      {isLoading ? (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <Row
            icon="mdi:arrow-down-bold"
            label={S.transitionActiveToDormant}
            value={metrics?.churn.activeToDormant ?? 0}
            tone="warn"
          />
          <Row
            icon="mdi:arrow-down-bold-circle"
            label={S.transitionActiveToLost}
            value={metrics?.churn.activeToLost ?? 0}
            tone="bad"
          />
          <Row
            icon="mdi:arrow-down-bold-outline"
            label={S.transitionDormantToLost}
            value={metrics?.churn.dormantToLost ?? 0}
            tone="bad"
          />
          <Row
            icon="mdi:arrow-up-bold"
            label={S.transitionDormantToActive}
            value={metrics?.recovery.dormantToActive ?? 0}
            tone="good"
          />
          <Row
            icon="mdi:arrow-up-bold-circle"
            label={S.transitionLostToActive}
            value={metrics?.recovery.lostToActive ?? 0}
            tone="good"
          />
          <Row
            icon="mdi:account-plus-outline"
            label={S.transitionNew}
            value={metrics?.growth.newCustomers ?? 0}
            tone="neutral"
          />
        </div>
      )}
    </Card>
  );
}
