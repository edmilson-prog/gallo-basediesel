import { useMemo } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { IOrder } from "@/shared/types";
import { Card } from "@/components/ui/card";
import { formatBRL, formatBRLCompact } from "@/shared/utils/format";
import { usePortalSession } from "../hooks/usePortalSession";
import { usePortalOrders } from "../hooks/usePortalResources";
import { PORTAL_STRINGS as S } from "../i18n/pt-BR";

function monthKey(iso: string): string {
  return iso.slice(0, 7);
}

function buildMonthly(orders: IOrder[]) {
  const map = new Map<string, number>();
  for (const o of orders) {
    if (o.paymentStatus !== "pago") continue;
    const key = monthKey(o.paidAt ?? o.createdAt);
    map.set(key, (map.get(key) ?? 0) + o.total);
  }
  return [...map.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .slice(-6)
    .map(([month, value]) => ({ month, value }));
}

function buildTopParts(orders: IOrder[]) {
  const map = new Map<string, number>();
  for (const o of orders) {
    for (const it of o.items) {
      map.set(it.partName, (map.get(it.partName) ?? 0) + it.total);
    }
  }
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([name, value]) => ({ name, value }));
}

const tooltipStyle = {
  borderRadius: 8,
  border: "1px solid var(--border)",
  background: "var(--popover)",
  color: "var(--popover-foreground)",
  fontSize: 12,
};

export function PortalAnalyticsPage() {
  const { customer } = usePortalSession();
  const { data: orders = [] } = usePortalOrders(customer?.id);

  const monthly = useMemo(() => buildMonthly(orders), [orders]);
  const topParts = useMemo(() => buildTopParts(orders), [orders]);

  return (
    <div className="space-y-4">
      <h1 className="font-display text-2xl font-semibold text-foreground">{S.analyticsTitle}</h1>

      <Card className="space-y-3 p-5">
        <h2 className="text-sm font-semibold text-foreground">{S.chartSpendMonthly}</h2>
        {monthly.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Sem dados.</p>
        ) : (
          <div className="h-56 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={monthly} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.4} />
                <XAxis
                  dataKey="month"
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
                <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => [formatBRL(v), "Gasto"]} />
                <Line
                  type="monotone"
                  dataKey="value"
                  stroke="var(--primary)"
                  strokeWidth={2}
                  dot={{ r: 3 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </Card>

      <Card className="space-y-3 p-5">
        <h2 className="text-sm font-semibold text-foreground">{S.chartTopParts}</h2>
        {topParts.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Sem dados.</p>
        ) : (
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={topParts}
                layout="vertical"
                margin={{ top: 4, right: 12, bottom: 0, left: 8 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.4} horizontal={false} />
                <XAxis
                  type="number"
                  tickFormatter={(v: number) => formatBRLCompact(v)}
                  tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                  stroke="var(--border)"
                  tickLine={false}
                />
                <YAxis
                  type="category"
                  dataKey="name"
                  width={120}
                  tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                  stroke="var(--border)"
                  tickLine={false}
                />
                <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => [formatBRL(v), "Total"]} />
                <Bar dataKey="value" fill="var(--primary)" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </Card>
    </div>
  );
}
