import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Icon } from "@/components/Icon";
import { formatBRL, formatBRLCompact, formatPercent } from "@/shared/utils/format";
import type { ICategoryBreakdownItem } from "../../hooks/useSalesAnalytics";
import { SALES_ANALYTICS_STRINGS as S } from "../../i18n/pt-BR";

export interface ICategoryBarChartProps {
  data: ICategoryBreakdownItem[];
  isLoading?: boolean;
  onCategoryClick?: (category: ICategoryBreakdownItem["category"]) => void;
}

const CATEGORY_LABELS: Record<string, string> = {
  filtro: "Filtros",
  freio: "Freios",
  correia: "Correias",
  motor: "Motor",
  embreagem: "Embreagem",
  eletrica: "Elétrica",
  transmissao: "Transmissão",
  suspensao: "Suspensão",
  arrefecimento: "Arrefecimento",
  lubrificante: "Lubrificantes",
  outros: "Outros",
};

export function CategoryBarChart({ data, isLoading, onCategoryClick }: ICategoryBarChartProps) {
  const empty = !isLoading && data.length === 0;
  const chartData = data.map((d) => ({
    ...d,
    label: CATEGORY_LABELS[d.category] ?? d.category,
  }));

  return (
    <Card className="flex h-full flex-col gap-4 p-5">
      <header className="flex items-baseline justify-between">
        <div>
          <h2 className="text-base font-semibold tracking-tight text-foreground">
            {S.chartCategory}
          </h2>
          <p className="text-xs text-muted-foreground">{S.chartCategoryHelp}</p>
        </div>
        <Icon icon="mdi:shape-outline" size={20} className="text-muted-foreground" />
      </header>
      {isLoading ? (
        <Skeleton className="h-56 w-full" />
      ) : empty ? (
        <p className="py-10 text-center text-sm text-muted-foreground">{S.chartEmpty}</p>
      ) : (
        <div className="h-56 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={chartData}
              layout="vertical"
              margin={{ top: 4, right: 16, bottom: 0, left: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.4} />
              <XAxis
                type="number"
                tickFormatter={(v: number) => formatBRLCompact(v)}
                tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                stroke="var(--border)"
                tickLine={false}
              />
              <YAxis
                type="category"
                dataKey="label"
                tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                stroke="var(--border)"
                tickLine={false}
                width={104}
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
                  `${formatBRL(value)} (${formatPercent(props.payload.share)})`,
                  S.kpiRevenue,
                ]}
              />
              <Bar
                dataKey="revenue"
                fill="var(--primary)"
                radius={[0, 4, 4, 0]}
                onClick={(_, idx) => {
                  if (onCategoryClick) onCategoryClick(chartData[idx].category);
                }}
                style={{ cursor: onCategoryClick ? "pointer" : "default" }}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  );
}
