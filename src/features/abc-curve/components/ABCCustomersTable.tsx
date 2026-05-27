import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/Icon";
import { cn } from "@/lib/utils";
import { formatBRL, formatPercent } from "@/shared/utils/format";
import type { ABCClass, ID, ISeller } from "@/shared/types";
import type { ICustomerABCWithMigration } from "../engine/classifyABC";
import { displayCustomerName } from "../utils/displayCustomerName";
import { ABC_STRINGS as S } from "../i18n/pt-BR";

export interface IABCCustomersTableProps {
  title?: string;
  records: ICustomerABCWithMigration[];
  sellersById: Map<ID, ISeller>;
  isLoading?: boolean;
  pageSize?: number;
  onOpenProfile: (customerId: ID) => void;
}

const DEFAULT_PAGE_SIZE = 25;

const CLASS_BADGE: Record<ABCClass, string> = {
  A: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  B: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
  C: "bg-orange-500/10 text-orange-700 dark:text-orange-300",
};

const MIGRATION_LABEL: Record<ICustomerABCWithMigration["migration"], string> = {
  subiu: S.migrationUp,
  caiu: S.migrationDown,
  manteve: S.migrationKept,
  novo: S.migrationNew,
  saiu: "saiu",
};

const MIGRATION_TONE: Record<ICustomerABCWithMigration["migration"], string> = {
  subiu: "text-emerald-600 dark:text-emerald-300",
  caiu: "text-red-600 dark:text-red-300",
  manteve: "text-muted-foreground",
  novo: "text-sky-600 dark:text-sky-300",
  saiu: "text-amber-600 dark:text-amber-300",
};

export function ABCCustomersTable({
  title,
  records,
  sellersById,
  isLoading,
  pageSize = DEFAULT_PAGE_SIZE,
  onOpenProfile,
}: IABCCustomersTableProps) {
  const [page, setPage] = useState(1);

  const totalPages = useMemo(
    () => Math.max(1, Math.ceil(records.length / pageSize)),
    [records, pageSize],
  );
  const current = useMemo(
    () => records.slice((page - 1) * pageSize, page * pageSize),
    [records, page, pageSize],
  );

  if (page > totalPages) setPage(1);

  return (
    <Card className="flex h-full flex-col gap-3 p-5">
      {title && (
        <header className="flex items-baseline justify-between">
          <h2 className="flex items-center gap-2 text-base font-semibold tracking-tight text-foreground">
            <Icon icon="mdi:format-list-numbered" size={18} className="text-primary" />
            {title}
            <span className="text-xs font-normal text-muted-foreground">
              ({records.length.toLocaleString("pt-BR")})
            </span>
          </h2>
        </header>
      )}
      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-9 w-full" />
          ))}
        </div>
      ) : records.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">{S.tableEmpty}</p>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th scope="col" className="py-2 pr-3 font-medium">
                    {S.tableRank}
                  </th>
                  <th scope="col" className="py-2 px-3 font-medium">
                    {S.tableCustomer}
                  </th>
                  <th scope="col" className="py-2 px-3 font-medium">
                    {S.tableSeller}
                  </th>
                  <th scope="col" className="py-2 px-3 text-right font-medium">
                    {S.tableRevenue}
                  </th>
                  <th scope="col" className="py-2 px-3 text-right font-medium">
                    {S.tableCumulative}
                  </th>
                  <th scope="col" className="py-2 px-3 font-medium">
                    {S.tableMigration}
                  </th>
                  <th scope="col" className="py-2 pl-3 text-right font-medium">
                    {S.tableActions}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                {current.map((row) => {
                  const seller = sellersById.get(row.customer.sellerId);
                  return (
                    <tr key={row.customerId} className="text-foreground">
                      <td className="py-2 pr-3 text-muted-foreground tabular-nums">{row.rank}</td>
                      <td className="py-2 px-3">
                        <div className="flex items-center gap-2">
                          <span
                            className={cn(
                              "inline-flex h-6 w-6 items-center justify-center rounded text-[11px] font-bold",
                              CLASS_BADGE[row.class],
                            )}
                            aria-hidden="true"
                          >
                            {row.class}
                          </span>
                          <button
                            type="button"
                            onClick={() => onOpenProfile(row.customerId)}
                            className="text-sm font-medium hover:underline"
                          >
                            {displayCustomerName(row.customer)}
                          </button>
                        </div>
                      </td>
                      <td className="py-2 px-3 text-muted-foreground">{seller?.fullName ?? "—"}</td>
                      <td className="py-2 px-3 text-right font-medium tabular-nums">
                        {formatBRL(row.revenue)}
                      </td>
                      <td className="py-2 px-3 text-right text-muted-foreground tabular-nums">
                        {formatPercent(row.cumulativeRevenuePct)}
                      </td>
                      <td className="py-2 px-3">
                        <span
                          className={cn(
                            "inline-flex items-center gap-1 text-xs font-medium",
                            MIGRATION_TONE[row.migration],
                          )}
                        >
                          {MIGRATION_LABEL[row.migration]}
                          {row.previousClass &&
                            row.migration !== "manteve" &&
                            row.migration !== "novo" && (
                              <span className="font-normal text-muted-foreground">
                                {S.migrationFrom(row.previousClass)}
                              </span>
                            )}
                        </span>
                      </td>
                      <td className="py-2 pl-3 text-right">
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() => onOpenProfile(row.customerId)}
                          className="h-7 gap-1 text-xs"
                          aria-label={S.tableOpenProfile}
                        >
                          <Icon icon="mdi:account-circle-outline" size={14} />
                          {S.tableOpenProfile}
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {totalPages > 1 && (
            <footer className="flex items-center justify-end gap-2 pt-2 text-xs text-muted-foreground">
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={page === 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="h-8 gap-1"
              >
                <Icon icon="mdi:chevron-left" size={14} />
                {S.paginationPrev}
              </Button>
              <span>
                {page} / {totalPages}
              </span>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={page === totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="h-8 gap-1"
              >
                {S.paginationNext}
                <Icon icon="mdi:chevron-right" size={14} />
              </Button>
            </footer>
          )}
        </>
      )}
    </Card>
  );
}
