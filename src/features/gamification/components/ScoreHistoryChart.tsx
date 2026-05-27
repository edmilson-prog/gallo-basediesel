import { Card } from "@/components/ui/card";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { GAMIFICATION_STRINGS as S } from "../i18n/pt-BR";

export interface IScoreHistoryPoint {
  label: string;
  score: number;
}

interface IScoreHistoryChartProps {
  data: IScoreHistoryPoint[];
}

/** Sparkline-style line chart for the last 6 mensal scores. */
export function ScoreHistoryChart({ data }: IScoreHistoryChartProps) {
  return (
    <Card className="flex flex-col gap-3 p-5">
      <div>
        <h2 className="text-base font-semibold text-foreground">{S.detailHistoryTitle}</h2>
        <p className="text-xs text-muted-foreground">{S.detailHistorySubtitle}</p>
      </div>
      <div className="h-48">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 10, right: 10, bottom: 0, left: 0 }}>
            <CartesianGrid stroke="hsl(var(--border))" strokeOpacity={0.4} strokeDasharray="3 3" />
            <XAxis
              dataKey="label"
              tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              width={36}
            />
            <Tooltip
              cursor={{ stroke: "hsl(var(--accent))", strokeWidth: 1 }}
              formatter={(value: number) => [`${value.toLocaleString("pt-BR")} pts`, "Score"]}
              contentStyle={{
                background: "hsl(var(--popover))",
                border: "1px solid hsl(var(--border))",
                borderRadius: 6,
                fontSize: 12,
              }}
            />
            <Line
              type="monotone"
              dataKey="score"
              stroke="var(--accent)"
              strokeWidth={2}
              dot={{ r: 3, fill: "var(--accent)", stroke: "var(--background)", strokeWidth: 2 }}
              activeDot={{ r: 5 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}
