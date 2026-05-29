import { useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import type { ICashFlowEntry } from "@/shared/types";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/Icon";
import { cn } from "@/lib/utils";
import { formatBRL, formatDateBR } from "@/shared/utils/format";
import {
  CASHFLOW_SOURCE_LABELS,
  CASHFLOW_STATUS_LABELS,
  CASHFLOW_STRINGS as S,
} from "../i18n/pt-BR";

const PAGE_SIZE = 50;

export function CashFlowTable({ entries }: { entries: ICashFlowEntry[] }) {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const pageCount = Math.max(1, Math.ceil(entries.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const rows = useMemo(
    () => entries.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE),
    [entries, safePage],
  );

  const goToSource = (entry: ICashFlowEntry) => {
    if (!entry.sourceId) return;
    if (entry.source === "pedido") {
      void navigate({ to: "/app/pedidos/$id", params: { id: entry.sourceId } });
    } else if (entry.source === "despesa") {
      void navigate({ to: "/app/gestao/despesas" });
    }
  };

  return (
    <div className="overflow-hidden rounded-lg border border-border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{S.colDate}</TableHead>
            <TableHead>{S.colType}</TableHead>
            <TableHead>{S.colSource}</TableHead>
            <TableHead>{S.colDescription}</TableHead>
            <TableHead className="text-right">{S.colAmount}</TableHead>
            <TableHead>{S.colStatus}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((e) => {
            const isInflow = e.type === "entrada";
            const linkable = e.sourceId && (e.source === "pedido" || e.source === "despesa");
            return (
              <TableRow key={e.id} className={e.status === "previsto" ? "opacity-70" : undefined}>
                <TableCell className="text-sm">{formatDateBR(e.date)}</TableCell>
                <TableCell>
                  <Icon
                    icon={isInflow ? "mdi:arrow-down-bold-circle" : "mdi:arrow-up-bold-circle"}
                    size={18}
                    className={isInflow ? "text-success" : "text-destructive"}
                  />
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {CASHFLOW_SOURCE_LABELS[e.source]}
                </TableCell>
                <TableCell className="max-w-[260px]">
                  {linkable ? (
                    <button
                      type="button"
                      onClick={() => goToSource(e)}
                      className="block truncate text-left text-primary hover:underline"
                    >
                      {e.description}
                    </button>
                  ) : (
                    <span className="block truncate">{e.description}</span>
                  )}
                </TableCell>
                <TableCell
                  className={cn(
                    "text-right font-medium tabular-nums",
                    isInflow ? "text-success" : "text-destructive",
                  )}
                >
                  {isInflow ? "+" : "−"}
                  {formatBRL(e.amount)}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {CASHFLOW_STATUS_LABELS[e.status]}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>

      {pageCount > 1 && (
        <div className="flex items-center justify-between border-t border-border px-4 py-3 text-sm">
          <span className="text-muted-foreground">
            Página {safePage} de {pageCount} · {entries.length} movimentações
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
