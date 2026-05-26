import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/Icon";
import type { SdrEscalationReason } from "@/shared/types";
import { ESCALATION_REASON_COLOR, ESCALATION_REASON_LABEL } from "../config/labels";

export interface ISdrEscalationReasonPieProps {
  data: { reason: SdrEscalationReason; count: number; pct: number }[];
}

export function SdrEscalationReasonPie({ data }: ISdrEscalationReasonPieProps) {
  const total = data.reduce((acc, d) => acc + d.count, 0);
  const chartData = data.filter((d) => d.count > 0);

  return (
    <Card className="flex h-full flex-col gap-4 p-5">
      <header className="flex items-baseline justify-between">
        <div>
          <h2 className="text-base font-semibold tracking-tight text-foreground">
            Por que o SDR escalou?
          </h2>
          <p className="text-xs text-muted-foreground">
            Distribuição dos motivos para transferir para humano.
          </p>
        </div>
        <Icon icon="mdi:pie-chart-outline" size={20} className="text-muted-foreground" />
      </header>
      {total === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">
          Sem escalações no período selecionado.
        </p>
      ) : (
        <div className="flex flex-1 flex-col items-stretch gap-4 sm:flex-row sm:items-center">
          <div className="h-44 w-44 self-center">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Tooltip
                  contentStyle={{
                    borderRadius: 8,
                    border: "1px solid var(--border)",
                    background: "var(--popover)",
                    color: "var(--popover-foreground)",
                    fontSize: 12,
                  }}
                  formatter={(value: number, name: string) => [
                    `${value} (${Math.round((value / total) * 100)}%)`,
                    name,
                  ]}
                />
                <Pie
                  data={chartData}
                  dataKey="count"
                  nameKey="reason"
                  innerRadius={42}
                  outerRadius={70}
                  paddingAngle={1}
                  strokeWidth={0}
                >
                  {chartData.map((bucket) => (
                    <Cell
                      key={bucket.reason}
                      fill={ESCALATION_REASON_COLOR[bucket.reason]}
                      name={ESCALATION_REASON_LABEL[bucket.reason]}
                    />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
          </div>
          <ul className="flex flex-1 flex-col gap-1.5">
            {data.map((bucket) => (
              <li
                key={bucket.reason}
                className="flex items-center justify-between gap-3 rounded-md px-2 py-1.5 text-sm"
              >
                <span className="flex items-center gap-2">
                  <span
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ background: ESCALATION_REASON_COLOR[bucket.reason] }}
                    aria-hidden="true"
                  />
                  <span className="text-foreground">{ESCALATION_REASON_LABEL[bucket.reason]}</span>
                </span>
                <span className="flex items-baseline gap-2 text-xs text-muted-foreground">
                  <span className="font-medium tabular-nums text-foreground">{bucket.count}</span>
                  <span className="tabular-nums">{bucket.pct}%</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}
