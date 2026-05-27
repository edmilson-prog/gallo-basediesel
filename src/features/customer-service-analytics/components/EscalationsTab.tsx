import { useMemo } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import type { ICustomerServiceMetrics, SdrEscalationReason } from "@/shared/types";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/Icon";
import { formatPercent } from "@/shared/utils/format";
import { CSA_STRINGS as S } from "../i18n/pt-BR";

const REASON_LABEL: Record<SdrEscalationReason, string> = {
  customer_requested: S.reasonCustomerRequested,
  negotiation_detected: S.reasonNegotiationDetected,
  sdr_failed: S.reasonSdrFailed,
  complexity: S.reasonComplexity,
  out_of_scope: S.reasonOutOfScope,
};

const REASON_COLOR: Record<SdrEscalationReason, string> = {
  customer_requested: "var(--gallo-parts-green, #337648)",
  negotiation_detected: "var(--gallo-industrial-yellow, #C79C2C)",
  sdr_failed: "var(--gallo-service-red, #C4151C)",
  complexity: "var(--gallo-info-medium, #3b82f6)",
  out_of_scope: "var(--muted-foreground)",
};

export interface IEscalationsTabProps {
  metrics: ICustomerServiceMetrics;
}

export function EscalationsTab({ metrics }: IEscalationsTabProps) {
  const navigate = useNavigate();
  const { escalations } = metrics;

  const chartData = useMemo(() => {
    return (Object.keys(escalations.byReason) as SdrEscalationReason[])
      .map((reason) => ({
        reason,
        label: REASON_LABEL[reason],
        value: escalations.byReason[reason],
      }))
      .filter((p) => p.value > 0);
  }, [escalations.byReason]);

  return (
    <div className="space-y-5">
      <Card className="flex flex-col gap-2 p-5">
        <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          {S.escAvgTitle}
        </span>
        <span className="text-3xl font-semibold tabular-nums text-foreground">
          {escalations.total}
        </span>
        <p className="text-xs text-muted-foreground">
          Click em um motivo abre o Painel SDR já filtrado.
        </p>
      </Card>

      <section className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <Card className="flex flex-col gap-4 p-5">
          <header className="flex items-baseline justify-between">
            <div>
              <h2 className="text-base font-semibold tracking-tight text-foreground">
                {S.escByReasonTitle}
              </h2>
              <p className="text-xs text-muted-foreground">
                Distribuição percentual dos motivos no período.
              </p>
            </div>
            <Icon icon="mdi:chart-pie" size={20} className="text-muted-foreground" />
          </header>
          {chartData.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">{S.escByReasonEmpty}</p>
          ) : (
            <div className="flex h-60 items-center gap-4">
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
                      `${value} escalações (${formatPercent(value / escalations.total)})`,
                      props.payload.label,
                    ]}
                  />
                  <Pie
                    data={chartData}
                    dataKey="value"
                    nameKey="label"
                    cx="50%"
                    cy="50%"
                    innerRadius={40}
                    outerRadius={80}
                    paddingAngle={2}
                  >
                    {chartData.map((entry) => (
                      <Cell
                        key={entry.reason}
                        fill={REASON_COLOR[entry.reason] ?? "var(--primary)"}
                      />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <ul className="flex flex-1 flex-col gap-2 text-xs">
                {chartData.map((entry) => (
                  <li key={entry.reason} className="flex items-center gap-2">
                    <button
                      type="button"
                      className="flex w-full items-center gap-2 rounded-md px-1 py-1 text-left hover:bg-accent/40"
                      onClick={() => void navigate({ to: "/app/sdr" })}
                    >
                      <span
                        className="h-2.5 w-2.5 rounded-full"
                        style={{ background: REASON_COLOR[entry.reason] ?? "var(--primary)" }}
                        aria-hidden="true"
                      />
                      <span className="flex-1 truncate text-foreground">{entry.label}</span>
                      <span className="font-medium text-muted-foreground">{entry.value}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Card>

        <Card className="flex flex-col gap-4 p-5">
          <header className="flex items-baseline justify-between">
            <div>
              <h2 className="text-base font-semibold tracking-tight text-foreground">
                {S.escTopSellersTitle}
              </h2>
              <p className="text-xs text-muted-foreground">
                Vendedores que receberam mais transferências no período.
              </p>
            </div>
            <Icon icon="mdi:account-multiple-outline" size={20} className="text-muted-foreground" />
          </header>
          {escalations.bySeller.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              Nenhuma escalação atribuída.
            </p>
          ) : (
            <ul className="divide-y divide-border/60 text-sm">
              {escalations.bySeller.slice(0, 8).map((row) => (
                <li key={row.sellerId} className="flex items-baseline justify-between gap-2 py-2">
                  <span className="truncate font-medium text-foreground">{row.sellerName}</span>
                  <span className="shrink-0 tabular-nums text-muted-foreground">
                    {row.total} escalaçõ{row.total === 1 ? "" : "es"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </section>
    </div>
  );
}
