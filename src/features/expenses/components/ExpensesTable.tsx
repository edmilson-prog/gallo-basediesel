import { useMemo, useState } from "react";
import type { IExpense } from "@/shared/types";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Icon } from "@/components/Icon";
import { formatBRL, formatDateBR } from "@/shared/utils/format";
import { monthLabel } from "../utils/period";
import { EXPENSE_CATEGORY_LABELS, EXPENSES_STRINGS as S } from "../i18n/pt-BR";
import { ExpenseStatusBadge } from "./ExpenseStatusBadge";

const PAGE_SIZE = 50;

interface IExpensesTableProps {
  expenses: IExpense[];
  canWrite: boolean;
  onEdit: (expense: IExpense) => void;
  onMarkPaid: (expense: IExpense) => void;
  onDuplicate: (expense: IExpense) => void;
  onCancel: (expense: IExpense) => void;
}

function competenceLabel(iso: string): string {
  const d = new Date(iso);
  return monthLabel(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`);
}

export function ExpensesTable({
  expenses,
  canWrite,
  onEdit,
  onMarkPaid,
  onDuplicate,
  onCancel,
}: IExpensesTableProps) {
  const [page, setPage] = useState(1);
  const pageCount = Math.max(1, Math.ceil(expenses.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const rows = useMemo(
    () => expenses.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE),
    [expenses, safePage],
  );

  return (
    <div className="overflow-hidden rounded-lg border border-border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{S.colDescription}</TableHead>
            <TableHead>{S.colCategory}</TableHead>
            <TableHead className="text-right">{S.colAmount}</TableHead>
            <TableHead>{S.colCompetence}</TableHead>
            <TableHead>{S.colDueDate}</TableHead>
            <TableHead>{S.colPayment}</TableHead>
            <TableHead>{S.colStatus}</TableHead>
            <TableHead className="text-center">{S.colRecurring}</TableHead>
            {canWrite && <TableHead className="w-12 text-right">{S.colActions}</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((e) => {
            const cancelled = e.status === "cancelado";
            return (
              <TableRow key={e.id} className={cancelled ? "opacity-60" : undefined}>
                <TableCell className="max-w-[260px]">
                  <span className="block truncate font-medium text-foreground">
                    {e.description}
                  </span>
                  {e.supplier && (
                    <span className="block truncate text-xs text-muted-foreground">
                      {e.supplier}
                    </span>
                  )}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {EXPENSE_CATEGORY_LABELS[e.category]}
                </TableCell>
                <TableCell className="text-right font-medium tabular-nums">
                  {formatBRL(e.amount)}
                </TableCell>
                <TableCell className="text-sm">{competenceLabel(e.competenceDate)}</TableCell>
                <TableCell className="text-sm">{formatDateBR(e.dueDate)}</TableCell>
                <TableCell className="text-sm">{formatDateBR(e.paymentDate)}</TableCell>
                <TableCell>
                  <ExpenseStatusBadge status={e.status} />
                </TableCell>
                <TableCell className="text-center">
                  {e.isRecurring && (
                    <Icon
                      icon="mdi:autorenew"
                      size={16}
                      className="mx-auto text-muted-foreground"
                    />
                  )}
                </TableCell>
                {canWrite && (
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <Icon icon="mdi:dots-vertical" size={18} />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => onEdit(e)} disabled={cancelled}>
                          <Icon icon="mdi:pencil-outline" size={15} className="mr-2" />
                          {S.actionEdit}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => onMarkPaid(e)}
                          disabled={cancelled || e.status === "pago"}
                        >
                          <Icon icon="mdi:cash-check" size={15} className="mr-2" />
                          {S.actionMarkPaid}
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => onDuplicate(e)}>
                          <Icon icon="mdi:content-copy" size={15} className="mr-2" />
                          {S.actionDuplicate}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => onCancel(e)}
                          disabled={cancelled}
                          className="text-destructive focus:text-destructive"
                        >
                          <Icon icon="mdi:close-circle-outline" size={15} className="mr-2" />
                          {S.actionCancel}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                )}
              </TableRow>
            );
          })}
        </TableBody>
      </Table>

      {pageCount > 1 && (
        <div className="flex items-center justify-between border-t border-border px-4 py-3 text-sm">
          <span className="text-muted-foreground">
            Página {safePage} de {pageCount} · {expenses.length} lançamentos
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={safePage <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Anterior
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={safePage >= pageCount}
              onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
            >
              Próxima
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
