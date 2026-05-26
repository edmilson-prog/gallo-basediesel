import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/Icon";
import { FAQ_CATEGORY_LABEL } from "../config/labels";

export interface ISdrFaqBarChartProps {
  data: { category: string; resolved: number; escalated: number }[];
}

export function SdrFaqBarChart({ data }: ISdrFaqBarChartProps) {
  const empty = data.every((d) => d.resolved === 0 && d.escalated === 0);
  const localized = data.map((d) => ({
    ...d,
    label: FAQ_CATEGORY_LABEL[d.category] ?? d.category,
  }));

  return (
    <Card className="flex h-full flex-col gap-4 p-5">
      <header className="flex items-baseline justify-between">
        <div>
          <h2 className="text-base font-semibold tracking-tight text-foreground">
            FAQ resolvido vs escalado
          </h2>
          <p className="text-xs text-muted-foreground">
            Quanto o SDR fechou sozinho versus precisou passar pra humano.
          </p>
        </div>
        <Icon icon="mdi:chart-bar" size={20} className="text-muted-foreground" />
      </header>
      {empty ? (
        <p className="py-10 text-center text-sm text-muted-foreground">
          Sem perguntas frequentes detectadas no período.
        </p>
      ) : (
        <div className="h-56 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={localized} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.4} />
              <XAxis
                dataKey="label"
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
              />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar
                dataKey="resolved"
                name="Resolvido"
                stackId="a"
                fill="#10b981"
                radius={[4, 4, 0, 0]}
              />
              <Bar
                dataKey="escalated"
                name="Escalado"
                stackId="a"
                fill="#f59e0b"
                radius={[4, 4, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  );
}
