import type { ID, ISeller } from "@/shared/types";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/Icon";
import { COMMISSIONS_STRINGS as S } from "../i18n/pt-BR";
import type { ISellerCommissionAggregate } from "../hooks/useCommissionMetrics";

const money = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

interface IProps {
  entries: ISellerCommissionAggregate[];
  sellersById: Map<ID, ISeller>;
  onDrill: (sellerId: ID) => void;
}

export function CommissionsBySellerTable({ entries, sellersById, onDrill }: IProps) {
  return (
    <Card className="overflow-hidden">
      <header className="flex items-center justify-between border-b border-border px-5 py-3">
        <h2 className="text-base font-semibold text-foreground">{S.bySellerTitle}</h2>
        <span className="text-xs text-muted-foreground">
          {entries.length} {entries.length === 1 ? "vendedor" : "vendedores"}
        </span>
      </header>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-border bg-muted/30 text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-5 py-2 text-left">{S.tableHeaders.seller}</th>
              <th className="px-3 py-2 text-right">{S.tableHeaders.orderCount}</th>
              <th className="px-3 py-2 text-right">{S.tableHeaders.baseCommission}</th>
              <th className="px-3 py-2 text-right">{S.tableHeaders.goalBonus}</th>
              <th className="px-3 py-2 text-right">{S.tableHeaders.total}</th>
              <th className="px-3 py-2 text-right">Status</th>
              <th className="px-5 py-2 text-right">{S.tableHeaders.actions}</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((row) => {
              const seller = sellersById.get(row.sellerId);
              return (
                <tr
                  key={row.sellerId}
                  className="border-b border-border/40 last:border-0 hover:bg-muted/30"
                >
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2">
                      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                        {(seller?.fullName ?? "?").charAt(0)}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate font-medium text-foreground">
                          {seller?.fullName ?? row.sellerId}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {seller?.email ?? "—"}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums text-foreground">
                    {row.orderCount}
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums text-foreground">
                    {money.format(row.baseCommission)}
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums text-foreground">
                    {money.format(row.goalBonus)}
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums font-semibold text-foreground">
                    {money.format(row.total)}
                  </td>
                  <td className="px-3 py-3 text-right text-xs">
                    <div className="inline-flex flex-col items-end gap-0.5">
                      {row.paid > 0 && (
                        <span className="rounded bg-success/15 px-1.5 py-0.5 text-success-foreground">
                          {S.statusLabels.paid}: {money.format(row.paid)}
                        </span>
                      )}
                      {row.approved > 0 && (
                        <span className="rounded bg-info/15 px-1.5 py-0.5 text-info">
                          {S.statusLabels.approved}: {money.format(row.approved)}
                        </span>
                      )}
                      {row.calculated > 0 && (
                        <span className="rounded bg-muted px-1.5 py-0.5 text-muted-foreground">
                          {S.statusLabels.calculated}: {money.format(row.calculated)}
                        </span>
                      )}
                      {row.disputed > 0 && (
                        <span className="rounded bg-warning/15 px-1.5 py-0.5 text-warning-foreground">
                          {S.statusLabels.disputed}: {money.format(row.disputed)}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-5 py-3 text-right">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => onDrill(row.sellerId)}
                      aria-label={`Abrir comissões de ${seller?.fullName ?? row.sellerId}`}
                    >
                      Detalhes
                      <Icon icon="mdi:chevron-right" size={14} />
                    </Button>
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
