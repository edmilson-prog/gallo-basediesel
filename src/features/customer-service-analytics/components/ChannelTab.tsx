import { useMemo } from "react";
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
import type { IChannelServiceMetrics, ICustomerServiceMetrics } from "@/shared/types";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/Icon";
import { formatPercent } from "@/shared/utils/format";
import { formatDuration } from "../utils/time";
import { CSA_STRINGS as S } from "../i18n/pt-BR";

export interface IChannelTabProps {
  metrics: ICustomerServiceMetrics;
}

const CHANNEL_LABELS: Record<string, string> = {
  whatsapp: "WhatsApp",
  ecommerce: "E-commerce",
  phone: "Telefone",
  site: "Site",
  sdr: "SDR",
  outros: "Outros",
};

const CHANNEL_COLORS: Record<string, string> = {
  whatsapp: "var(--gallo-parts-green, #337648)",
  phone: "var(--primary)",
  ecommerce: "var(--gallo-industrial-yellow, #C79C2C)",
  site: "var(--gallo-service-red, #C4151C)",
  sdr: "var(--gallo-info-medium, #3b82f6)",
  outros: "var(--muted-foreground)",
};

export function ChannelTab({ metrics }: IChannelTabProps) {
  const chartData = useMemo(
    () =>
      metrics.byChannel.map((row) => ({
        ...row,
        label: CHANNEL_LABELS[row.channel] ?? row.channel,
      })),
    [metrics.byChannel],
  );

  if (metrics.byChannel.length === 0) {
    return <Card className="p-10 text-center text-sm text-muted-foreground">{S.channelEmpty}</Card>;
  }

  return (
    <div className="space-y-5">
      <Card className="flex flex-col gap-4 p-5">
        <header className="flex items-baseline justify-between">
          <div>
            <h2 className="text-base font-semibold tracking-tight text-foreground">
              {S.chartChannelTitle}
            </h2>
            <p className="text-xs text-muted-foreground">{S.chartChannelHelp}</p>
          </div>
          <Icon icon="mdi:chart-bar" size={20} className="text-muted-foreground" />
        </header>
        <div className="h-60 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 8, right: 16, bottom: 0, left: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.4} />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                stroke="var(--border)"
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                stroke="var(--border)"
                tickLine={false}
                width={32}
                allowDecimals={false}
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
                formatter={(value: number) => [`${value} conversas`, "Volume"]}
              />
              <Bar dataKey="totalConversations" radius={[4, 4, 0, 0]}>
                {chartData.map((entry) => (
                  <Cell
                    key={entry.channel}
                    fill={CHANNEL_COLORS[entry.channel] ?? "var(--primary)"}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <Card className="overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30 text-xs uppercase tracking-wider text-muted-foreground">
                <th className="px-4 py-2 text-left font-medium">{S.tableChannel}</th>
                <th className="px-4 py-2 text-right font-medium">{S.tableVolume}</th>
                <th className="px-4 py-2 text-right font-medium">{S.kpiTma}</th>
                <th className="px-4 py-2 text-right font-medium">{S.kpiTmr}</th>
                <th className="px-4 py-2 text-right font-medium">{S.kpiResolution}</th>
                <th className="px-4 py-2 text-right font-medium">{S.kpiConversion}</th>
              </tr>
            </thead>
            <tbody>
              {chartData.map((row: IChannelServiceMetrics & { label: string }) => (
                <tr
                  key={row.channel}
                  className="border-b border-border/60 last:border-b-0 hover:bg-accent/20"
                >
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <span
                        className="h-2.5 w-2.5 rounded-full"
                        style={{ background: CHANNEL_COLORS[row.channel] ?? "var(--primary)" }}
                        aria-hidden="true"
                      />
                      <span className="font-medium text-foreground">{row.label}</span>
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{row.totalConversations}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">
                    {formatDuration(row.averageHandleTime)}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">
                    {formatDuration(row.averageResponseTime)}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums">
                    {formatPercent(row.resolutionRate)}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums">
                    {formatPercent(row.conversionRate)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
