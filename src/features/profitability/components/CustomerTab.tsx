import { useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import type { ID } from "@/shared/types";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/Icon";
import { cn } from "@/lib/utils";
import { formatBRL, formatPercent } from "@/shared/utils/format";
import { HealthBadge } from "./HealthBadge";
import { PROFITABILITY_STRINGS as S } from "../i18n/pt-BR";
import type { ICustomerProfitabilityRow } from "../engine";

const TOP_N = 30;

const ABC_CLASSES: Record<string, string> = {
  A: "bg-success/15 text-success border-success/30",
  B: "bg-warning/15 text-warning border-warning/30",
  C: "bg-muted text-muted-foreground border-border",
};

export interface ICustomerTabProps {
  rows: ICustomerProfitabilityRow[];
}

export function CustomerTab({ rows }: ICustomerTabProps) {
  const navigate = useNavigate();
  const [negativeOnly, setNegativeOnly] = useState(false);

  const filtered = useMemo(() => {
    if (!negativeOnly) return rows;
    return rows.filter((r) => r.marginPct < 0);
  }, [rows, negativeOnly]);

  const sorted = useMemo(() => [...filtered].sort((a, b) => b.margin - a.margin), [filtered]);
  const visible = sorted.slice(0, TOP_N);

  const handleCustomerClick = (customerId: ID) => {
    void navigate({ to: "/app/clientes/$id", params: { id: customerId } });
  };

  return (
    <Card className="overflow-hidden p-0">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
        <button
          type="button"
          onClick={() => setNegativeOnly((v) => !v)}
          className={cn(
            "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
            negativeOnly
              ? "border-destructive bg-destructive/10 text-destructive"
              : "border-border bg-card text-muted-foreground hover:bg-accent/40",
          )}
        >
          <Icon icon={negativeOnly ? "mdi:check" : "mdi:filter-outline"} size={12} />
          {S.customerNegativeFilter}
        </button>
        <span className="text-xs text-muted-foreground">
          Exibindo {visible.length} de {filtered.length}
        </span>
      </div>
      {visible.length === 0 ? (
        <div className="p-10 text-center text-sm text-muted-foreground">{S.customerEmpty}</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30 text-xs uppercase tracking-wider text-muted-foreground">
                <th className="px-4 py-3 text-left font-medium">Cliente</th>
                <th className="px-4 py-3 text-left font-medium">Vendedor</th>
                <th className="px-4 py-3 text-right font-medium">{S.tableRevenue}</th>
                <th className="px-4 py-3 text-right font-medium">{S.tableCost}</th>
                <th className="px-4 py-3 text-right font-medium">{S.tableMargin}</th>
                <th className="px-4 py-3 text-right font-medium">{S.tableMarginPct}</th>
                <th className="px-4 py-3 text-right font-medium">{S.tableOrders}</th>
                <th className="px-4 py-3 text-center font-medium">Saúde</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((row) => (
                <tr
                  key={row.key}
                  className="cursor-pointer border-b border-border/60 transition-colors last:border-b-0 hover:bg-accent/40"
                  onClick={() => handleCustomerClick(row.customerId)}
                >
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      {row.abcClass && (
                        <span
                          className={cn(
                            "inline-flex h-5 w-5 items-center justify-center rounded-full border text-[10px] font-semibold uppercase",
                            ABC_CLASSES[row.abcClass],
                          )}
                          title={`Classe ABC: ${row.abcClass}`}
                        >
                          {row.abcClass}
                        </span>
                      )}
                      <span className="font-medium text-foreground">{row.label}</span>
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-muted-foreground">{row.sellerName ?? "—"}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{formatBRL(row.revenue)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">
                    {formatBRL(row.cost)}
                  </td>
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
                    {row.orderCount}
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    <HealthBadge health={row.health} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
