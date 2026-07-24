import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { IConversation, ICustomerServiceMetrics } from "@/shared/types";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/Icon";
import { bucketConversationsByHour } from "../engine/hourlyActivity";
import type { SellerPeriodKey } from "../engine/period";
import { SELLER_DASHBOARD_STRINGS as S } from "../i18n/pt-BR";

interface ISellerActivityChartProps {
  period: SellerPeriodKey;
  metrics: ICustomerServiceMetrics | null;
  conversationsCurrent: IConversation[];
  now?: Date;
}

export function SellerActivityChart({
  period,
  metrics,
  conversationsCurrent,
  now = new Date(),
}: ISellerActivityChartProps) {
  const data =
    period === "hoje"
      ? bucketConversationsByHour(conversationsCurrent, now.toISOString()).map((p) => ({
          label: p.label,
          value: p.count,
        }))
      : (metrics?.trendDaily ?? []).map((p) => ({
          label: p.dayKey.slice(5),
          value: p.totalConversations,
        }));

  const total = data.reduce((sum, p) => sum + p.value, 0);
  const title = period === "hoje" ? S.chartTitleHourly : S.chartTitleDaily;

  return (
    <Card className="p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <Icon icon="mdi:chart-bar" size={16} className="text-muted-foreground" />
          {title}
        </div>
        <span className="text-xs text-muted-foreground">
          {total} {S.chartInPeriod}
        </span>
      </div>
      <div className="h-32 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: 4 }}>
            <XAxis
              dataKey="label"
              tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
              stroke="var(--border)"
              tickLine={false}
            />
            <YAxis hide allowDecimals={false} />
            <Tooltip
              contentStyle={{
                borderRadius: 8,
                border: "1px solid var(--border)",
                background: "var(--popover)",
                color: "var(--popover-foreground)",
                fontSize: 12,
              }}
              formatter={(value: number) => [`${value}`, S.chartTooltipLabel]}
            />
            <Bar dataKey="value" fill="var(--primary)" radius={[4, 4, 2, 2]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}
