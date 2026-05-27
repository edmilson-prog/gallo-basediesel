import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Icon } from "@/components/Icon";
import { Progress } from "@/components/ui/progress";
import { formatPercent } from "@/shared/utils/format";
import type { ISellerPositivation } from "../engine/calculatePositivation";
import { POSITIVATION_STRINGS as S } from "../i18n/pt-BR";

export interface IPositivationBySellerTableProps {
  rows: ISellerPositivation[];
  isLoading?: boolean;
  onSellerClick?: (sellerId: string) => void;
}

export function PositivationBySellerTable({
  rows,
  isLoading,
  onSellerClick,
}: IPositivationBySellerTableProps) {
  const empty = !isLoading && rows.length === 0;
  return (
    <Card className="flex h-full flex-col gap-3 p-5">
      <header className="flex items-baseline justify-between">
        <h2 className="flex items-center gap-2 text-base font-semibold tracking-tight text-foreground">
          <Icon icon="mdi:account-tie" size={18} className="text-primary" />
          {S.sectionBySeller}
        </h2>
      </header>
      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      ) : empty ? (
        <p className="py-10 text-center text-sm text-muted-foreground">{S.tableEmpty}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th scope="col" className="py-2 pr-3 font-medium">
                  {S.tableSeller}
                </th>
                <th scope="col" className="py-2 px-3 text-right font-medium">
                  {S.tablePortfolio}
                </th>
                <th scope="col" className="py-2 px-3 text-right font-medium">
                  {S.tablePositivated}
                </th>
                <th scope="col" className="py-2 px-3 font-medium">
                  {S.tableRate}
                </th>
                <th scope="col" className="py-2 px-3 text-right font-medium">
                  {S.tableProjection}
                </th>
                <th scope="col" className="py-2 px-3 text-right font-medium">
                  {S.tableAtRiskCount}
                </th>
                <th scope="col" className="py-2 pl-3 text-right font-medium">
                  {S.tableActions}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              {rows.map((row) => (
                <tr key={row.sellerId} className="text-foreground">
                  <td className="py-3 pr-3 font-medium">{row.sellerName}</td>
                  <td className="py-3 px-3 text-right text-muted-foreground">
                    {row.customersInPortfolio.toLocaleString("pt-BR")}
                  </td>
                  <td className="py-3 px-3 text-right">
                    {row.positivatedCount.toLocaleString("pt-BR")}
                  </td>
                  <td className="py-3 px-3">
                    <div className="flex items-center gap-2">
                      <Progress value={Math.round(row.rate * 100)} className="h-2 w-24" />
                      <span className="text-xs text-muted-foreground">
                        {formatPercent(row.rate)}
                      </span>
                    </div>
                  </td>
                  <td className="py-3 px-3 text-right text-muted-foreground">
                    {row.projection.toLocaleString("pt-BR")}
                  </td>
                  <td className="py-3 px-3 text-right">
                    {row.atRiskCount > 0 ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-500/10 dark:text-amber-300">
                        <Icon icon="mdi:alert-outline" size={12} />
                        {row.atRiskCount}
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="py-3 pl-3 text-right">
                    {onSellerClick && (
                      <button
                        type="button"
                        onClick={() => onSellerClick(row.sellerId)}
                        className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-primary hover:bg-primary/10"
                        aria-label={S.tableDrillAction}
                      >
                        {S.tableDrillAction}
                        <Icon icon="mdi:chevron-right" size={14} />
                      </button>
                    )}
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
