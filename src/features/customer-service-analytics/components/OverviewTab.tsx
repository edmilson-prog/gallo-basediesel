import { useMemo } from "react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { ICustomerServiceMetrics } from "@/shared/types";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/Icon";
import { cn } from "@/lib/utils";
import { formatPercent } from "@/shared/utils/format";
import { deltaPctOf } from "../engine";
import { formatDuration } from "../utils/time";
import { CSA_STRINGS as S } from "../i18n/pt-BR";

export interface IOverviewTabProps {
  metrics: ICustomerServiceMetrics;
}

const KpiCard = ({
  label,
  value,
  helper,
  icon,
  delta,
  invert,
}: {
  label: string;
  value: string;
  helper?: string;
  icon: string;
  delta?: number | null;
  /** When true, negative delta is good (TMR/TMA). */
  invert?: boolean;
}) => {
  const deltaGood = delta == null ? null : invert ? delta < 0 : delta > 0;
  return (
    <Card className="flex flex-col gap-1.5 p-4">
      <div className="flex items-baseline justify-between">
        <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          {label}
        </span>
        <Icon icon={icon} size={16} className="text-muted-foreground" />
      </div>
      <span className="text-2xl font-semibold tabular-nums text-foreground">{value}</span>
      <div className="flex items-baseline justify-between gap-2">
        {helper && <span className="line-clamp-1 text-xs text-muted-foreground">{helper}</span>}
        {delta != null && (
          <span
            className={cn(
              "shrink-0 text-[10px] font-medium tabular-nums",
              deltaGood === true && "text-success",
              deltaGood === false && "text-destructive",
              deltaGood == null && "text-muted-foreground",
            )}
          >
            {delta > 0 ? "+" : ""}
            {(delta * 100).toFixed(1)}%
          </span>
        )}
      </div>
    </Card>
  );
};

export function OverviewTab({ metrics }: IOverviewTabProps) {
  const totals = metrics.totals;
  const prev = metrics.previous;

  const dailyChart = useMemo(
    () => metrics.trendDaily.map((p) => ({ ...p, dayShort: p.dayKey.slice(5) })),
    [metrics.trendDaily],
  );

  const trendChart = useMemo(
    () =>
      metrics.trendMonthly.map((p) => ({
        ...p,
        tmaMinutes: Math.round(p.averageHandleTime / 60_000),
        tmrMinutes: Math.round(p.averageResponseTime / 60_000),
      })),
    [metrics.trendMonthly],
  );

  const trendEmpty = trendChart.every((p) => p.totalConversations === 0);
  const dailyEmpty = dailyChart.every((p) => p.totalConversations === 0);

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <KpiCard
          label={S.kpiVolume}
          value={String(totals.totalConversations)}
          icon="mdi:forum-outline"
          delta={prev ? deltaPctOf(totals.totalConversations, prev.totalConversations) : null}
        />
        <KpiCard
          label={S.kpiTma}
          value={formatDuration(totals.averageHandleTime)}
          helper={S.kpiTmaHelp}
          icon="mdi:clock-outline"
          delta={prev ? deltaPctOf(totals.averageHandleTime, prev.averageHandleTime) : null}
          invert
        />
        <KpiCard
          label={S.kpiTmr}
          value={formatDuration(totals.averageResponseTime)}
          helper={S.kpiTmrHelp}
          icon="mdi:reply-outline"
          delta={prev ? deltaPctOf(totals.averageResponseTime, prev.averageResponseTime) : null}
          invert
        />
        <KpiCard
          label={S.kpiResolution}
          value={formatPercent(totals.resolutionRate)}
          helper={S.kpiResolutionHelp}
          icon="mdi:check-circle-outline"
          delta={prev ? deltaPctOf(totals.resolutionRate, prev.resolutionRate) : null}
        />
        <KpiCard
          label={S.kpiConversion}
          value={formatPercent(totals.conversionRate)}
          helper={S.kpiConversionHelp}
          icon="mdi:cart-arrow-down"
          delta={prev ? deltaPctOf(totals.conversionRate, prev.conversionRate) : null}
        />
        <Card className="flex flex-col gap-1.5 border-dashed p-4">
          <div className="flex items-baseline justify-between">
            <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              {S.kpiNpsPlaceholder}
            </span>
            <Icon icon="mdi:emoticon-happy-outline" size={16} className="text-muted-foreground" />
          </div>
          <span className="text-2xl font-semibold tabular-nums text-muted-foreground">—</span>
          <span className="text-xs text-muted-foreground">{S.kpiNpsPlaceholderHelp}</span>
        </Card>
      </div>

      <section className="grid gap-4 lg:grid-cols-[1.6fr_1fr]">
        <Card className="flex flex-col gap-4 p-5">
          <header className="flex items-baseline justify-between">
            <div>
              <h2 className="text-base font-semibold tracking-tight text-foreground">
                {S.chartTrendTitle}
              </h2>
              <p className="text-xs text-muted-foreground">{S.chartTrendHelp}</p>
            </div>
            <Icon icon="mdi:chart-line" size={20} className="text-muted-foreground" />
          </header>
          {trendEmpty ? (
            <p className="py-10 text-center text-sm text-muted-foreground">{S.chartTrendEmpty}</p>
          ) : (
            <div className="h-60 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trendChart} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.4} />
                  <XAxis
                    dataKey="monthLabel"
                    tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                    stroke="var(--border)"
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                    stroke="var(--border)"
                    tickLine={false}
                    width={48}
                    tickFormatter={(v: number) => `${v}min`}
                  />
                  <Tooltip
                    contentStyle={{
                      borderRadius: 8,
                      border: "1px solid var(--border)",
                      background: "var(--popover)",
                      color: "var(--popover-foreground)",
                      fontSize: 12,
                    }}
                    formatter={(value: number, name) => [`${value} min`, name]}
                  />
                  <Legend
                    wrapperStyle={{ fontSize: 11, color: "var(--muted-foreground)" }}
                    iconSize={10}
                  />
                  <Line
                    type="monotone"
                    dataKey="tmaMinutes"
                    name="TMA"
                    stroke="var(--gallo-industrial-yellow, #C79C2C)"
                    strokeWidth={2}
                    dot={{ r: 2.5 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="tmrMinutes"
                    name="TMR"
                    stroke="var(--gallo-parts-green, #337648)"
                    strokeWidth={2}
                    dot={{ r: 2.5 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>

        <Card className="flex flex-col gap-4 p-5">
          <header className="flex items-baseline justify-between">
            <div>
              <h2 className="text-base font-semibold tracking-tight text-foreground">
                {S.chartVolumeTitle}
              </h2>
              <p className="text-xs text-muted-foreground">{S.chartVolumeHelp}</p>
            </div>
            <Icon icon="mdi:chart-bell-curve" size={20} className="text-muted-foreground" />
          </header>
          {dailyEmpty ? (
            <p className="py-10 text-center text-sm text-muted-foreground">{S.channelEmpty}</p>
          ) : (
            <div className="h-60 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={dailyChart} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.4} />
                  <XAxis
                    dataKey="dayShort"
                    tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                    stroke="var(--border)"
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                    stroke="var(--border)"
                    tickLine={false}
                    width={32}
                    allowDecimals={false}
                  />
                  <Tooltip
                    contentStyle={{
                      borderRadius: 8,
                      border: "1px solid var(--border)",
                      background: "var(--popover)",
                      color: "var(--popover-foreground)",
                      fontSize: 12,
                    }}
                    formatter={(value: number) => [`${value}`, "conversas"]}
                  />
                  <Line
                    type="monotone"
                    dataKey="totalConversations"
                    stroke="var(--primary)"
                    strokeWidth={2}
                    dot={{ r: 2 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>
      </section>
    </div>
  );
}
