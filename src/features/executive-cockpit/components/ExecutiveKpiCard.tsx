import type { ReactNode } from "react";
import { Line, LineChart, ResponsiveContainer } from "recharts";
import { Icon } from "@/components/Icon";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { ITrendInfo } from "@/features/manager-dashboard/utils/kpiMath";
import { EXECUTIVE_COCKPIT_STRINGS as S } from "../i18n/pt-BR";

export interface IExecutiveKpiCardProps {
  label: string;
  helpText?: string;
  icon: string;
  value: number | null;
  formatValue: (value: number) => string;
  trend?: ITrendInfo;
  sparkline?: number[];
  comparisonLabel?: string;
  isLoading?: boolean;
  hasError?: boolean;
  /** Optional "Em breve" / "Estimativa" tag rendered next to the title. */
  tag?: string;
  /** Optional breakdown shown in an info tooltip (e.g. orders by origin — PRD-067 RF-019). */
  breakdown?: { label: string; value: number }[];
  /** When set, the card becomes clickable and navigates to the drill-down target. */
  onClick?: () => void;
  onRetry?: () => void;
}

function TrendBadge({ trend, comparisonLabel }: { trend: ITrendInfo; comparisonLabel?: string }) {
  if (trend.direction === "flat" && trend.changePct === null) return null;
  const iconName =
    trend.direction === "up"
      ? "mdi:arrow-top-right"
      : trend.direction === "down"
        ? "mdi:arrow-bottom-right"
        : "mdi:minus";
  const colorClass = trend.isImprovement
    ? "text-emerald-600 bg-emerald-50 dark:text-emerald-400 dark:bg-emerald-500/10"
    : trend.changePct === 0
      ? "text-muted-foreground bg-muted/60"
      : "text-red-600 bg-red-50 dark:text-red-400 dark:bg-red-500/10";
  const label =
    trend.direction === "up"
      ? S.kpiTrendUp
      : trend.direction === "down"
        ? S.kpiTrendDown
        : S.kpiTrendFlat;
  const titleSr = comparisonLabel ? `${label} ${comparisonLabel}` : label;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          role="status"
          aria-label={titleSr}
          className={cn(
            "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
            colorClass,
          )}
        >
          <Icon icon={iconName} size={14} />
          {trend.changePct === null
            ? S.kpiTrendNoBase
            : `${trend.changePct > 0 ? "+" : ""}${trend.changePct}%`}
        </span>
      </TooltipTrigger>
      {comparisonLabel && (
        <TooltipContent side="top">
          <span className="text-xs">{comparisonLabel}</span>
        </TooltipContent>
      )}
    </Tooltip>
  );
}

function Sparkline({ data, color }: { data: number[]; color: string }) {
  if (!data.length) return null;
  const series = data.map((value, index) => ({ index, value }));
  return (
    <div className="h-9 w-20" aria-hidden="true">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={series} margin={{ top: 2, right: 0, bottom: 2, left: 0 }}>
          <Line
            type="monotone"
            dataKey="value"
            stroke={color}
            strokeWidth={1.75}
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function Shell({
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
    "relative flex h-full flex-col gap-3 p-4",
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
          aria-label={S.drillKpi}
        >
          {children}
        </button>
      </Card>
    );
  }
  return <Card className={cn("overflow-hidden", base)}>{children}</Card>;
}

export function ExecutiveKpiCard({
  label,
  helpText,
  icon,
  value,
  formatValue,
  trend,
  sparkline,
  comparisonLabel,
  isLoading = false,
  hasError = false,
  tag,
  breakdown,
  onClick,
  onRetry,
}: IExecutiveKpiCardProps) {
  const isInteractive = Boolean(onClick);
  return (
    <Shell onClick={onClick} isInteractive={isInteractive} hasError={hasError}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
            <Icon icon={icon} size={18} />
          </span>
          <div className="flex min-w-0 flex-col">
            <span className="truncate text-xs font-medium text-foreground">{label}</span>
            {helpText && (
              <span className="line-clamp-1 text-[11px] text-muted-foreground">{helpText}</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          {breakdown && breakdown.length > 0 && (
            <Tooltip>
              <TooltipTrigger asChild>
                <span
                  tabIndex={0}
                  role="img"
                  aria-label="Distribuição por origem"
                  className="text-muted-foreground transition-colors hover:text-foreground"
                  onClick={(e) => e.stopPropagation()}
                >
                  <Icon icon="mdi:information-outline" size={16} />
                </span>
              </TooltipTrigger>
              <TooltipContent side="top">
                <div className="space-y-0.5 text-xs">
                  {breakdown.map((b) => (
                    <div key={b.label} className="flex justify-between gap-4">
                      <span>{b.label}</span>
                      <span className="font-semibold tabular-nums">{b.value}</span>
                    </div>
                  ))}
                </div>
              </TooltipContent>
            </Tooltip>
          )}
          {tag && (
            <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
              {tag}
            </span>
          )}
        </div>
      </div>

      <div className="flex flex-1 items-end justify-between gap-3">
        {isLoading ? (
          <Skeleton className="h-8 w-24" />
        ) : hasError ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Icon icon="mdi:alert-circle-outline" size={14} className="text-amber-500" />
            <span>Falha ao carregar</span>
            {onRetry && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onRetry();
                }}
                className="text-primary underline-offset-4 hover:underline"
              >
                tentar novamente
              </button>
            )}
          </div>
        ) : value === null ? (
          <span className="text-sm text-muted-foreground">—</span>
        ) : (
          <span className="text-2xl font-semibold tracking-tight text-foreground">
            {formatValue(value)}
          </span>
        )}
        {!isLoading && !hasError && sparkline && sparkline.length > 0 && (
          <Sparkline
            data={sparkline}
            color={trend?.isImprovement ? "var(--primary)" : "var(--muted-foreground)"}
          />
        )}
      </div>

      {trend && !isLoading && !hasError && (
        <div className="flex items-center justify-between text-[11px] text-muted-foreground">
          <TrendBadge trend={trend} comparisonLabel={comparisonLabel} />
          {comparisonLabel && <span>{comparisonLabel}</span>}
        </div>
      )}
    </Shell>
  );
}
