import { useMemo } from "react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { formatBRL, formatPercent } from "@/shared/utils/format";
import { HealthBadge } from "./HealthBadge";
import { PROFITABILITY_STRINGS as S } from "../i18n/pt-BR";
import type { ISellerProfitabilityRow } from "../engine";

export interface ISellerTabProps {
  rows: ISellerProfitabilityRow[];
}

export function SellerTab({ rows }: ISellerTabProps) {
  const sorted = useMemo(() => [...rows].sort((a, b) => b.marginPct - a.marginPct), [rows]);

  const avgMargin = useMemo(() => {
    if (rows.length === 0) return 0;
    return rows.reduce((sum, r) => sum + r.marginPct, 0) / rows.length;
  }, [rows]);

  if (rows.length === 0) {
    return <Card className="p-10 text-center text-sm text-muted-foreground">{S.sellerEmpty}</Card>;
  }

  return (
    <Card className="overflow-hidden p-0">
      <div className="border-b border-border bg-muted/20 px-4 py-3 text-xs text-muted-foreground">
        Margem média da equipe:{" "}
        <span className="font-semibold tabular-nums text-foreground">
          {formatPercent(avgMargin)}
        </span>{" "}
        — vendedores abaixo da média aparecem destacados em amarelo.
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[700px] text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/30 text-xs uppercase tracking-wider text-muted-foreground">
              <th className="px-4 py-3 text-left font-medium">Vendedor</th>
              <th className="px-4 py-3 text-right font-medium">{S.tableRevenue}</th>
              <th className="px-4 py-3 text-right font-medium">{S.tableMargin}</th>
              <th className="px-4 py-3 text-right font-medium">{S.tableMarginPct}</th>
              <th className="px-4 py-3 text-right font-medium">{S.sellerDiscountColumn}</th>
              <th className="px-4 py-3 text-right font-medium">{S.tableOrders}</th>
              <th className="px-4 py-3 text-center font-medium">Saúde</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((row) => {
              const belowAverage = row.marginPct < avgMargin;
              return (
                <tr
                  key={row.key}
                  className={cn(
                    "border-b border-border/60 last:border-b-0",
                    belowAverage && "bg-warning/5",
                  )}
                >
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-foreground">{row.label}</span>
                      {belowAverage && (
                        <span className="rounded-full bg-warning/10 px-2 py-0.5 text-[10px] font-medium text-warning">
                          Abaixo da média
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{formatBRL(row.revenue)}</td>
                  <td
                    className={cn(
                      "px-4 py-2.5 text-right tabular-nums font-semibold",
                      row.margin < 0 && "text-destructive",
                    )}
                  >
                    {formatBRL(row.margin)}
                  </td>
                  <td
                    className={cn(
                      "px-4 py-2.5 text-right tabular-nums",
                      row.marginPct < 0 && "text-destructive",
                    )}
                  >
                    {formatPercent(row.marginPct)}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">
                    {formatPercent(row.avgDiscountPct)}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">
                    {row.orderCount}
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    <HealthBadge health={row.health} />
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
