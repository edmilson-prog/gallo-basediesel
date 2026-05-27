import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import type { IInventoryAnalysis } from "@/shared/types";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/Icon";
import { cn } from "@/lib/utils";
import { formatBRL } from "@/shared/utils/format";
import { InventoryStatusBadge, InventoryCurveBadge } from "./InventoryStatusBadge";
import { INVENTORY_STRINGS as S } from "../i18n/pt-BR";

export interface ICriticalTabProps {
  rows: IInventoryAnalysis[];
}

function downloadCsv(rows: IInventoryAnalysis[]): void {
  const header = [
    "SKU",
    "Produto",
    "Categoria",
    "Estoque atual",
    "Estoque mínimo",
    "Consumo (período)",
    "Cobertura (dias)",
    "Quantidade sugerida",
    "Custo estimado (R$)",
    "Status",
  ];
  const escape = (s: string): string => `"${s.replace(/"/g, '""')}"`;
  const lines = rows.map((row) => {
    return [
      row.partSku,
      row.partName,
      row.category ?? "—",
      row.stockQuantity,
      row.stockMinThreshold,
      row.consumptionLastWindow,
      Number.isFinite(row.coverageInDays) ? row.coverageInDays.toFixed(1) : "∞",
      row.recommendedReorder?.suggestedQuantity ?? "",
      row.recommendedReorder?.estimatedCostToReorder.toFixed(2) ?? "",
      row.status,
    ]
      .map((cell) => escape(String(cell)))
      .join(",");
  });
  const csv = [header.map(escape).join(","), ...lines].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `lista-compras-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function CriticalTab({ rows }: ICriticalTabProps) {
  const navigate = useNavigate();

  if (rows.length === 0) {
    return (
      <Card className="flex flex-col items-center gap-3 p-10 text-center">
        <Icon icon="mdi:check-circle-outline" size={32} className="text-success" />
        <p className="text-sm font-medium text-foreground">{S.criticalEmpty}</p>
      </Card>
    );
  }

  const handleExport = () => {
    downloadCsv(rows);
    toast.success(S.criticalExportToast, { icon: <Icon icon="mdi:download" size={16} /> });
  };

  return (
    <Card className="overflow-hidden p-0">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
        <p className="text-xs text-muted-foreground">
          {rows.length} produto{rows.length === 1 ? "" : "s"} aguardando ação — ordenados por
          urgência (críticos primeiro) e consumo.
        </p>
        <Button size="sm" variant="outline" onClick={handleExport} className="gap-1.5">
          <Icon icon="mdi:file-download-outline" size={14} />
          {S.criticalExportCta}
        </Button>
      </header>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[860px] text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/30 text-xs uppercase tracking-wider text-muted-foreground">
              <th className="px-4 py-2 text-left font-medium">Produto</th>
              <th className="px-4 py-2 text-right font-medium">Estoque</th>
              <th className="px-4 py-2 text-right font-medium">Cobertura</th>
              <th className="px-4 py-2 text-right font-medium">Consumo/dia</th>
              <th className="px-4 py-2 text-right font-medium">{S.reorderQuantity}</th>
              <th className="px-4 py-2 text-right font-medium">{S.reorderCost}</th>
              <th className="px-4 py-2 text-center font-medium">Curva</th>
              <th className="px-4 py-2 text-center font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const reorder = row.recommendedReorder;
              return (
                <tr
                  key={row.partId}
                  className="cursor-pointer border-b border-border/60 last:border-b-0 hover:bg-accent/40"
                  onClick={() =>
                    void navigate({ to: "/app/catalogo/$id", params: { id: row.partId } })
                  }
                  title={reorder?.rationale ?? S.reorderSuggestion}
                >
                  <td className="px-4 py-2.5">
                    <div className="flex flex-col">
                      <span className="font-medium text-foreground">{row.partName}</span>
                      <span className="text-xs text-muted-foreground">
                        {row.partSku}
                        {row.partOemCode ? ` · ${row.partOemCode}` : ""}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums">
                    {row.stockQuantity}{" "}
                    <span className="text-xs text-muted-foreground">
                      / mín {row.stockMinThreshold}
                    </span>
                  </td>
                  <td
                    className={cn(
                      "px-4 py-2.5 text-right tabular-nums font-semibold",
                      row.coverageInDays < 5 && "text-destructive",
                      row.coverageInDays >= 5 && row.coverageInDays < 15 && "text-warning",
                    )}
                  >
                    {Number.isFinite(row.coverageInDays)
                      ? `${row.coverageInDays.toFixed(1)} d`
                      : "∞"}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">
                    {row.averageDailyConsumption.toFixed(2)}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums">
                    {reorder ? reorder.suggestedQuantity : "—"}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums">
                    {reorder ? formatBRL(reorder.estimatedCostToReorder) : "—"}
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    <InventoryCurveBadge curve={row.curve} />
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    <InventoryStatusBadge status={row.status} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
