import {
  CartesianGrid,
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

export interface ISdrVolumeChartProps {
  data: { date: string; count: number }[];
  isLoading?: boolean;
}

function formatTickDate(value: string): string {
  const date = new Date(`${value}T00:00:00`);
  return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

export function SdrVolumeChart({ data, isLoading }: ISdrVolumeChartProps) {
  const empty = data.every((d) => d.count === 0);

  return (
    <Card className="flex h-full flex-col gap-4 p-5">
      <header className="flex items-baseline justify-between">
        <div>
          <h2 className="text-base font-semibold tracking-tight text-foreground">
            Volume diário de sessões
          </h2>
          <p className="text-xs text-muted-foreground">
            Linha temporal das sessões abertas no período selecionado.
          </p>
        </div>
        <Icon icon="mdi:chart-line" size={20} className="text-muted-foreground" />
      </header>
      {isLoading ? (
        <Skeleton className="h-48 w-full" />
      ) : empty ? (
        <p className="py-10 text-center text-sm text-muted-foreground">
          Sem dados no período selecionado.
        </p>
      ) : (
        <div className="h-48 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.4} />
              <XAxis
                dataKey="date"
                tickFormatter={formatTickDate}
                tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                stroke="var(--border)"
                tickLine={false}
              />
              <YAxis
                allowDecimals={false}
                tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                stroke="var(--border)"
                tickLine={false}
                width={32}
              />
              <Tooltip
                contentStyle={{
                  borderRadius: 8,
                  border: "1px solid var(--border)",
                  background: "var(--popover)",
                  color: "var(--popover-foreground)",
                  fontSize: 12,
                }}
                labelFormatter={formatTickDate}
                formatter={(value: number) => [`${value} sessão(ões)`, "Volume"]}
              />
              <Line
                type="monotone"
                dataKey="count"
                stroke="var(--primary)"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  );
}
