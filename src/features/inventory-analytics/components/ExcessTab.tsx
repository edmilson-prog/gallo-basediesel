import { useNavigate } from "@tanstack/react-router";
import type { IInventoryAnalysis } from "@/shared/types";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/Icon";
import { cn } from "@/lib/utils";
import { formatBRL } from "@/shared/utils/format";
import { InventoryCurveBadge } from "./InventoryStatusBadge";
import { INVENTORY_STRINGS as S } from "../i18n/pt-BR";

export interface IExcessTabProps {
  rows: IInventoryAnalysis[];
  totalCapitalInExcess: number;
}

export function ExcessTab({ rows, totalCapitalInExcess }: IExcessTabProps) {
  const navigate = useNavigate();

  if (rows.length === 0) {
    return (
      <Card className="flex flex-col items-center gap-3 p-10 text-center">
        <Icon icon="mdi:scale-balance" size={32} className="text-success" />
        <p className="text-sm font-medium text-foreground">{S.excessEmpty}</p>
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      <Card className="flex flex-col gap-1 p-5">
        <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          {S.excessNote}
        </span>
        <span className="text-3xl font-semibold tabular-nums text-info">
          {formatBRL(totalCapitalInExcess)}
        </span>
        <p className="mt-1 text-xs text-muted-foreground">{S.excessSuggestion}</p>
      </Card>

      <Card className="overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30 text-xs uppercase tracking-wider text-muted-foreground">
                <th className="px-4 py-2 text-left font-medium">Produto</th>
                <th className="px-4 py-2 text-right font-medium">Estoque</th>
                <th className="px-4 py-2 text-right font-medium">Cobertura</th>
                <th className="px-4 py-2 text-right font-medium">Sem venda</th>
                <th className="px-4 py-2 text-right font-medium">Capital</th>
                <th className="px-4 py-2 text-center font-medium">Curva</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.partId}
                  className="cursor-pointer border-b border-border/60 last:border-b-0 hover:bg-accent/40"
                  onClick={() =>
                    void navigate({ to: "/app/catalogo/$id", params: { id: row.partId } })
                  }
                >
                  <td className="px-4 py-2.5">
                    <div className="flex flex-col">
                      <span className="font-medium text-foreground">{row.partName}</span>
                      <span className="text-xs text-muted-foreground">{row.partSku}</span>
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{row.stockQuantity}</td>
                  <td
                    className={cn(
                      "px-4 py-2.5 text-right tabular-nums",
                      row.coverageInDays > 365 && "text-info",
                    )}
                  >
                    {Number.isFinite(row.coverageInDays)
                      ? `${row.coverageInDays.toFixed(0)} d`
                      : "∞"}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">
                    {row.daysSinceLastSale != null ? `${row.daysSinceLastSale} d` : "Nunca"}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums font-semibold text-foreground">
                    {formatBRL(row.capitalTied)}
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    <InventoryCurveBadge curve={row.curve} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
