import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/Icon";
import { ESCALATION_MODE_COLOR, ESCALATION_MODE_LABEL } from "../config/labels";

export interface ISdrTtfrBarChartProps {
  data: { mode: "urgent" | "normal" | "standard"; seconds: number; samples: number }[];
}

function formatSeconds(value: number): string {
  if (value <= 0) return "—";
  if (value < 60) return `${value}s`;
  const minutes = Math.floor(value / 60);
  const rem = value % 60;
  return rem > 0 ? `${minutes}m ${rem}s` : `${minutes}m`;
}

export function SdrTtfrBarChart({ data }: ISdrTtfrBarChartProps) {
  const empty = data.every((d) => d.samples === 0);
  const chartData = data.map((d) => ({
    label: ESCALATION_MODE_LABEL[d.mode],
    seconds: d.seconds,
    samples: d.samples,
    color: ESCALATION_MODE_COLOR[d.mode],
  }));

  return (
    <Card className="flex h-full flex-col gap-4 p-5">
      <header className="flex items-baseline justify-between">
        <div>
          <h2 className="text-base font-semibold tracking-tight text-foreground">
            TTFR por modo de escalação
          </h2>
          <p className="text-xs text-muted-foreground">
            Tempo médio até a primeira resposta humana — quanto mais baixo, melhor.
          </p>
        </div>
        <Icon icon="mdi:speedometer" size={20} className="text-muted-foreground" />
      </header>
      {empty ? (
        <p className="py-10 text-center text-sm text-muted-foreground">
          Sem escalações com resposta humana no período.
        </p>
      ) : (
        <div className="h-56 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.4} />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                stroke="var(--border)"
                tickLine={false}
              />
              <YAxis
                allowDecimals={false}
                tickFormatter={formatSeconds}
                tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                stroke="var(--border)"
                tickLine={false}
                width={48}
              />
              <Tooltip
                contentStyle={{
                  borderRadius: 8,
                  border: "1px solid var(--border)",
                  background: "var(--popover)",
                  color: "var(--popover-foreground)",
                  fontSize: 12,
                }}
                formatter={(value: number, _name, props) => [
                  `${formatSeconds(value)} (${props.payload.samples} amostras)`,
                  "TTFR médio",
                ]}
              />
              <Bar dataKey="seconds" radius={[4, 4, 0, 0]}>
                {chartData.map((entry) => (
                  <Cell key={entry.label} fill={entry.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  );
}
