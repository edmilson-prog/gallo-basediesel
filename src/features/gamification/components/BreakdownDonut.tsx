import { useMemo } from "react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { Card } from "@/components/ui/card";
import { GAMIFICATION_STRINGS as S } from "../i18n/pt-BR";

interface IBreakdownDonutProps {
  fromGoals: number;
  fromCustomers: number;
  fromOrders: number;
  fromBadges: number;
}

const COLORS = {
  goals: "var(--gallo-success-medium)",
  customers: "var(--gallo-info-medium, #3b82f6)",
  orders: "var(--accent)",
  badges: "var(--gallo-warning-medium)",
};

/** Donut chart of the score breakdown (PRD-043 drill-down). */
export function BreakdownDonut({
  fromGoals,
  fromCustomers,
  fromOrders,
  fromBadges,
}: IBreakdownDonutProps) {
  const data = useMemo(
    () =>
      [
        { name: S.chipGoals, value: fromGoals, fill: COLORS.goals },
        { name: S.chipCustomers, value: fromCustomers, fill: COLORS.customers },
        { name: S.chipOrders, value: fromOrders, fill: COLORS.orders },
        { name: S.chipBadges, value: fromBadges, fill: COLORS.badges },
      ].filter((d) => d.value > 0),
    [fromGoals, fromCustomers, fromOrders, fromBadges],
  );

  const total = fromGoals + fromCustomers + fromOrders + fromBadges;

  return (
    <Card className="flex flex-col gap-4 p-5">
      <div>
        <h2 className="text-base font-semibold text-foreground">{S.detailBreakdownTitle}</h2>
      </div>
      {total === 0 ? (
        <p className="py-12 text-center text-sm text-muted-foreground">{S.emptyDescription}</p>
      ) : (
        <div className="grid grid-cols-1 items-center gap-4 sm:grid-cols-[200px_1fr]">
          <div className="h-44">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={data}
                  dataKey="value"
                  innerRadius={48}
                  outerRadius={72}
                  paddingAngle={2}
                  stroke="hsl(var(--background))"
                  strokeWidth={2}
                >
                  {data.map((entry) => (
                    <Cell key={entry.name} fill={entry.fill} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value: number, name: string) => [
                    `${value.toLocaleString("pt-BR")} pts`,
                    name,
                  ]}
                  contentStyle={{
                    background: "hsl(var(--popover))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: 6,
                    fontSize: 12,
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <ul className="grid grid-cols-2 gap-2 text-sm">
            {data.map((entry) => {
              const pct = total > 0 ? Math.round((entry.value / total) * 100) : 0;
              return (
                <li key={entry.name} className="flex items-center gap-2">
                  <span
                    aria-hidden
                    className="inline-block h-3 w-3 rounded-full"
                    style={{ background: entry.fill }}
                  />
                  <div className="flex flex-col">
                    <span className="font-medium text-foreground">{entry.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {entry.value.toLocaleString("pt-BR")} pts ({pct}%)
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </Card>
  );
}
