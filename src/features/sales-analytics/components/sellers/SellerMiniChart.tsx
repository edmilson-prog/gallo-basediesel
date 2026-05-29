import { Area, AreaChart, ReferenceLine, ResponsiveContainer, YAxis } from "recharts";

export interface ISellerMiniChartProps {
  /** Cumulative paid revenue per day-of-month (null after today). */
  dailySeries: (number | null)[];
  /** Monthly target for the reference line; null hides it. */
  target: number | null;
}

export function SellerMiniChart({ dailySeries, target }: ISellerMiniChartProps) {
  const data = dailySeries.map((v, i) => ({ day: i + 1, vendas: v }));
  return (
    <div className="h-28 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 6, right: 4, bottom: 0, left: 4 }}>
          <defs>
            <linearGradient id="sellerMiniArea" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="var(--primary)" stopOpacity={0.3} />
              <stop offset="95%" stopColor="var(--primary)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <YAxis hide domain={[0, "dataMax"]} />
          {target != null && target > 0 && (
            <ReferenceLine y={target} stroke="var(--muted-foreground)" strokeDasharray="4 4" strokeWidth={1.2} />
          )}
          <Area
            type="monotone"
            dataKey="vendas"
            stroke="var(--primary)"
            strokeWidth={2}
            fill="url(#sellerMiniArea)"
            connectNulls
            dot={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
