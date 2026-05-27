import { useMemo } from "react";
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
import { formatDateBR } from "@/shared/utils/format";
import type { ICustomer, ID, ISeller } from "@/shared/types";
import { PORTFOLIO_STRINGS as S } from "../i18n/pt-BR";
import type { IAtRiskCustomer } from "../engine/calculatePortfolioMetrics";

export interface IPortfolioRiskListProps {
  title: string;
  icon: string;
  rows: IAtRiskCustomer[];
  sellersById: Map<ID, ISeller>;
  isLoading?: boolean;
  emptyLabel: string;
  tone: "warn" | "bad";
  onContact: (customer: ICustomer) => void;
  onOpenProfile: (customer: ICustomer) => void;
}

function customerDisplayName(customer: ICustomer): string {
  if (customer.type === "B2B") return customer.nomeFantasia || customer.razaoSocial;
  return customer.fullName;
}

export function PortfolioRiskList({
  title,
  icon,
  rows,
  sellersById,
  isLoading,
  emptyLabel,
  tone,
  onContact,
  onOpenProfile,
}: IPortfolioRiskListProps) {
  const accent = useMemo(
    () =>
      tone === "warn"
        ? "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400"
        : "bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-400",
    [tone],
  );

  return (
    <Card className="flex flex-col gap-3 p-5">
      <header className="flex items-baseline justify-between">
        <h2 className="flex items-center gap-2 text-base font-semibold tracking-tight text-foreground">
          <span className={`flex h-7 w-7 items-center justify-center rounded-md ${accent}`}>
            <Icon icon={icon} size={16} />
          </span>
          {title}
        </h2>
        {!isLoading && (
          <span className="text-xs text-muted-foreground">
            {rows.length} {rows.length === 1 ? "cliente" : "clientes"}
          </span>
        )}
      </header>

      {isLoading ? (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
        </div>
      ) : rows.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">{emptyLabel}</p>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{S.riskColumnCustomer}</TableHead>
                <TableHead>{S.riskColumnSeller}</TableHead>
                <TableHead>{S.riskColumnLastPurchase}</TableHead>
                <TableHead className="text-right">{S.riskColumnDays}</TableHead>
                <TableHead className="text-right">{S.riskColumnAction}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map(({ customer, daysRemaining }) => {
                const seller = sellersById.get(customer.sellerId);
                return (
                  <TableRow key={customer.id}>
                    <TableCell>
                      <button
                        type="button"
                        className="text-left text-sm font-medium text-foreground hover:text-primary hover:underline"
                        onClick={() => onOpenProfile(customer)}
                      >
                        {customerDisplayName(customer)}
                      </button>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {seller?.fullName ?? "—"}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {customer.lastPurchaseAt
                        ? formatDateBR(customer.lastPurchaseAt)
                        : S.riskNoPurchase}
                    </TableCell>
                    <TableCell
                      className={`text-right text-sm font-semibold tabular-nums ${
                        daysRemaining <= 5
                          ? "text-red-600 dark:text-red-400"
                          : "text-amber-600 dark:text-amber-400"
                      }`}
                    >
                      {S.riskDaysLabel(daysRemaining)}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-8 gap-1 text-xs"
                          onClick={() => onContact(customer)}
                        >
                          <Icon icon="mdi:message-outline" size={14} />
                          {S.riskActionContact}
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-8 gap-1 text-xs"
                          onClick={() => onOpenProfile(customer)}
                        >
                          <Icon icon="mdi:account-outline" size={14} />
                          {S.riskActionOpen}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </Card>
  );
}
