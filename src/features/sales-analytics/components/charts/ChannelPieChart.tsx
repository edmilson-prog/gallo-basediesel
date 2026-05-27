import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Icon } from "@/components/Icon";
import { formatBRL, formatPercent } from "@/shared/utils/format";
import type { IChannelBreakdownItem } from "../../hooks/useSalesAnalytics";
import { SALES_ANALYTICS_STRINGS as S } from "../../i18n/pt-BR";

export interface IChannelPieChartProps {
  data: IChannelBreakdownItem[];
  isLoading?: boolean;
}

const CHANNEL_LABELS: Record<string, string> = {
  whatsapp: S.channelLabelWhatsapp,
  manual: S.channelLabelManual,
  portal: S.channelLabelPortal,
  ecommerce: S.channelLabelEcommerce,
};

// GALLO semantic palette (uses brand greens/golds/reds via CSS tokens)
const CHANNEL_COLORS: Record<string, string> = {
  whatsapp: "var(--gallo-parts-green, #337648)",
  manual: "var(--primary)",
  portal: "var(--gallo-industrial-yellow, #C79C2C)",
  ecommerce: "var(--gallo-service-red, #C4151C)",
};

export function ChannelPieChart({ data, isLoading }: IChannelPieChartProps) {
  const empty = !isLoading && data.length === 0;
  const chartData = data.map((d) => ({ ...d, label: CHANNEL_LABELS[d.channel] ?? d.channel }));

  return (
    <Card className="flex h-full flex-col gap-4 p-5">
      <header className="flex items-baseline justify-between">
        <div>
          <h2 className="text-base font-semibold tracking-tight text-foreground">
            {S.chartChannel}
          </h2>
          <p className="text-xs text-muted-foreground">{S.chartChannelHelp}</p>
        </div>
        <Icon icon="mdi:swap-horizontal" size={20} className="text-muted-foreground" />
      </header>
      {isLoading ? (
        <Skeleton className="h-56 w-full" />
      ) : empty ? (
        <p className="py-10 text-center text-sm text-muted-foreground">{S.chartEmpty}</p>
      ) : (
        <div className="flex h-56 w-full items-center gap-4">
          <ResponsiveContainer width="55%" height="100%">
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
                  `${formatBRL(value)} (${formatPercent(props.payload.share)})`,
                  props.payload.label,
                ]}
              />
              <Pie
                data={chartData}
                dataKey="revenue"
                nameKey="label"
                cx="50%"
                cy="50%"
                innerRadius={36}
                outerRadius={70}
                paddingAngle={2}
              >
                {chartData.map((entry) => (
                  <Cell
                    key={entry.channel}
                    fill={CHANNEL_COLORS[entry.channel] ?? "var(--primary)"}
                  />
                ))}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
          <ul className="flex flex-1 flex-col gap-2 text-xs">
            {chartData.map((entry) => (
              <li key={entry.channel} className="flex items-center gap-2">
                <span
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ background: CHANNEL_COLORS[entry.channel] ?? "var(--primary)" }}
                  aria-hidden="true"
                />
                <span className="flex-1 text-foreground">{entry.label}</span>
                <span className="font-medium text-muted-foreground">
                  {formatPercent(entry.share)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}
