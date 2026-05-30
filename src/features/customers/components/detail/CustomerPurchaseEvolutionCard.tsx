import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Area,
  AreaChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { ICustomer } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { cn } from "@/lib/utils";
import { useOrdersProvider } from "@/providers/data/hooks/useOrdersProvider";
import { formatBRL } from "@/shared/utils/format";
import { CUSTOMER_STRINGS } from "../../i18n/pt-BR";
import { averageOf, buildMonthlyPurchaseSeries } from "../../utils/purchaseSeries";

const COPY = CUSTOMER_STRINGS.detail.evolution;

export interface ICustomerPurchaseEvolutionCardProps {
  customer: ICustomer;
  className?: string;
}

export function CustomerPurchaseEvolutionCard({
  customer,
  className,
}: ICustomerPurchaseEvolutionCardProps) {
  const provider = useOrdersProvider();
  const query = useQuery({
    queryKey: ["customer-orders", customer.id] as const,
    queryFn: () => provider.listByCustomer(customer.id),
    staleTime: 60_000,
  });

  const series = useMemo(() => buildMonthlyPurchaseSeries(query.data ?? []), [query.data]);
  const average = useMemo(() => averageOf(series), [series]);
  const hasData = series.some((p) => p.total > 0);

  return (
    <section className={cn("rounded-lg border border-border bg-card p-4", className)}>
      <header className="mb-3 flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
          <Icon icon="mdi:chart-areaspline" size={16} className="text-muted-foreground" />
          {COPY.title}
        </h2>
        <span className="text-xs text-muted-foreground">{COPY.window}</span>
      </header>

      {!hasData ? (
        <div className="flex h-40 items-center justify-center text-xs text-muted-foreground">
          {COPY.empty}
        </div>
      ) : (
        <div className="h-44 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={series} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
              <defs>
                <linearGradient id="customerEvoArea" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--primary)" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="var(--primary)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis
                dataKey="label"
                tickLine={false}
                axisLine={false}
                tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
              />
              <YAxis hide domain={[0, "dataMax"]} />
              {average > 0 && (
                <ReferenceLine
                  y={average}
                  stroke="var(--muted-foreground)"
                  strokeDasharray="4 4"
                  strokeWidth={1}
                />
              )}
              <Tooltip
                cursor={{ stroke: "var(--border)" }}
                contentStyle={{
                  background: "var(--card)",
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                  fontSize: 12,
                }}
                labelStyle={{ color: "var(--muted-foreground)" }}
                formatter={(value: unknown) => [formatBRL(value as number), COPY.title]}
              />
              <Area
                type="monotone"
                dataKey="total"
                stroke="var(--primary)"
                strokeWidth={2}
                fill="url(#customerEvoArea)"
                dot={false}
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </section>
  );
}
