import { useNavigate } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Icon } from "@/components/Icon";
import { formatBRL } from "@/shared/utils/format";
import type { ITopCustomerRow } from "../../hooks/useSalesAnalytics";
import { SALES_ANALYTICS_STRINGS as S } from "../../i18n/pt-BR";

export interface ITopCustomersTableProps {
  rows: ITopCustomerRow[];
  isLoading?: boolean;
}

const CLASS_VARIANT: Record<"A" | "B" | "C", "default" | "secondary" | "outline"> = {
  A: "default",
  B: "secondary",
  C: "outline",
};

export function TopCustomersTable({ rows, isLoading }: ITopCustomersTableProps) {
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
          {S.customersTabTitle}
        </h2>
        <Icon icon="mdi:account-group-outline" size={20} className="text-muted-foreground" />
      </header>
      {rows.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">{S.customersEmpty}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs uppercase tracking-wider text-muted-foreground">
                <th className="py-2 pr-3">#</th>
                <th className="py-2 pr-3">{S.customersTableCustomer}</th>
                <th className="py-2 pr-3">{S.customersTableClass}</th>
                <th className="py-2 pr-3 text-right">{S.customersTableOrders}</th>
                <th className="py-2 pr-3 text-right">{S.customersTableRevenue}</th>
                <th className="py-2 pr-3 text-right">{S.customersTableAvgTicket}</th>
                <th className="py-2 pr-3">{S.customersTableSeller}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, idx) => (
                <tr
                  key={row.customerId}
                  className="cursor-pointer border-b border-border/40 transition-colors hover:bg-muted/40"
                  onClick={() =>
                    void navigate({ to: "/app/clientes/$id", params: { id: row.customerId } })
                  }
                >
                  <td className="py-2 pr-3 font-mono text-xs text-muted-foreground">{idx + 1}</td>
                  <td className="py-2 pr-3">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-foreground">{row.name}</span>
                      {row.isNew && (
                        <span className="rounded-full bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
                          Novo
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="py-2 pr-3">
                    <Badge variant={CLASS_VARIANT[row.abcClass]} className="text-[10px]">
                      {row.abcClass}
                    </Badge>
                  </td>
                  <td className="py-2 pr-3 text-right font-mono text-xs">
                    {row.orderCount.toLocaleString("pt-BR")}
                  </td>
                  <td className="py-2 pr-3 text-right font-medium">{formatBRL(row.revenue)}</td>
                  <td className="py-2 pr-3 text-right text-xs text-muted-foreground">
                    {formatBRL(row.avgTicket)}
                  </td>
                  <td className="py-2 pr-3 text-xs text-muted-foreground">{row.sellerName}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
