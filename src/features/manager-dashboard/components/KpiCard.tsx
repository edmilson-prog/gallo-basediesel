import type { ReactNode } from "react";
import { Icon } from "@/components/Icon";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { InfoHint } from "@/components/InfoHint";
import { MANAGER_DASHBOARD_STRINGS } from "../i18n/pt-BR";
import type { ITrendInfo } from "../utils/kpiMath";

export interface IKpiCardProps {
  label: string;
  shortLabel: string;
  icon: string;
  value: number | null;
  formatValue?: (value: number) => string;
  helpText: string;
  trend?: ITrendInfo;
  isLoading?: boolean;
  hasError?: boolean;
  onClick?: () => void;
  onRetry?: () => void;
}

function defaultFormat(value: number): string {
  return value.toLocaleString("pt-BR");
}

function TrendBadge({ trend }: { trend: ITrendInfo }) {
  if (trend.direction === "flat" && trend.changePct === null) return null;
  const iconName =
    trend.direction === "up"
      ? "mdi:arrow-top-right"
      : trend.direction === "down"
        ? "mdi:arrow-bottom-right"
        : "mdi:minus";
  const colorClass = trend.isImprovement
    ? "text-severity-success bg-severity-success/10"
    : trend.changePct === 0
      ? "text-muted-foreground bg-muted/60"
      : "text-severity-critical bg-severity-critical/10";
  const label =
    trend.direction === "up"
      ? MANAGER_DASHBOARD_STRINGS.kpiTrendUp
      : trend.direction === "down"
        ? MANAGER_DASHBOARD_STRINGS.kpiTrendDown
        : MANAGER_DASHBOARD_STRINGS.kpiTrendFlat;
  return (
    <span
      role="status"
      aria-label={label}
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
        colorClass,
      )}
    >
      <Icon icon={iconName} size={14} />
      {trend.changePct === null ? label : `${trend.changePct > 0 ? "+" : ""}${trend.changePct}%`}
    </span>
  );
}

function CardShell({
  children,
  onClick,
  isInteractive,
  hasError,
}: {
  children: ReactNode;
  onClick?: () => void;
  isInteractive: boolean;
  hasError: boolean;
}) {
  const base = cn(
    "relative flex h-full flex-col gap-3 p-5",
    isInteractive &&
      !hasError &&
      "cursor-pointer transition-colors hover:border-primary/50 hover:shadow-md focus-within:border-primary",
  );

  if (isInteractive && onClick && !hasError) {
    return (
      <Card className="overflow-hidden">
        <button
          type="button"
          onClick={onClick}
          className={cn(base, "w-full text-left")}
          aria-label="Abrir detalhes"
        >
          {children}
        </button>
      </Card>
    );
  }
  return <Card className={cn("overflow-hidden", base)}>{children}</Card>;
}

export function KpiCard({
  label,
  shortLabel,
  icon,
  value,
  formatValue = defaultFormat,
  helpText,
  trend,
  isLoading = false,
  hasError = false,
  onClick,
  onRetry,
}: IKpiCardProps) {
  const isInteractive = Boolean(onClick);
  return (
    <CardShell onClick={onClick} isInteractive={isInteractive} hasError={hasError}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-md bg-primary/10 text-primary">
            <Icon icon={icon} size={20} />
          </span>
          <div className="flex flex-col">
            <span className="flex items-center gap-1 text-sm font-medium text-foreground">
              {shortLabel}
              <InfoHint text={helpText} label={`O que significa ${shortLabel}`} />
            </span>
            <span className="text-xs text-muted-foreground">{label}</span>
          </div>
        </div>
        {hasError ? (
          <Icon icon="mdi:alert-circle-outline" size={18} className="text-severity-warning" />
        ) : (
          trend && !isLoading && <TrendBadge trend={trend} />
        )}
      </div>

      <div className="flex flex-1 items-end gap-3">
        {isLoading ? (
          <Skeleton className="h-9 w-24" />
        ) : hasError ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span>{MANAGER_DASHBOARD_STRINGS.errorLoading}</span>
            {onRetry && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onRetry();
                }}
                className="rounded text-xs font-medium text-primary underline-offset-4 hover:underline"
              >
                {MANAGER_DASHBOARD_STRINGS.errorRetry}
              </button>
            )}
          </div>
        ) : value === null ? (
          <span className="text-sm text-muted-foreground">
            {MANAGER_DASHBOARD_STRINGS.kpiNoData}
          </span>
        ) : (
          <span className="text-3xl font-semibold tracking-tight text-foreground">
            {formatValue(value)}
          </span>
        )}
      </div>

      {trend && !isLoading && !hasError && trend.changePct !== null && (
        <span className="text-[11px] text-muted-foreground">
          {MANAGER_DASHBOARD_STRINGS.kpiVsPrevious}
        </span>
      )}
    </CardShell>
  );
}
