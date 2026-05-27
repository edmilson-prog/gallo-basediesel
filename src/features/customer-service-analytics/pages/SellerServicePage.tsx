import { useMemo } from "react";
import { Link, useParams } from "@tanstack/react-router";
import {
  CartesianGrid,
  Legend,
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
import { Button } from "@/components/ui/button";
import { useAuth } from "@/features/auth/useAuth";
import { useCurrentStore } from "@/features/multistore";
import { EmptyState } from "@/features/shell/components/EmptyState";
import { formatPercent } from "@/shared/utils/format";
import { useCustomerServiceMetrics } from "../hooks/useCustomerServiceMetrics";
import { formatDuration } from "../utils/time";
import { CSA_STRINGS as S } from "../i18n/pt-BR";

const ALLOWED_ROLES = new Set(["Owner", "Gestor", "Financeiro"]);
const ROUTE_ID = "/app/gestao/atendimento-analise/$sellerId" as const;

function currentMonthKey(now: Date = new Date()): string {
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function SellerServicePage() {
  const { userRole } = useAuth();
  const { currentStore } = useCurrentStore();
  const storeId = currentStore?.id ?? "store-matriz";
  const { sellerId } = useParams({ from: ROUTE_ID });

  const overall = useCustomerServiceMetrics({ storeId, monthKey: currentMonthKey() });
  const sellerScoped = useCustomerServiceMetrics({
    storeId,
    monthKey: currentMonthKey(),
    sellerId: sellerId as ID,
  });

  const sellerName = useMemo(
    () => overall.sellers.find((s) => s.id === sellerId)?.fullName ?? "Vendedor",
    [overall.sellers, sellerId],
  );

  const teamHealth = useMemo(() => {
    if (!overall.metrics || overall.metrics.bySeller.length === 0) return 0;
    return (
      overall.metrics.bySeller.reduce((sum, r) => sum + r.healthScore, 0) /
      overall.metrics.bySeller.length
    );
  }, [overall.metrics]);

  const trendChart = useMemo(() => {
    if (!sellerScoped.metrics) return [];
    return sellerScoped.metrics.trendMonthly.map((p) => ({
      ...p,
      tmaMinutes: Math.round(p.averageHandleTime / 60_000),
      tmrMinutes: Math.round(p.averageResponseTime / 60_000),
    }));
  }, [sellerScoped.metrics]);

  if (!userRole || !ALLOWED_ROLES.has(userRole)) {
    return (
      <EmptyState
        icon="mdi:shield-lock-outline"
        title={S.blockedTitle}
        description={S.blockedDescription}
        actionLabel="Voltar ao início"
        actionTo="/app/inicio"
      />
    );
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-2 border-b border-border pb-5">
        <Link
          to="/app/gestao/atendimento-analise"
          className="inline-flex w-fit items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
        >
          <Icon icon="mdi:arrow-left" size={14} />
          {S.drillBack}
        </Link>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">
              {S.drillTitle}
              {sellerName}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Métricas individuais de atendimento e evolução nos últimos 12 meses.
            </p>
          </div>
          <Button asChild variant="outline" size="sm">
            <Link to="/app/gestao/atendimento-analise">
              <Icon icon="mdi:view-dashboard-outline" size={14} className="mr-1.5" />
              Voltar à análise
            </Link>
          </Button>
        </div>
      </header>

      {sellerScoped.isLoading || !sellerScoped.metrics ? (
        <Skeleton className="h-96 w-full" />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Kpi
              label={S.kpiVolume}
              value={String(sellerScoped.metrics.totals.totalConversations)}
            />
            <Kpi
              label={S.kpiTma}
              value={formatDuration(sellerScoped.metrics.totals.averageHandleTime)}
            />
            <Kpi
              label={S.kpiTmr}
              value={formatDuration(sellerScoped.metrics.totals.averageResponseTime)}
            />
            <Kpi
              label={S.kpiResolution}
              value={formatPercent(sellerScoped.metrics.totals.resolutionRate)}
            />
          </div>

          <Card className="flex flex-col gap-4 p-5">
            <header className="flex items-baseline justify-between">
              <div>
                <h2 className="text-base font-semibold text-foreground">{S.chartTrendTitle}</h2>
                <p className="text-xs text-muted-foreground">{S.chartTrendHelp}</p>
              </div>
              <Icon icon="mdi:chart-line" size={20} className="text-muted-foreground" />
            </header>
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trendChart} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.4} />
                  <XAxis
                    dataKey="monthLabel"
                    tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                    stroke="var(--border)"
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                    stroke="var(--border)"
                    tickLine={false}
                    width={48}
                    tickFormatter={(v: number) => `${v}min`}
                  />
                  <Tooltip
                    contentStyle={{
                      borderRadius: 8,
                      border: "1px solid var(--border)",
                      background: "var(--popover)",
                      color: "var(--popover-foreground)",
                      fontSize: 12,
                    }}
                    formatter={(value: number, name) => [`${value} min`, name]}
                  />
                  <Legend wrapperStyle={{ fontSize: 11 }} iconSize={10} />
                  <Line
                    type="monotone"
                    dataKey="tmaMinutes"
                    name="TMA"
                    stroke="var(--gallo-industrial-yellow, #C79C2C)"
                    strokeWidth={2}
                  />
                  <Line
                    type="monotone"
                    dataKey="tmrMinutes"
                    name="TMR"
                    stroke="var(--gallo-parts-green, #337648)"
                    strokeWidth={2}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <Card className="flex flex-col gap-2 p-5">
            <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              {S.drillTeamAverage}
            </span>
            <p className="text-sm text-foreground">
              Health score individual:{" "}
              <span className="font-semibold tabular-nums">
                {sellerScoped.metrics.bySeller.find((s) => s.sellerId === sellerId)?.healthScore ??
                  "—"}
              </span>{" "}
              · Média da equipe:{" "}
              <span className="font-semibold tabular-nums">{teamHealth.toFixed(0)}</span>
            </p>
          </Card>
        </>
      )}
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <Card className="flex flex-col gap-1 p-4">
      <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      <span className="text-2xl font-semibold tabular-nums text-foreground">{value}</span>
    </Card>
  );
}
