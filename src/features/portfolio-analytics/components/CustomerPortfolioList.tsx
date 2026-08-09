import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/Icon";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatBRL, formatDateBR } from "@/shared/utils/format";
import type { CustomerStatus, ICustomer, ID } from "@/shared/types";
import { PORTFOLIO_STRINGS as S } from "../i18n/pt-BR";

export interface ICustomerPortfolioListProps {
  customers: ICustomer[];
  isLoading?: boolean;
  emptyLabel?: string;
  onOpenProfile: (customer: ICustomer) => void;
  onContact: (customer: ICustomer) => void;
  pageSize?: number;
}

const STATUS_STYLE: Record<CustomerStatus, string> = {
  ativo: "bg-severity-success/10 text-severity-success",
  recuperacao: "bg-severity-info/10 text-severity-info",
  dormente: "bg-severity-warning/10 text-severity-warning",
  perdido: "bg-severity-critical/10 text-severity-critical",
};

const STATUS_LABEL: Record<CustomerStatus, string> = {
  ativo: S.statusAtivo,
  recuperacao: S.statusRecuperacao,
  dormente: S.statusDormente,
  perdido: S.statusPerdido,
};

function customerDisplayName(customer: ICustomer): string {
  if (customer.type === "B2B") return customer.nomeFantasia || customer.razaoSocial;
  return customer.fullName;
}

export function CustomerPortfolioList({
  customers,
  isLoading,
  emptyLabel,
  onOpenProfile,
  onContact,
  pageSize = 20,
}: ICustomerPortfolioListProps) {
  const [page, setPage] = useState(1);

  const totalPages = Math.max(1, Math.ceil(customers.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const slice = useMemo(
    () => customers.slice((safePage - 1) * pageSize, safePage * pageSize),
    [customers, safePage, pageSize],
  );

  if (isLoading) {
    return (
      <Card className="flex flex-col gap-2 p-5">
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-full" />
      </Card>
    );
  }

  if (customers.length === 0) {
    return (
      <Card className="p-8 text-center text-sm text-muted-foreground">
        {emptyLabel ?? S.drillListEmpty}
      </Card>
    );
  }

  return (
    <Card className="flex flex-col gap-3 p-5">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Cliente</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Última compra</TableHead>
              <TableHead className="text-right">LTV</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {slice.map((customer) => (
              <TableRow key={customer.id}>
                <TableCell>
                  <button
                    type="button"
                    className="text-left text-sm font-medium text-foreground hover:text-primary hover:underline"
                    onClick={() => onOpenProfile(customer)}
                  >
                    {customerDisplayName(customer)}
                  </button>
                  <div className="text-xs text-muted-foreground">
                    {customer.type === "B2B" ? customer.cnpj : customer.cpf}
                  </div>
                </TableCell>
                <TableCell>
                  <span
                    className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                      STATUS_STYLE[customer.status]
                    }`}
                  >
                    {STATUS_LABEL[customer.status]}
                  </span>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {customer.lastPurchaseAt
                    ? formatDateBR(customer.lastPurchaseAt)
                    : S.riskNoPurchase}
                </TableCell>
                <TableCell className="text-right text-sm tabular-nums text-foreground">
                  {formatBRL(customer.purchaseStats?.ltv ?? 0)}
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
                      Contatar
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-8 gap-1 text-xs"
                      onClick={() => onOpenProfile(customer)}
                    >
                      <Icon icon="mdi:open-in-new" size={14} />
                      Abrir
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {customers.length > pageSize && (
        <footer className="flex items-center justify-between gap-2 pt-2 text-xs text-muted-foreground">
          <span>
            Mostrando {(safePage - 1) * pageSize + 1}–
            {Math.min(safePage * pageSize, customers.length)} de {customers.length}
          </span>
          <div className="flex gap-1">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 gap-1"
              disabled={safePage === 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              <Icon icon="mdi:chevron-left" size={14} />
              Anterior
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 gap-1"
              disabled={safePage === totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              Próximo
              <Icon icon="mdi:chevron-right" size={14} />
            </Button>
          </div>
        </footer>
      )}
    </Card>
  );
}
