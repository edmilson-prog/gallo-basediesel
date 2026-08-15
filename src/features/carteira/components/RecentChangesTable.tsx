import type { ICarteiraTransfer, ID, ISeller } from "@/shared/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Icon } from "@/components/Icon";
import { SellerRoute } from "./SellerRoute";
import { CARTEIRA_STRINGS } from "../i18n/pt-BR";
import { formatDate, formatDateTime } from "../utils/formatters";

const DAY_MS = 24 * 60 * 60 * 1000;

function daysSince(iso: string, now: Date): number {
  const diff = now.getTime() - new Date(iso).getTime();
  return Number.isNaN(diff) ? 0 : Math.max(0, Math.floor(diff / DAY_MS));
}

export interface IRecentChangesTableProps {
  transfers: ICarteiraTransfer[];
  sellersById: Map<ID, ISeller>;
  canRevert: boolean;
  onRevert: (transfer: ICarteiraTransfer) => void;
  onViewCustomers: (transfer: ICarteiraTransfer) => void;
}

/**
 * Permanent wallet changes from the last 30 days, one row each.
 *
 * These are done deals: they do not expire, nobody is waiting on them, and
 * three of them used to fill the screen as three near-identical cards. As rows
 * they cost one line apiece, and "Reverter" stays reachable without pretending
 * to be urgent.
 */
export function RecentChangesTable({
  transfers,
  sellersById,
  canRevert,
  onRevert,
  onViewCustomers,
}: IRecentChangesTableProps) {
  const strings = CARTEIRA_STRINGS.changes;
  const now = new Date();

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="overflow-x-auto">
        <Table className="min-w-[58rem]">
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-[8.5rem] text-[10px] uppercase tracking-[0.12em]">
                {strings.columns.type}
              </TableHead>
              <TableHead className="w-[16rem] text-[10px] uppercase tracking-[0.12em]">
                {strings.columns.route}
              </TableHead>
              <TableHead className="w-[5rem] text-right text-[10px] uppercase tracking-[0.12em]">
                {strings.columns.customers}
              </TableHead>
              <TableHead className="text-[10px] uppercase tracking-[0.12em]">
                {strings.columns.reason}
              </TableHead>
              <TableHead className="w-[10rem] text-[10px] uppercase tracking-[0.12em]">
                {strings.columns.executedBy}
              </TableHead>
              <TableHead className="w-[9.5rem] text-[10px] uppercase tracking-[0.12em]">
                {strings.columns.when}
              </TableHead>
              <TableHead className="w-[7rem]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {transfers.map((t) => {
              const isBatch = t.type === "permanent_batch";
              const count = t.customerIds.length;
              const executedBy = sellersById.get(t.createdBy)?.fullName ?? "—";

              return (
                <TableRow key={t.id} className="cursor-pointer" onClick={() => onViewCustomers(t)}>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={
                        isBatch
                          ? "gap-1 border-severity-info/40 bg-severity-info/10 text-[10px] uppercase tracking-wide text-severity-info"
                          : "gap-1 text-[10px] uppercase tracking-wide text-muted-foreground"
                      }
                    >
                      <Icon
                        icon={isBatch ? "mdi:account-group-outline" : "mdi:account-outline"}
                        size={11}
                      />
                      {isBatch ? strings.batch : strings.individual}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <SellerRoute
                      fromSellerId={t.fromSellerId}
                      toSellerId={t.toSellerId}
                      sellersById={sellersById}
                      compact
                    />
                  </TableCell>
                  <TableCell className="text-right text-[12.5px] font-semibold tabular-nums text-foreground">
                    {count}
                  </TableCell>
                  <TableCell
                    className="max-w-0 truncate text-[12.5px] text-foreground/70"
                    title={t.reason || undefined}
                  >
                    {t.reason || "—"}
                  </TableCell>
                  <TableCell className="truncate text-[12.5px] text-foreground/70">
                    {executedBy}
                  </TableCell>
                  <TableCell
                    className="whitespace-nowrap text-[12.5px] text-muted-foreground"
                    title={formatDateTime(t.createdAt)}
                  >
                    {formatDate(t.createdAt)}{" "}
                    <span className="text-muted-foreground/70">
                      · {strings.daysAgo(daysSince(t.createdAt, now))}
                    </span>
                  </TableCell>
                  <TableCell className="py-1" onClick={(e) => e.stopPropagation()}>
                    {canRevert && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="gap-1 text-muted-foreground hover:text-foreground"
                        onClick={() => onRevert(t)}
                      >
                        <Icon icon="mdi:undo" size={12} />
                        {strings.revert}
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
