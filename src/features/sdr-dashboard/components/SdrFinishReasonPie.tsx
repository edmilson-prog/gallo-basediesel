import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Icon } from "@/components/Icon";
import { cn } from "@/lib/utils";
import type { SdrFinishReason } from "@/shared/types";
import { FINISH_REASON_COLOR, FINISH_REASON_LABEL } from "../config/labels";

export interface ISdrFinishReasonPieProps {
  data: { reason: SdrFinishReason; count: number; pct: number }[];
  isLoading?: boolean;
}

export function SdrFinishReasonPie({ data, isLoading }: ISdrFinishReasonPieProps) {
  const total = data.reduce((acc, d) => acc + d.count, 0);
  const chartData = data.filter((d) => d.count > 0);

  return (
    <Card className="flex h-full flex-col gap-4 p-5">
      <header className="flex items-baseline justify-between">
        <div>
          <h2 className="text-base font-semibold tracking-tight text-foreground">
            Como as sessões terminam
          </h2>
          <p className="text-xs text-muted-foreground">
            Distribuição entre concluídas, escaladas, abandonadas e pausadas por humano.
          </p>
        </div>
        <Icon icon="mdi:chart-pie" size={20} className="text-muted-foreground" />
      </header>
      {isLoading ? (
        <Skeleton className="h-44 w-full" />
      ) : total === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">
          Sem dados no período selecionado.
        </p>
      ) : (
        <div className="flex flex-1 flex-col items-stretch gap-4 sm:flex-row sm:items-center">
          <div className="relative h-44 w-44 self-center">
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
                  innerRadius={50}
                  outerRadius={75}
                  paddingAngle={1}
                  strokeWidth={0}
                >
                  {chartData.map((bucket) => (
                    <Cell
                      key={bucket.reason}
                      fill={FINISH_REASON_COLOR[bucket.reason]}
                      name={FINISH_REASON_LABEL[bucket.reason]}
                    />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
              <span className="text-2xl font-semibold text-foreground">
                {total.toLocaleString("pt-BR")}
              </span>
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                sessões
              </span>
            </div>
          </div>
          <ul className="flex flex-1 flex-col gap-2">
            {data.map((bucket) => (
              <li key={bucket.reason}>
                <div
                  className={cn(
                    "flex items-center justify-between gap-3 rounded-md px-2 py-1.5 text-sm",
                  )}
                >
                  <span className="flex items-center gap-2">
                    <span
                      className="h-2.5 w-2.5 rounded-full"
                      style={{ background: FINISH_REASON_COLOR[bucket.reason] }}
                      aria-hidden="true"
                    />
                    <span className="text-foreground">{FINISH_REASON_LABEL[bucket.reason]}</span>
                  </span>
                  <span className="flex items-baseline gap-2 text-xs text-muted-foreground">
                    <span className="font-medium tabular-nums text-foreground">
                      {bucket.count.toLocaleString("pt-BR")}
                    </span>
                    <span className="tabular-nums">{bucket.pct}%</span>
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}
