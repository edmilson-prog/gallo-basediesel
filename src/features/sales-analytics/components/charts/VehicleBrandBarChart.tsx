import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Icon } from "@/components/Icon";
import { formatBRL, formatBRLCompact } from "@/shared/utils/format";
import type { IVehicleBrandBreakdownItem } from "../../hooks/useSalesAnalytics";
import { SALES_ANALYTICS_STRINGS as S } from "../../i18n/pt-BR";

export interface IVehicleBrandBarChartProps {
  data: IVehicleBrandBreakdownItem[];
  isLoading?: boolean;
  onBrandClick?: (brand: string) => void;
}

export function VehicleBrandBarChart({
  data,
  isLoading,
  onBrandClick,
}: IVehicleBrandBarChartProps) {
  const empty = !isLoading && data.length === 0;

  return (
    <Card className="flex h-full flex-col gap-4 p-5">
      <header className="flex items-baseline justify-between">
        <div>
          <h2 className="text-base font-semibold tracking-tight text-foreground">
            {S.chartVehicleBrand}
          </h2>
          <p className="text-xs text-muted-foreground">{S.chartVehicleBrandHelp}</p>
        </div>
        <Icon icon="mdi:truck-outline" size={20} className="text-muted-foreground" />
      </header>
      {isLoading ? (
        <Skeleton className="h-56 w-full" />
      ) : empty ? (
        <p className="py-10 text-center text-sm text-muted-foreground">{S.chartEmpty}</p>
      ) : (
        <div className="h-56 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.4} />
              <XAxis
                dataKey="brand"
                tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                stroke="var(--border)"
                tickLine={false}
              />
              <YAxis
                tickFormatter={(v: number) => formatBRLCompact(v)}
                tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                stroke="var(--border)"
                tickLine={false}
                width={64}
              />
              <Tooltip
                cursor={false}
                contentStyle={{
                  borderRadius: 8,
                  border: "1px solid var(--border)",
                  background: "var(--popover)",
                  color: "var(--popover-foreground)",
                  fontSize: 12,
                }}
                formatter={(value: number, _name, props) => [
                  `${formatBRL(value)} · ${props.payload.orderCount} pedidos`,
                  S.kpiRevenue,
                ]}
              />
              <Bar
                dataKey="revenue"
                fill="var(--primary)"
                radius={[4, 4, 0, 0]}
                onClick={(payload) => {
                  if (onBrandClick && payload?.brand) onBrandClick(payload.brand as string);
                }}
                style={{ cursor: onBrandClick ? "pointer" : "default" }}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  );
}
