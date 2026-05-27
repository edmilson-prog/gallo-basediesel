import { useMemo } from "react";
import { useNavigate } from "@tanstack/react-router";
import type { ICustomerServiceMetrics } from "@/shared/types";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { formatPercent } from "@/shared/utils/format";
import { formatDuration } from "../utils/time";
import { CSA_STRINGS as S } from "../i18n/pt-BR";

export interface ISellerTabProps {
  metrics: ICustomerServiceMetrics;
}

export function SellerTab({ metrics }: ISellerTabProps) {
  const navigate = useNavigate();

  const teamAverage = useMemo(() => {
    if (metrics.bySeller.length === 0) return 0;
    return metrics.bySeller.reduce((sum, r) => sum + r.healthScore, 0) / metrics.bySeller.length;
  }, [metrics.bySeller]);

  if (metrics.bySeller.length === 0) {
    return <Card className="p-10 text-center text-sm text-muted-foreground">{S.sellerEmpty}</Card>;
  }

  return (
    <Card className="overflow-hidden p-0">
      <div className="border-b border-border bg-muted/20 px-4 py-3 text-xs text-muted-foreground">
        Health médio da equipe:{" "}
        <span className="font-semibold tabular-nums text-foreground">{teamAverage.toFixed(0)}</span>{" "}
        / 100 — vendedores abaixo da média aparecem destacados.
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[820px] text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/30 text-xs uppercase tracking-wider text-muted-foreground">
              <th className="px-4 py-2 text-left font-medium">{S.tableSellerHeader}</th>
              <th className="px-4 py-2 text-right font-medium">Conversas</th>
              <th className="px-4 py-2 text-right font-medium">{S.kpiTma}</th>
              <th className="px-4 py-2 text-right font-medium">{S.kpiTmr}</th>
              <th className="px-4 py-2 text-right font-medium">{S.kpiResolution}</th>
              <th className="px-4 py-2 text-right font-medium">{S.kpiConversion}</th>
              <th className="px-4 py-2 text-right font-medium">{S.tableHealth}</th>
            </tr>
          </thead>
          <tbody>
            {metrics.bySeller.map((row) => {
              const below = row.healthScore < teamAverage;
              return (
                <tr
                  key={row.sellerId}
                  className={cn(
                    "cursor-pointer border-b border-border/60 last:border-b-0 hover:bg-accent/40",
                    below && "bg-warning/5",
                  )}
                  onClick={() =>
                    void navigate({
                      to: "/app/gestao/atendimento-analise/$sellerId",
                      params: { sellerId: row.sellerId },
                    })
                  }
                >
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-foreground">{row.sellerName}</span>
                      {below && (
                        <span className="rounded-full bg-warning/10 px-2 py-0.5 text-[10px] font-medium text-warning">
                          {S.sellerBelowAverage}
                        </span>
                      )}
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
                  <td className="px-4 py-2.5 text-right">
                    <span
                      className={cn(
                        "inline-flex h-6 min-w-[2.25rem] items-center justify-center rounded-full px-2 text-xs font-semibold tabular-nums",
                        row.healthScore >= 80
                          ? "bg-success/15 text-success"
                          : row.healthScore >= 60
                            ? "bg-warning/15 text-warning"
                            : "bg-destructive/15 text-destructive",
                      )}
                    >
                      {row.healthScore}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
