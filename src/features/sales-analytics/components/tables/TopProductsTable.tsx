import { useNavigate } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Icon } from "@/components/Icon";
import { cn } from "@/lib/utils";
import { formatBRL, formatPercent } from "@/shared/utils/format";
import type { ITopProductRow } from "../../hooks/useSalesAnalytics";
import { SALES_ANALYTICS_STRINGS as S } from "../../i18n/pt-BR";

export interface ITopProductsTableProps {
  rows: ITopProductRow[];
  isLoading?: boolean;
}

const CATEGORY_LABELS: Record<string, string> = {
  filtro: "Filtro",
  freio: "Freio",
  correia: "Correia",
  motor: "Motor",
  embreagem: "Embreagem",
  eletrica: "Elétrica",
  transmissao: "Transmissão",
  suspensao: "Suspensão",
  arrefecimento: "Arrefecimento",
  lubrificante: "Lubrificante",
};

function TrendCell({ value }: { value: number | null }) {
  if (value === null) {
    return <span className="text-xs text-muted-foreground">—</span>;
  }
  const direction = value > 0 ? "up" : value < 0 ? "down" : "flat";
  const iconName =
    direction === "up"
      ? "mdi:arrow-top-right"
      : direction === "down"
        ? "mdi:arrow-bottom-right"
        : "mdi:minus";
  const colorClass =
    direction === "up"
      ? "text-severity-success"
      : direction === "down"
        ? "text-severity-critical"
        : "text-muted-foreground";
  return (
    <span className={cn("inline-flex items-center gap-1 text-xs font-medium", colorClass)}>
      <Icon icon={iconName} size={12} />
      {`${value > 0 ? "+" : ""}${value}%`}
    </span>
  );
}

export function TopProductsTable({ rows, isLoading }: ITopProductsTableProps) {
  const navigate = useNavigate();

  if (isLoading) {
    return (
      <Card className="p-5">
        <Skeleton className="h-7 w-64" />
        <div className="mt-4 space-y-2">
          {[1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      </Card>
    );
  }

  return (
    <Card className="flex flex-col gap-3 p-5">
      <header className="flex items-baseline justify-between">
        <h2 className="text-base font-semibold tracking-tight text-foreground">
          {S.productsTabTitle}
        </h2>
        <Icon icon="mdi:trophy-outline" size={20} className="text-muted-foreground" />
      </header>
      {rows.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">{S.productsEmpty}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs uppercase tracking-wider text-muted-foreground">
                <th className="py-2 pr-3">#</th>
                <th className="py-2 pr-3">{S.productsTableProduct}</th>
                <th className="py-2 pr-3">{S.productsTableCategory}</th>
                <th className="py-2 pr-3 text-right">{S.productsTableQty}</th>
                <th className="py-2 pr-3 text-right">{S.productsTableRevenue}</th>
                <th className="py-2 pr-3 text-right">{S.productsTableShare}</th>
                <th className="py-2 pr-3 text-right">{S.productsTableTrend}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, idx) => (
                <tr
                  key={row.partId}
                  className="cursor-pointer border-b border-border/40 transition-colors hover:bg-muted/40"
                  onClick={() =>
                    void navigate({ to: "/app/catalogo/$id", params: { id: row.partId } })
                  }
                >
                  <td className="py-2 pr-3 font-mono text-xs text-muted-foreground">{idx + 1}</td>
                  <td className="py-2 pr-3">
                    <div className="flex flex-col">
                      <span className="font-medium text-foreground">{row.name}</span>
                      <span className="font-mono text-xs text-muted-foreground">{row.sku}</span>
                    </div>
                  </td>
                  <td className="py-2 pr-3 text-xs text-muted-foreground">
                    {row.category ? CATEGORY_LABELS[row.category] : "—"}
                  </td>
                  <td className="py-2 pr-3 text-right font-mono text-xs">
                    {row.quantity.toLocaleString("pt-BR")}
                  </td>
                  <td className="py-2 pr-3 text-right font-medium">{formatBRL(row.revenue)}</td>
                  <td className="py-2 pr-3 text-right text-xs text-muted-foreground">
                    {formatPercent(row.share)}
                  </td>
                  <td className="py-2 pr-3 text-right">
                    <TrendCell value={row.trendPctValue} />
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
