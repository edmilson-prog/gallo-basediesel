import { useMemo } from "react";
import { useNavigate } from "@tanstack/react-router";
import type { ID } from "@/shared/types";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/Icon";
import { cn } from "@/lib/utils";
import { formatBRL, formatPercent } from "@/shared/utils/format";
import { HealthBadge } from "./HealthBadge";
import { PROFITABILITY_STRINGS as S } from "../i18n/pt-BR";
import type {
  IProductProfitabilityRow,
  IProfitabilityCoverage,
  IProfitabilitySummary,
} from "../engine";

const TOP_N = 30;

export interface IProductTabProps {
  rows: IProductProfitabilityRow[];
  summary: IProfitabilitySummary;
  coverage: IProfitabilityCoverage;
  subfilter: "none" | "negativo" | "sem-custo";
  onSubfilterChange: (value: "none" | "negativo" | "sem-custo") => void;
}

const KpiCard = ({
  label,
  value,
  helper,
  icon,
  tone,
}: {
  label: string;
  value: string;
  helper: string;
  icon: string;
  tone?: "neutral" | "warning" | "critical";
}) => (
  <Card className="flex flex-col gap-1.5 p-4">
    <div className="flex items-baseline justify-between">
      <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      <Icon
        icon={icon}
        size={16}
        className={cn(
          "text-muted-foreground",
          tone === "warning" && "text-warning",
          tone === "critical" && "text-destructive",
        )}
      />
    </div>
    <span className="text-2xl font-semibold tabular-nums text-foreground">{value}</span>
    <span className="text-xs text-muted-foreground">{helper}</span>
  </Card>
);

export function ProductTab({
  rows,
  summary,
  coverage,
  subfilter,
  onSubfilterChange,
}: IProductTabProps) {
  const navigate = useNavigate();

  const filtered = useMemo(() => {
    if (subfilter === "negativo") return rows.filter((r) => r.marginPct < 0);
    if (subfilter === "sem-custo") return rows.filter((r) => r.costMissing);
    return rows;
  }, [rows, subfilter]);

  const sorted = useMemo(() => [...filtered].sort((a, b) => b.margin - a.margin), [filtered]);
  const visibleRows = sorted.slice(0, TOP_N);

  const topProduct = useMemo(
    () =>
      rows.reduce<IProductProfitabilityRow | null>((best, row) => {
        if (!best) return row;
        return row.margin > best.margin ? row : best;
      }, null),
    [rows],
  );

  const handleProductClick = (partId: ID) => {
    void navigate({ to: "/app/catalogo/$id", params: { id: partId } });
  };

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label={S.kpiAvgMargin}
          value={formatPercent(summary.marginPct)}
          helper={S.kpiAvgMarginHelp}
          icon="mdi:percent-outline"
          tone={
            summary.marginPct < 0 ? "critical" : summary.marginPct < 0.25 ? "warning" : "neutral"
          }
        />
        <KpiCard
          label={S.kpiCoverage}
          value={`${(coverage.pct * 100).toFixed(0)}%`}
          helper={S.kpiCoverageHelp}
          icon="mdi:database-search-outline"
          tone={coverage.pct < 0.6 ? "critical" : coverage.pct < 0.8 ? "warning" : "neutral"}
        />
        <KpiCard
          label={S.kpiNegative}
          value={String(summary.negativeMarginCount)}
          helper={S.kpiNegativeHelp}
          icon="mdi:alert-octagon-outline"
          tone={summary.negativeMarginCount > 0 ? "critical" : "neutral"}
        />
        <KpiCard
          label={S.kpiTopProduct}
          value={topProduct ? formatBRL(topProduct.margin) : "—"}
          helper={topProduct?.label ?? S.kpiTopProductHelp}
          icon="mdi:trophy-outline"
        />
      </div>

      <Card className="overflow-hidden p-0">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
          <div className="flex flex-wrap gap-2">
            {(["none", "negativo", "sem-custo"] as const).map((opt) => (
              <button
                key={opt}
                type="button"
                onClick={() => onSubfilterChange(opt)}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                  subfilter === opt
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border bg-card text-muted-foreground hover:bg-accent/40",
                )}
              >
                {opt === "none"
                  ? S.subfilterAll
                  : opt === "negativo"
                    ? S.subfilterNegative
                    : S.subfilterMissingCost}
              </button>
            ))}
          </div>
          <span className="text-xs text-muted-foreground">
            Exibindo {visibleRows.length} de {filtered.length}
          </span>
        </div>
        {visibleRows.length === 0 ? (
          <div className="p-10 text-center text-sm text-muted-foreground">{S.productEmpty}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30 text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="px-4 py-3 text-left font-medium">{S.tableProductHeader}</th>
                  <th className="px-4 py-3 text-left font-medium">{S.tableSkuHeader}</th>
                  <th className="px-4 py-3 text-right font-medium">{S.tableRevenue}</th>
                  <th className="px-4 py-3 text-right font-medium">{S.tableCost}</th>
                  <th className="px-4 py-3 text-right font-medium">{S.tableMargin}</th>
                  <th className="px-4 py-3 text-right font-medium">{S.tableMarginPct}</th>
                  <th className="px-4 py-3 text-center font-medium">Saúde</th>
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((row) => (
                  <tr
                    key={row.key}
                    className="cursor-pointer border-b border-border/60 transition-colors last:border-b-0 hover:bg-accent/40"
                    onClick={() => handleProductClick(row.partId)}
                  >
                    <td className="px-4 py-2.5">
                      <div className="flex flex-col">
                        <span className="font-medium text-foreground">{row.label}</span>
                        {row.costMissing && (
                          <span className="text-[10px] uppercase tracking-wider text-warning">
                            Sem custo cadastrado
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground">
                      {row.sku}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums">
                      {formatBRL(row.revenue)}
                    </td>
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
    </div>
  );
}
