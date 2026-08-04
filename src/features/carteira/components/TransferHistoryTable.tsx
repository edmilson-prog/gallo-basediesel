import type { ICarteiraTransfer, ID, ISeller } from "@/shared/types";
import type { ITransferClosure } from "../utils/closureIndex";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Icon } from "@/components/Icon";
import { TransferTypeBadge } from "./TransferTypeBadge";
import { SellerRoute } from "./SellerRoute";
import {
  formatDate,
  formatDateTime,
  formatPeriod,
  transferStatusBadgeVariant,
  transferStatusLabel,
} from "../utils/formatters";
import { CARTEIRA_STRINGS } from "../i18n/pt-BR";

export interface ITransferHistoryTableProps {
  transfers: ICarteiraTransfer[];
  sellersById: Map<ID, ISeller>;
  /**
   * Who closed each transfer and when — from `audit_logs`, since the transfer
   * row itself only tracks who CREATED it. A transfer with no entry here (no
   * audit trail predating this lookup) shows "—" instead of falling back to
   * creation info, which would misrepresent it as closure info.
   */
  closureByTransferId: Map<ID, ITransferClosure>;
  page: number;
  totalPages: number;
  total: number;
  onPageChange: (page: number) => void;
  onSelect?: (transfer: ICarteiraTransfer) => void;
}

export function TransferHistoryTable({
  transfers,
  sellersById,
  closureByTransferId,
  page,
  totalPages,
  total,
  onPageChange,
  onSelect,
}: ITransferHistoryTableProps) {
  const { columns } = CARTEIRA_STRINGS.history;

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-lg border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[160px]">{columns.type}</TableHead>
              <TableHead>{columns.route}</TableHead>
              <TableHead className="text-right">{columns.customers}</TableHead>
              <TableHead>{columns.period}</TableHead>
              <TableHead>{columns.status}</TableHead>
              <TableHead>{columns.executedBy}</TableHead>
              <TableHead>{columns.executedAt}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {transfers.map((t) => {
              const closure = closureByTransferId.get(t.id);
              return (
                <TableRow
                  key={t.id}
                  className={onSelect ? "cursor-pointer" : undefined}
                  onClick={onSelect ? () => onSelect(t) : undefined}
                >
                  <TableCell>
                    <TransferTypeBadge type={t.type} />
                  </TableCell>
                  <TableCell>
                    <SellerRoute
                      fromSellerId={t.fromSellerId}
                      toSellerId={t.toSellerId}
                      sellersById={sellersById}
                      compact
                    />
                  </TableCell>
                  <TableCell className="text-right text-sm">{t.customerIds.length}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {t.type === "temporary"
                      ? formatPeriod(t.startDate, t.endDate)
                      : formatDate(t.startDate)}
                  </TableCell>
                  <TableCell>
                    <Badge variant={transferStatusBadgeVariant(t.status)}>
                      {transferStatusLabel(t.status)}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs">
                    {closure
                      ? (sellersById.get(closure.actorId)?.fullName ?? closure.actorId)
                      : "—"}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {closure ? formatDateTime(closure.timestamp) : "—"}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>
          Página {page} de {totalPages} · {total} registros
        </span>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => onPageChange(Math.max(1, page - 1))}
          >
            <Icon icon="mdi:chevron-left" size={14} /> Anterior
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={page >= totalPages}
            onClick={() => onPageChange(Math.min(totalPages, page + 1))}
          >
            Próxima <Icon icon="mdi:chevron-right" size={14} />
          </Button>
        </div>
      </div>
    </div>
  );
}
