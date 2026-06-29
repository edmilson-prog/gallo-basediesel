import type { PointerEvent as ReactPointerEvent } from "react";
import type { ICustomer } from "@/shared/types";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getCustomerName } from "@/features/customers/utils/customerDisplay";
import { useResizableColumns } from "@/shared/hooks/useResizableColumns";
import { CONTACT_REVIEW_STRINGS as S } from "../i18n/pt-BR";

const COLUMN_WIDTHS_KEY = "gallo-pending-contacts-column-widths";
const ACTIONS_COL_WIDTH = 148;

const COLUMNS = [
  { id: "contact" as const, defaultWidth: 280 },
  { id: "phone" as const, defaultWidth: 180 },
] as const;

function ResizeHandle({ onPointerDown }: { onPointerDown: (e: ReactPointerEvent) => void }) {
  return (
    <span
      role="separator"
      aria-orientation="vertical"
      onPointerDown={onPointerDown}
      onClick={(e) => e.stopPropagation()}
      className="absolute right-0 top-0 z-10 h-full w-1.5 cursor-col-resize touch-none select-none hover:bg-primary/40"
    />
  );
}

export interface IPendingContactsViewProps {
  customers: ICustomer[];
  onConvert?: (customer: ICustomer) => void;
  onDiscard?: (customer: ICustomer) => void;
  /** Provided in discarded mode — renders a single "Devolver à fila" button. */
  onRestore?: (customer: ICustomer) => void;
  /** Exposes the inner scroll container for the page-level ScrollProgressBar. */
  scrollRef?: (el: HTMLDivElement | null) => void;
}

export function PendingContactsTable({
  customers,
  onConvert,
  onDiscard,
  onRestore,
  scrollRef,
}: IPendingContactsViewProps) {
  const { widths, startResize } = useResizableColumns(COLUMNS, COLUMN_WIDTHS_KEY);
  const tableWidth = widths.contact + widths.phone + ACTIONS_COL_WIDTH;

  return (
    <Table
      containerRef={scrollRef}
      className="w-full table-fixed"
      style={{ minWidth: tableWidth }}
    >
      <colgroup>
        <col style={{ width: widths.contact }} />
        <col style={{ width: widths.phone }} />
        <col style={{ width: ACTIONS_COL_WIDTH }} />
      </colgroup>
      <TableHeader>
        {/* Vertical delimiters between columns live in the header only. */}
        <TableRow className="hover:bg-transparent [&>th:not(:last-child)]:border-r [&>th:not(:last-child)]:border-border/70">
          <TableHead className="relative sticky top-0 z-20 overflow-hidden bg-background px-3 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {S.queue.columns.contact}
            <ResizeHandle onPointerDown={(e) => startResize("contact", e)} />
          </TableHead>
          <TableHead className="relative sticky top-0 z-20 overflow-hidden bg-background px-3 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {S.queue.columns.phone}
            <ResizeHandle onPointerDown={(e) => startResize("phone", e)} />
          </TableHead>
          <TableHead className="sticky top-0 z-20 bg-background px-3 py-2 text-right text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {S.queue.columns.actions}
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {customers.map((c) => (
          <TableRow key={c.id} className="border-b border-border/60">
            <TableCell className="truncate px-3 py-2 text-foreground">
              {getCustomerName(c) || S.queue.noName}
            </TableCell>
            <TableCell className="truncate px-3 py-2 text-muted-foreground">{c.phone}</TableCell>
            <TableCell className="px-3 py-2">
              <div className="flex justify-end gap-2">
                {onRestore ? (
                  <Button size="sm" variant="outline" onClick={() => onRestore(c)}>
                    {S.discarded.restore}
                  </Button>
                ) : (
                  <>
                    {onConvert && (
                      <Button size="sm" onClick={() => onConvert(c)}>
                        {S.banner.convert}
                      </Button>
                    )}
                    {onDiscard && (
                      <Button size="sm" variant="outline" onClick={() => onDiscard(c)}>
                        {S.banner.discard}
                      </Button>
                    )}
                  </>
                )}
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
