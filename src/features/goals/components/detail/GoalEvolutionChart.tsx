import { useMemo } from "react";
import { useQueries } from "@tanstack/react-query";
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
import { Skeleton } from "@/components/ui/skeleton";
import { Icon } from "@/components/Icon";
import type { IGoal } from "@/shared/types";
import { FETCH_ALL_PAGE_SIZE, useCustomersProvider, useOrdersProvider } from "@/providers/data";
import { formatDateBR } from "@/shared/utils/format";
import { GOALS_STRINGS as S } from "../../i18n/pt-BR";
import { buildEvolutionSeries } from "../../utils/composition";
import { formatGoalValue } from "../../utils/formatGoalValue";

const STALE_MS = 30_000;

export interface IGoalEvolutionChartProps {
  goal: IGoal;
}

function formatTick(value: string): string {
  const [, month, day] = value.split("-");
  return `${day}/${month}`;
}

export function GoalEvolutionChart({ goal }: IGoalEvolutionChartProps) {
  const ordersProvider = useOrdersProvider();
  const customersProvider = useCustomersProvider();

  // Shared key family with useGoalProgress / GoalCompositionSection — identical
  // fetch params, so React Query dedups the detail-page requests.
  const scopeSellerId = goal.level === "individual" ? goal.targetId : undefined;

  const queries = useQueries({
    queries: [
      {
        queryKey: ["goals-scope-orders", goal.storeId, scopeSellerId],
        queryFn: () =>
          ordersProvider.list({
            storeId: goal.storeId,
            sellerId: scopeSellerId,
            paymentStatus: "pago",
            pageSize: FETCH_ALL_PAGE_SIZE,
          }),
        staleTime: STALE_MS,
      },
      {
        queryKey: ["goals-scope-customers", goal.storeId],
        queryFn: () =>
          customersProvider.list({ storeId: goal.storeId, pageSize: FETCH_ALL_PAGE_SIZE }),
        staleTime: STALE_MS,
      },
    ],
  });

  const [ordersQuery, customersQuery] = queries;
  const isLoading = ordersQuery.isLoading || customersQuery.isLoading;

  const data = useMemo(() => {
    if (isLoading) return [];
    return buildEvolutionSeries(goal, {
      orders: ordersQuery.data?.data ?? [],
      customers: customersQuery.data?.data ?? [],
    });
  }, [goal, ordersQuery.data, customersQuery.data, isLoading]);

  return (
    <Card className="flex flex-col gap-4 p-5">
      <header className="flex items-baseline justify-between">
        <div>
          <h2 className="text-base font-semibold tracking-tight text-foreground">
            {S.detailEvolutionTitle}
          </h2>
          <p className="text-xs text-muted-foreground">
            Comparativo entre o realizado e a linha proporcional ao período.
          </p>
        </div>
        <Icon icon="mdi:chart-line-variant" size={20} className="text-muted-foreground" />
      </header>
      {isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : data.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">
          Sem dados para o período da meta.
        </p>
      ) : (
        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.4} />
              <XAxis
                dataKey="date"
                tickFormatter={formatTick}
                tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                stroke="var(--border)"
                tickLine={false}
              />
              <YAxis
                tickFormatter={(v: number) => formatGoalValue(goal.metric, v, "compact")}
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
                labelFormatter={(value: string) => formatDateBR(value)}
                formatter={(value: number, name) => [formatGoalValue(goal.metric, value), name]}
              />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Line
                type="monotone"
                dataKey="realized"
                name={S.detailEvolutionRealized}
                stroke="var(--primary)"
                strokeWidth={2}
                dot={false}
              />
              <Line
                type="monotone"
                dataKey="expected"
                name={S.detailEvolutionExpected}
                stroke="var(--muted-foreground)"
                strokeDasharray="4 4"
                strokeWidth={1.5}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  );
}
