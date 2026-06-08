import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Icon } from "@/components/Icon";
import { cn } from "@/lib/utils";
import { InfoHint } from "@/components/InfoHint";
import type { CustomerStatus } from "@/shared/types";
import { MANAGER_DASHBOARD_STRINGS } from "../i18n/pt-BR";
import type { ICarteiraHealthData } from "../hooks/useCarteiraHealth";

export interface ICarteiraHealthDonutProps {
  data: ICarteiraHealthData;
  isLoading: boolean;
  onSliceClick?: (status: CustomerStatus) => void;
}

const STATUS_LABEL: Record<CustomerStatus, string> = {
  ativo: MANAGER_DASHBOARD_STRINGS.carteiraStatusAtivo,
  dormente: MANAGER_DASHBOARD_STRINGS.carteiraStatusDormente,
  recuperacao: MANAGER_DASHBOARD_STRINGS.carteiraStatusRecuperacao,
  perdido: MANAGER_DASHBOARD_STRINGS.carteiraStatusPerdido,
};

const STATUS_HEX: Record<CustomerStatus, string> = {
  ativo: "#10b981",
  dormente: "#f59e0b",
  recuperacao: "#3b82f6",
  perdido: "#94a3b8",
};

const STATUS_DOT: Record<CustomerStatus, string> = {
  ativo: "bg-emerald-500",
  dormente: "bg-amber-500",
  recuperacao: "bg-blue-500",
  perdido: "bg-slate-400",
};

export function CarteiraHealthDonut({ data, isLoading, onSliceClick }: ICarteiraHealthDonutProps) {
  const chartData = data.buckets.filter((b) => b.count > 0);

  return (
    <Card className="flex h-full flex-col gap-4 p-5">
      <header className="flex items-baseline justify-between">
        <div>
          <h2 className="flex items-center gap-1.5 text-base font-semibold tracking-tight text-foreground">
            {MANAGER_DASHBOARD_STRINGS.carteiraTitle}
            <InfoHint
              text={MANAGER_DASHBOARD_STRINGS.carteiraHelp}
              label={MANAGER_DASHBOARD_STRINGS.carteiraTitle}
            />
          </h2>
          <p className="text-xs text-muted-foreground">
            {MANAGER_DASHBOARD_STRINGS.carteiraSubtitle}
          </p>
        </div>
        <Icon icon="mdi:chart-donut-variant" size={20} className="text-muted-foreground" />
      </header>

      {isLoading ? (
        <Skeleton className="h-44 w-full" />
      ) : data.total === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">
          {MANAGER_DASHBOARD_STRINGS.carteiraEmpty}
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
                    `${value.toLocaleString("pt-BR")} (${Math.round((value / data.total) * 100)}%)`,
                    name,
                  ]}
                />
                <Pie
                  data={chartData}
                  dataKey="count"
                  nameKey="status"
                  innerRadius={50}
                  outerRadius={75}
                  paddingAngle={1}
                  strokeWidth={0}
                  onClick={(entry) => {
                    const status = (entry as { payload?: { status?: CustomerStatus } })?.payload
                      ?.status;
                    if (status && onSliceClick) onSliceClick(status);
                  }}
                >
                  {chartData.map((bucket) => (
                    <Cell
                      key={bucket.status}
                      fill={STATUS_HEX[bucket.status]}
                      cursor={onSliceClick ? "pointer" : "default"}
                      name={STATUS_LABEL[bucket.status]}
                    />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
              <span className="text-2xl font-semibold text-foreground">
                {data.total.toLocaleString("pt-BR")}
              </span>
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                {MANAGER_DASHBOARD_STRINGS.carteiraTotal}
              </span>
            </div>
          </div>

          <ul className="flex flex-1 flex-col gap-2">
            {data.buckets.map((bucket) => {
              const interactive = Boolean(onSliceClick);
              return (
                <li key={bucket.status}>
                  <button
                    type="button"
                    onClick={() => onSliceClick?.(bucket.status)}
                    disabled={!interactive}
                    className={cn(
                      "flex w-full items-center justify-between gap-3 rounded-md px-2 py-1.5 text-sm",
                      interactive &&
                        "transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      !interactive && "cursor-default",
                    )}
                  >
                    <span className="flex items-center gap-2">
                      <span
                        className={cn("h-2.5 w-2.5 rounded-full", STATUS_DOT[bucket.status])}
                        aria-hidden="true"
                      />
                      <span className="text-foreground">{STATUS_LABEL[bucket.status]}</span>
                    </span>
                    <span className="flex items-baseline gap-2 text-xs text-muted-foreground">
                      <span className="font-medium tabular-nums text-foreground">
                        {bucket.count.toLocaleString("pt-BR")}
                      </span>
                      <span className="tabular-nums">{bucket.percent}%</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </Card>
  );
}
