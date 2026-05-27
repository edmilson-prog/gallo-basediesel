import { useMemo } from "react";
import { useNavigate } from "@tanstack/react-router";
import type { ID, IInventoryMovement, ISeller } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { formatDateTimeBR } from "@/shared/utils/format";
import { INVENTORY_MOVEMENT_STRINGS as S } from "../i18n/pt-BR";
import { MovementTypeBadge } from "./MovementTypeBadge";

const PAGE_SIZE = 50;

export interface IMovementTableProps {
  rows: IInventoryMovement[];
  sellersById: Map<ID, ISeller>;
  page: number;
  onPageChange: (page: number) => void;
}

export function MovementTable({ rows, sellersById, page, onPageChange }: IMovementTableProps) {
  const navigate = useNavigate();

  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const startIdx = (safePage - 1) * PAGE_SIZE;
  const endIdx = Math.min(rows.length, startIdx + PAGE_SIZE);
  const pageRows = useMemo(() => rows.slice(startIdx, endIdx), [rows, startIdx, endIdx]);

  if (rows.length === 0) {
    return (
      <Card className="flex flex-col items-center justify-center gap-3 px-6 py-12 text-center">
        <div className="grid h-12 w-12 place-items-center rounded-full bg-muted text-muted-foreground">
          <Icon icon="mdi:swap-vertical-variant" size={24} />
        </div>
        <p className="text-sm font-semibold text-foreground">{S.tableEmptyTitle}</p>
        <p className="max-w-md text-xs text-muted-foreground">{S.tableEmptyDescription}</p>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[860px] border-collapse text-sm">
          <thead className="bg-muted/40 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-4 py-2.5 font-medium">{S.tableColDate}</th>
              <th className="px-4 py-2.5 font-medium">{S.tableColType}</th>
              <th className="px-4 py-2.5 font-medium">{S.tableColPart}</th>
              <th className="px-4 py-2.5 text-right font-medium">{S.tableColQuantity}</th>
              <th className="px-4 py-2.5 font-medium">{S.tableColOrigin}</th>
              <th className="px-4 py-2.5 font-medium">{S.tableColPerformedBy}</th>
              <th className="px-4 py-2.5 font-medium">{S.tableColNotes}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {pageRows.map((mov) => {
              const seller = sellersById.get(mov.performedBy);
              const isOutflow = mov.quantity < 0;
              return (
                <tr key={mov.id} className="transition-colors hover:bg-muted/30">
                  <td className="whitespace-nowrap px-4 py-3 text-xs text-muted-foreground">
                    {formatDateTimeBR(mov.performedAt)}
                  </td>
                  <td className="px-4 py-3">
                    <MovementTypeBadge type={mov.type} />
                  </td>
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      onClick={() =>
                        void navigate({ to: "/app/catalogo/$id", params: { id: mov.partId } })
                      }
                      className="text-left text-sm font-medium text-foreground hover:text-primary hover:underline"
                    >
                      {mov.partName}
                    </button>
                    {mov.partOemCode && (
                      <div className="font-mono text-[11px] text-muted-foreground">
                        OEM {mov.partOemCode}
                      </div>
                    )}
                  </td>
                  <td
                    className={cn(
                      "whitespace-nowrap px-4 py-3 text-right font-mono text-sm font-semibold",
                      isOutflow ? "text-destructive" : "text-success",
                    )}
                  >
                    {isOutflow ? "" : "+"}
                    {mov.quantity}
                  </td>
                  <td className="px-4 py-3 text-xs">
                    {mov.orderId ? (
                      <button
                        type="button"
                        onClick={() =>
                          void navigate({
                            to: "/app/pedidos/$id",
                            params: { id: mov.orderId as string },
                          })
                        }
                        className="inline-flex items-center gap-1 text-foreground hover:text-primary hover:underline"
                      >
                        <Icon icon="mdi:clipboard-list-outline" size={13} />
                        {mov.orderNumber ?? S.rowOriginOrder}
                      </button>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-foreground">
                    {seller?.name ?? S.rowSystemActor}
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    <span className="line-clamp-2">{mov.notes ?? ""}</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex flex-col items-center justify-between gap-3 border-t border-border px-4 py-3 sm:flex-row">
          <span className="text-xs text-muted-foreground">
            {S.paginationLabel(startIdx + 1, endIdx, rows.length)}
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={safePage <= 1}
              onClick={() => onPageChange(safePage - 1)}
            >
              <Icon icon="mdi:chevron-left" size={16} className="mr-1" />
              {S.paginationPrev}
            </Button>
            <span className="text-xs text-muted-foreground">
              {safePage} / {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={safePage >= totalPages}
              onClick={() => onPageChange(safePage + 1)}
            >
              {S.paginationNext}
              <Icon icon="mdi:chevron-right" size={16} className="ml-1" />
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}
