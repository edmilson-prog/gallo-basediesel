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
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/Icon";
import type { ID, IOrder, IPart, IProductIndicator } from "@/shared/types";
import { buildItemMatcher } from "../engine/matcher";
import { computeOrderContribution } from "../engine/calculate";
import { indicatorsPtBR as S } from "../i18n/pt-BR";
import { formatByMetric } from "../utils/format";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface IIndicatorEvolutionChartProps {
  indicator: IProductIndicator;
  orders: IOrder[]; // paid orders in scope (the detail page provides these)
  parts: IPart[]; // catalog fallback for matcher
  targetValue: number;
}

interface IChartPoint {
  /** ISO date string "YYYY-MM-DD" — used as XAxis key */
  date: string;
  /** Short display label "dd/MM" */
  label: string;
  realizado: number;
  esperado: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Format an ISO date "YYYY-MM-DD" into "dd/MM" for tick/label display. */
function toShortLabel(iso: string): string {
  // iso is "YYYY-MM-DD"
  const [, month, day] = iso.split("-");
  return `${day}/${month}`;
}

/**
 * Add N days to an ISO date, operating entirely in UTC so the result is
 * timezone-stable. Accepts a full ISO timestamp or a "YYYY-MM-DD" string;
 * only the date portion is used, and a "YYYY-MM-DD" string is returned.
 */
function addDaysUTC(iso: string, days: number): string {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

/** Enumerate all ISO days from start to end (inclusive), comparing "YYYY-MM-DD". */
function enumerateDays(start: string, end: string): string[] {
  const days: string[] = [];
  const endDay = end.slice(0, 10);
  let current = start.slice(0, 10);
  while (current <= endDay) {
    days.push(current);
    current = addDaysUTC(current, 1);
  }
  return days;
}

/**
 * Downsample a list of days to at most `maxPoints` evenly-distributed points.
 * Always includes the first and last day.
 */
function sampleDays(days: string[], maxPoints: number): string[] {
  if (days.length <= maxPoints) return days;
  const result: string[] = [];
  const step = (days.length - 1) / (maxPoints - 1);
  for (let i = 0; i < maxPoints; i++) {
    const idx = Math.round(i * step);
    result.push(days[Math.min(idx, days.length - 1)]);
  }
  return result;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function IndicatorEvolutionChart({
  indicator,
  orders,
  parts,
  targetValue,
}: IIndicatorEvolutionChartProps) {
  const data = useMemo<IChartPoint[]>(() => {
    const { start, end } = indicator.period;

    // Build item matcher
    const partsMap = new Map<ID, IPart>(parts.map((p) => [p.id, p]));
    const matches = buildItemMatcher(indicator.selector, partsMap);

    // Pre-compute per-order matched contributions (once, O(orders * items))
    type OrderContrib = { ts: string; value: number };
    const contributions: OrderContrib[] = [];
    for (const order of orders) {
      const { matched, value } = computeOrderContribution(order, indicator.metric, matches);
      if (!matched) continue;
      const ts = order.paidAt ?? order.createdAt;
      if (ts >= start && ts <= end) {
        contributions.push({ ts, value });
      }
    }

    // Enumerate all days and optionally downsample for readability
    const allDays = enumerateDays(start, end);
    const totalDays = allDays.length;

    // Downsample long periods: cap at 60 points (keeps monthly ~30, annual ~60)
    const MAX_POINTS = 60;
    const sampledDays = sampleDays(allDays, MAX_POINTS);

    // Build cumulative realizado by iterating sampled days
    let cumulative = 0;
    let contribIdx = 0;
    // Sort contributions by ts ascending for efficient accumulation
    const sortedContribs = [...contributions].sort((a, b) =>
      a.ts < b.ts ? -1 : a.ts > b.ts ? 1 : 0,
    );

    const points: IChartPoint[] = [];

    for (let i = 0; i < sampledDays.length; i++) {
      const day = sampledDays[i];

      // Accumulate all contributions up to and including this day
      while (contribIdx < sortedContribs.length && sortedContribs[contribIdx].ts <= day) {
        cumulative += sortedContribs[contribIdx].value;
        contribIdx++;
      }

      // Expected = linear proportion of target up to this day (by position in full period).
      // Sampled days are always a subset of allDays, so indexOf resolves to a valid index.
      const dayPosition = allDays.indexOf(day);
      // dayPosition is 0-based; N = totalDays; expected at day i = target * (i+1) / N
      const esperado = totalDays > 0 ? Math.min(targetValue * ((dayPosition + 1) / totalDays), targetValue) : 0;

      points.push({
        date: day,
        label: toShortLabel(day),
        realizado: cumulative,
        esperado,
      });
    }

    return points;
  }, [indicator, orders, parts, targetValue]);

  const isEmpty = data.length === 0;

  return (
    <Card className="flex flex-col gap-4 p-5">
      <header className="flex items-baseline justify-between">
        <div>
          <h2 className="text-base font-semibold tracking-tight text-foreground">
            {S.evolution}
          </h2>
          <p className="text-xs text-muted-foreground">
            Comparativo entre o realizado e a linha proporcional ao período.
          </p>
        </div>
        <Icon icon="mdi:chart-line-variant" size={20} className="text-muted-foreground" />
      </header>

      {isEmpty ? (
        <p className="py-10 text-center text-sm text-muted-foreground">{S.noPeriodData}</p>
      ) : (
        <>
          {/* Accessible hidden summary for screen readers */}
          <p className="sr-only" aria-live="polite">
            {`Gráfico de evolução do indicador ${indicator.name}. Período de ${indicator.period.start} a ${indicator.period.end}. Meta: ${formatByMetric(indicator.metric, targetValue, "full")}.`}
          </p>

          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.4} />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                  stroke="var(--border)"
                  tickLine={false}
                  interval="preserveStartEnd"
                />
                <YAxis
                  tickFormatter={(v: number) => formatByMetric(indicator.metric, v, "compact")}
                  tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                  stroke="var(--border)"
                  tickLine={false}
                  width={72}
                />
                <Tooltip
                  contentStyle={{
                    borderRadius: 8,
                    border: "1px solid var(--border)",
                    background: "var(--popover)",
                    color: "var(--popover-foreground)",
                    fontSize: 12,
                  }}
                  labelFormatter={(label: string) => label}
                  formatter={(value: number, name: string) => [
                    formatByMetric(indicator.metric, value, "full"),
                    name,
                  ]}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Line
                  type="monotone"
                  dataKey="realizado"
                  name={S.realized}
                  stroke="var(--primary)"
                  strokeWidth={2}
                  dot={false}
                />
                <Line
                  type="monotone"
                  dataKey="esperado"
                  name={S.expected}
                  stroke="var(--muted-foreground)"
                  strokeDasharray="4 4"
                  strokeWidth={1.5}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </>
      )}
    </Card>
  );
}
