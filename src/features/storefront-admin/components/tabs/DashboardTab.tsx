import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { ID } from "@/shared/types";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Icon } from "@/components/Icon";
import { formatBRL } from "@/shared/utils/format";
import { useEcommerceMetrics } from "../../hooks/useEcommerceMetrics";
import { KpiCard } from "../KpiCard";
import { STOREFRONT_ADMIN_STRINGS as S } from "../../i18n/pt-BR";

export interface IDashboardTabProps {
  storeId: ID;
}

function dayTick(value: string): string {
  const [, month, day] = value.split("-");
  return `${day}/${month}`;
}

export function DashboardTab({ storeId }: IDashboardTabProps) {
  const { data, isLoading } = useEcommerceMetrics(storeId);

  const empty = !isLoading && (data?.daily.every((p) => p.orders === 0) ?? true);

  return (
    <div className="space-y-6">
      <Card className="flex items-start gap-3 border-primary/30 bg-primary/5 p-4">
        <Icon icon="mdi:information-outline" size={18} className="mt-0.5 text-primary" />
        <p className="text-xs text-muted-foreground">{S.phase2Banner}</p>
      </Card>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <KpiCard
          label={S.kpiVisits}
          value="2.480"
          icon="mdi:eye-outline"
          badge="mock"
          badgeLabel={S.badgeMock}
        />
        <KpiCard
          label={S.kpiOrders}
          value={isLoading ? "—" : String(data?.orderCount ?? 0)}
          icon="mdi:cart-check"
          badge="real"
          badgeLabel={S.badgeReal}
        />
        <KpiCard
          label={S.kpiConversion}
          value="3,2%"
          icon="mdi:percent-outline"
          badge="mock"
          badgeLabel={S.badgeMock}
        />
        <KpiCard
          label={S.kpiTicket}
          value={isLoading ? "—" : formatBRL(data?.averageTicket ?? 0)}
          icon="mdi:cash-multiple"
          badge="real"
          badgeLabel={S.badgeReal}
        />
        <KpiCard
          label={S.kpiAbandoned}
          value="34"
          icon="mdi:cart-remove"
          badge="phase2"
          badgeLabel={S.badgePhase2}
        />
        <KpiCard
          label={S.kpiPending}
          value={isLoading ? "—" : String(data?.pendingCount ?? 0)}
          icon="mdi:clock-alert-outline"
          badge="real"
          badgeLabel={S.badgeReal}
        />
      </div>

      <Card className="flex flex-col gap-4 p-5">
        <header className="flex items-baseline justify-between">
          <div>
            <h2 className="text-base font-semibold tracking-tight text-foreground">
              {S.chartOrdersTitle}
            </h2>
            <p className="text-xs text-muted-foreground">{S.chartOrdersHelp}</p>
          </div>
          <Icon icon="mdi:chart-line" size={20} className="text-muted-foreground" />
        </header>
        {isLoading ? (
          <Skeleton className="h-56 w-full" />
        ) : empty ? (
          <p className="py-10 text-center text-sm text-muted-foreground">{S.chartEmpty}</p>
        ) : (
          <div className="h-56 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data?.daily} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.4} />
                <XAxis
                  dataKey="date"
                  tickFormatter={dayTick}
                  tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                  stroke="var(--border)"
                  tickLine={false}
                  minTickGap={24}
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
                  formatter={(value: number) => [String(value), S.kpiOrders]}
                />
                <Line
                  type="monotone"
                  dataKey="orders"
                  stroke="var(--primary)"
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 5 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </Card>
    </div>
  );
}
