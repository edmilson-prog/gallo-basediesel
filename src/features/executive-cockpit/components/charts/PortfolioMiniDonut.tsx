import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Icon } from "@/components/Icon";
import type { CustomerStatus } from "@/shared/types";
import type { IPortfolioBucket } from "../../hooks/useCockpitMetrics";
import { EXECUTIVE_COCKPIT_STRINGS as S } from "../../i18n/pt-BR";

export interface IPortfolioMiniDonutProps {
  total: number;
  buckets: IPortfolioBucket[];
  isLoading?: boolean;
  onSliceClick?: (status: CustomerStatus) => void;
}

const STATUS_LABELS: Record<CustomerStatus, string> = {
  ativo: S.statusAtivo,
  dormente: S.statusDormente,
  recuperacao: S.statusRecuperacao,
  perdido: S.statusPerdido,
};

const STATUS_COLORS: Record<CustomerStatus, string> = {
  ativo: "var(--gallo-parts-green, #337648)",
  dormente: "var(--gallo-industrial-yellow, #C79C2C)",
  recuperacao: "var(--primary)",
  perdido: "var(--gallo-service-red, #C4151C)",
};

export function PortfolioMiniDonut({
  total,
  buckets,
  isLoading,
  onSliceClick,
}: IPortfolioMiniDonutProps) {
  const empty = !isLoading && total === 0;
  const chartData = buckets.map((b) => ({ ...b, label: STATUS_LABELS[b.status] }));
  return (
    <Card className="flex h-full flex-col gap-4 p-5">
      <header className="flex items-baseline justify-between">
        <div>
          <h2 className="text-base font-semibold tracking-tight text-foreground">
            {S.chartPortfolio}
          </h2>
          <p className="text-xs text-muted-foreground">{S.chartPortfolioHelp}</p>
        </div>
        <Icon icon="mdi:account-group-outline" size={20} className="text-muted-foreground" />
      </header>
      {isLoading ? (
        <Skeleton className="h-56 w-full" />
      ) : empty ? (
        <p className="py-10 text-center text-sm text-muted-foreground">{S.chartEmpty}</p>
      ) : (
        <div className="flex h-56 w-full items-center gap-4">
          <ResponsiveContainer width="50%" height="100%">
            <PieChart>
              <Tooltip
                contentStyle={{
                  borderRadius: 8,
                  border: "1px solid var(--border)",
                  background: "var(--popover)",
                  color: "var(--popover-foreground)",
                  fontSize: 12,
                }}
                formatter={(value: number, _name, props) => [
                  `${value} (${props.payload.percent}%)`,
                  props.payload.label,
                ]}
              />
              <Pie
                data={chartData}
                dataKey="count"
                nameKey="label"
                cx="50%"
                cy="50%"
                innerRadius={36}
                outerRadius={70}
                paddingAngle={2}
                onClick={
                  onSliceClick ? (entry) => onSliceClick(entry.status as CustomerStatus) : undefined
                }
              >
                {chartData.map((entry) => (
                  <Cell
                    key={entry.status}
                    fill={STATUS_COLORS[entry.status]}
                    style={onSliceClick ? { cursor: "pointer" } : undefined}
                  />
                ))}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
          <ul className="flex flex-1 flex-col gap-2 text-xs">
            {chartData.map((entry) => (
              <li key={entry.status}>
                <button
                  type="button"
                  onClick={() => onSliceClick?.(entry.status)}
                  className="flex w-full items-center gap-2 rounded-md px-1 py-0.5 text-left hover:bg-muted/60"
                  disabled={!onSliceClick}
                >
                  <span
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ background: STATUS_COLORS[entry.status] }}
                    aria-hidden="true"
                  />
                  <span className="flex-1 text-foreground">{entry.label}</span>
                  <span className="font-medium text-muted-foreground">{entry.percent}%</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}
