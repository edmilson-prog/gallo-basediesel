import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/Icon";
import { cn } from "@/lib/utils";
import { hashHue, initialsFrom, avatarColors } from "@/shared/utils/avatar";
import type { ICustomer, ID, ISeller } from "@/shared/types";
import { displayCustomerName, formatRecency } from "../utils/recencyFormat";
import { POSITIVATION_STRINGS as S } from "../i18n/pt-BR";

export interface ICustomerListRow {
  customer: ICustomer;
  daysUntilDormant?: number;
  atRisk?: boolean;
}

export interface ICustomerListCardProps {
  title: string;
  icon: string;
  rows: ICustomerListRow[];
  sellersById: Map<ID, ISeller>;
  emptyLabel: string;
  isLoading?: boolean;
  pageSize?: number;
  onContact: (customer: ICustomer) => void;
  onOpenProfile: (customer: ICustomer) => void;
}

const DEFAULT_PAGE_SIZE = 30;

function Avatar({ name }: { name: string }) {
  const hue = hashHue(name);
  const { bg, fg } = avatarColors(hue);
  return (
    <span
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold"
      style={{ background: bg, color: fg }}
      aria-hidden="true"
    >
      {initialsFrom(name)}
    </span>
  );
}

export function CustomerListCard({
  title,
  icon,
  rows,
  sellersById,
  emptyLabel,
  isLoading,
  pageSize = DEFAULT_PAGE_SIZE,
  onContact,
  onOpenProfile,
}: ICustomerListCardProps) {
  const [page, setPage] = useState(1);

  const totalPages = useMemo(
    () => Math.max(1, Math.ceil(rows.length / pageSize)),
    [rows, pageSize],
  );
  const current = useMemo(
    () => rows.slice((page - 1) * pageSize, page * pageSize),
    [rows, page, pageSize],
  );

  // Reset page when rows shrink (e.g. filters changed).
  if (page > totalPages) {
    setPage(1);
  }

  return (
    <Card className="flex h-full flex-col gap-3 p-5">
      <header className="flex items-baseline justify-between">
        <h2 className="flex items-center gap-2 text-base font-semibold tracking-tight text-foreground">
          <Icon icon={icon} size={18} className="text-primary" />
          {title}
          <span className="text-xs font-normal text-muted-foreground">
            ({rows.length.toLocaleString("pt-BR")})
          </span>
        </h2>
      </header>
      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">{emptyLabel}</p>
      ) : (
        <>
          <ul className="flex flex-col divide-y divide-border/40">
            {current.map((row) => {
              const customer = row.customer;
              const name = displayCustomerName(customer);
              const seller = sellersById.get(customer.sellerId ?? "");
              return (
                <li
                  key={customer.id}
                  className="flex flex-wrap items-center gap-3 py-3 sm:flex-nowrap"
                >
                  <Avatar name={name} />
                  <div className="flex min-w-0 flex-1 flex-col">
                    <div className="flex flex-wrap items-baseline gap-2">
                      <button
                        type="button"
                        onClick={() => onOpenProfile(customer)}
                        className="truncate text-sm font-medium text-foreground hover:underline"
                      >
                        {name}
                      </button>
                      {row.atRisk && (
                        <span
                          className={cn(
                            "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium",
                            "bg-severity-warning/10 text-severity-warning",
                          )}
                        >
                          <Icon icon="mdi:alert-outline" size={11} />
                          {S.customerAtRiskBadge}
                          {row.daysUntilDormant !== undefined && (
                            <span className="font-normal">
                              · {S.customerDaysUntilDormant(row.daysUntilDormant)}
                            </span>
                          )}
                        </span>
                      )}
                    </div>
                    <span className="truncate text-xs text-muted-foreground">
                      {S.customerLastPurchase}: {formatRecency(customer.lastPurchaseAt)}
                      {seller && (
                        <span className="ml-2">
                          · {S.customerSeller}: {seller.fullName}
                        </span>
                      )}
                    </span>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => onOpenProfile(customer)}
                      className="h-8 gap-1 text-xs"
                    >
                      <Icon icon="mdi:account-circle-outline" size={14} />
                      {S.customerOpenProfile}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => onContact(customer)}
                      className="h-8 gap-1 text-xs"
                    >
                      <Icon icon="mdi:message-text-outline" size={14} />
                      {S.customerContact}
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
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
