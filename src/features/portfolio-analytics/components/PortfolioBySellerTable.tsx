import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Icon } from "@/components/Icon";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatPercent } from "@/shared/utils/format";
import type { ID } from "@/shared/types";
import { PORTFOLIO_STRINGS as S } from "../i18n/pt-BR";
import type { ISellerPortfolio } from "../engine/calculatePortfolioMetrics";
import { PortfolioHealthBadge } from "./PortfolioHealthBadge";

export interface IPortfolioBySellerTableProps {
  rows: ISellerPortfolio[];
  isLoading?: boolean;
  onSellerClick?: (sellerId: ID) => void;
}

function safePct(part: number, total: number): number {
  if (total <= 0) return 0;
  return part / total;
}

export function PortfolioBySellerTable({
  rows,
  isLoading,
  onSellerClick,
}: IPortfolioBySellerTableProps) {
  return (
    <Card className="flex flex-col gap-3 p-5">
      <header className="flex items-baseline justify-between">
        <h2 className="flex items-center gap-2 text-base font-semibold tracking-tight text-foreground">
          <Icon icon="mdi:account-group-outline" size={18} className="text-primary" />
          {S.sectionBySeller}
        </h2>
      </header>
      {isLoading ? (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
        </div>
      ) : rows.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">{S.tableEmpty}</p>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{S.tableSeller}</TableHead>
                <TableHead className="text-right">{S.tablePortfolio}</TableHead>
                <TableHead className="text-right">{S.tableActive}</TableHead>
                <TableHead className="text-right">{S.tableDormant}</TableHead>
                <TableHead className="text-right">{S.tableLost}</TableHead>
                <TableHead className="text-right">{S.tableChurn}</TableHead>
                <TableHead className="text-right">{S.tableRecovery}</TableHead>
                <TableHead className="text-center">{S.tableHealth}</TableHead>
                <TableHead className="text-right">{S.tableActions}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.sellerId}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                        {row.sellerName
                          .split(" ")
                          .slice(0, 2)
                          .map((n) => n[0])
                          .join("")
                          .toUpperCase()}
                      </span>
                      <span className="font-medium text-foreground">{row.sellerName}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {row.portfolioSize.toLocaleString("pt-BR")}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-emerald-600 dark:text-emerald-400">
                    {formatPercent(safePct(row.byStatus.ativo, row.portfolioSize))}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-amber-600 dark:text-amber-400">
                    {formatPercent(safePct(row.byStatus.dormente, row.portfolioSize))}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-red-600 dark:text-red-400">
                    {formatPercent(safePct(row.byStatus.perdido, row.portfolioSize))}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {row.churnCount.toLocaleString("pt-BR")}
                    <span className="ml-1 text-xs text-muted-foreground">
                      ({formatPercent(row.churnRate)})
                    </span>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {row.recoveryCount.toLocaleString("pt-BR")}
                    <span className="ml-1 text-xs text-muted-foreground">
                      ({formatPercent(row.recoveryRate)})
                    </span>
                  </TableCell>
                  <TableCell className="text-center">
                    <PortfolioHealthBadge score={row.healthScore} />
                  </TableCell>
                  <TableCell className="text-right">
                    {onSellerClick && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-8 gap-1 text-xs"
                        onClick={() => onSellerClick(row.sellerId)}
                      >
                        {S.tableDrillAction}
                        <Icon icon="mdi:arrow-right" size={14} />
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </Card>
  );
}
