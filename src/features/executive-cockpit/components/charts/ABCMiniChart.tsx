import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Icon } from "@/components/Icon";
import { formatBRL, formatPercent } from "@/shared/utils/format";
import type { IABCMiniRow } from "../../hooks/useCockpitMetrics";
import { EXECUTIVE_COCKPIT_STRINGS as S } from "../../i18n/pt-BR";

export interface IABCMiniChartProps {
  rows: IABCMiniRow[];
  isLoading?: boolean;
  onClick?: () => void;
}

const CLASS_LABELS = {
  A: S.abcClassA,
  B: S.abcClassB,
  C: S.abcClassC,
} as const;

const CLASS_COLORS = {
  A: "var(--gallo-parts-green, #337648)",
  B: "var(--gallo-industrial-yellow, #C79C2C)",
  C: "var(--muted-foreground)",
} as const;

export function ABCMiniChart({ rows, isLoading, onClick }: IABCMiniChartProps) {
  const totalCustomers = rows.reduce((acc, r) => acc + r.customerCount, 0);
  const empty = !isLoading && totalCustomers === 0;
  const interactive = Boolean(onClick);
  const data = rows.map((r) => ({
    ...r,
    label: CLASS_LABELS[r.class],
    color: CLASS_COLORS[r.class],
  }));
  return (
    <Card
      className={
        interactive
          ? "flex h-full cursor-pointer flex-col gap-4 p-5 transition-colors hover:border-primary/50 hover:shadow-md"
          : "flex h-full flex-col gap-4 p-5"
      }
      onClick={interactive ? onClick : undefined}
      role={interactive ? "button" : undefined}
      tabIndex={interactive ? 0 : undefined}
      onKeyDown={(e) => {
        if (!interactive) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick?.();
        }
      }}
    >
      <header className="flex items-baseline justify-between">
        <div>
          <h2 className="text-base font-semibold tracking-tight text-foreground">{S.chartABC}</h2>
          <p className="text-xs text-muted-foreground">{S.chartABCHelp}</p>
        </div>
        <Icon icon="mdi:chart-arc" size={20} className="text-muted-foreground" />
      </header>
      {isLoading ? (
        <Skeleton className="h-56 w-full" />
      ) : empty ? (
        <p className="py-10 text-center text-sm text-muted-foreground">{S.chartEmpty}</p>
      ) : (
        <div className="flex h-56 w-full flex-col gap-3">
          <div className="flex-1">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.4} />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                  stroke="var(--border)"
                  tickLine={false}
                />
                <YAxis
                  tickFormatter={(v: number) => `${Math.round(v * 100)}%`}
                  tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                  stroke="var(--border)"
                  tickLine={false}
                  width={40}
                  domain={[0, 1]}
                />
                <Tooltip
                  contentStyle={{
                    borderRadius: 8,
                    border: "1px solid var(--border)",
                    background: "var(--popover)",
                    color: "var(--popover-foreground)",
                    fontSize: 12,
                  }}
                  formatter={(value: number, _name, props) => [
                    `${formatPercent(value)} • ${formatBRL(props.payload.revenue)}`,
                    props.payload.label,
                  ]}
                />
                <Bar dataKey="revenueShare" radius={[6, 6, 0, 0]}>
                  {data.map((entry) => (
                    <Cell key={entry.class} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <ul className="flex justify-around text-[11px] text-muted-foreground">
            {data.map((entry) => (
              <li key={entry.class} className="flex items-center gap-1">
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ background: entry.color }}
                  aria-hidden="true"
                />
                <span>
                  {entry.label}: {entry.customerCount} clientes
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}
