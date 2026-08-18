import { useNavigate } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/Icon";
import { formatBRL } from "@/shared/utils/format";
import type { ITopProductRow } from "../hooks/useSalesAnalytics";
import { SALES_ANALYTICS_STRINGS as S } from "../i18n/pt-BR";

export interface IProductsInDeclineCardProps {
  rows: ITopProductRow[];
}

export function ProductsInDeclineCard({ rows }: IProductsInDeclineCardProps) {
  const navigate = useNavigate();
  return (
    <Card className="flex flex-col gap-3 p-5">
      <header className="flex items-baseline justify-between">
        <div>
          <h3 className="text-base font-semibold tracking-tight text-foreground">
            {S.productsInDecline}
          </h3>
          <p className="text-xs text-muted-foreground">{S.productsInDeclineHelp}</p>
        </div>
        <Icon icon="mdi:alert-decagram-outline" size={20} className="text-severity-warning" />
      </header>
      {rows.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">{S.productsInDeclineEmpty}</p>
      ) : (
        <ul className="flex flex-col divide-y divide-border/40">
          {rows.map((row) => (
            <li key={row.partId}>
              <button
                type="button"
                onClick={() =>
                  void navigate({ to: "/app/catalogo/$id", params: { id: row.partId } })
                }
                className="flex w-full items-center justify-between gap-3 py-2 text-left transition-colors hover:bg-muted/40"
              >
                <div className="flex flex-col">
                  <span className="text-sm font-medium text-foreground">{row.name}</span>
                  <span className="font-mono text-xs text-muted-foreground">{row.sku}</span>
                </div>
                <div className="flex flex-col items-end">
                  <span className="text-sm font-medium text-severity-critical">
                    {row.trendPctValue !== null
                      ? `${row.trendPctValue > 0 ? "+" : ""}${row.trendPctValue}%`
                      : "—"}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {formatBRL(row.previousRevenue)} → {formatBRL(row.revenue)}
                  </span>
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
