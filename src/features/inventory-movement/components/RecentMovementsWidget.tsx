import { useMemo } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import type { ID, ISeller } from "@/shared/types";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Icon } from "@/components/Icon";
import { cn } from "@/lib/utils";
import { formatRelativeTimeBR } from "@/shared/utils/format";
import { useSellersProvider } from "@/providers/data";
import { useInventoryMovements } from "../hooks/useInventoryMovements";
import { MovementTypeBadge } from "./MovementTypeBadge";
import { INVENTORY_MOVEMENT_STRINGS as S } from "../i18n/pt-BR";

const WIDGET_ROWS = 5;

export interface IRecentMovementsWidgetProps {
  /**
   * When omitted, defaults to the Owner cross-store view. Pass the active
   * store id to scope to a single one (Gestor / Financeiro cockpit).
   */
  storeId?: ID;
  /**
   * Accessible store ids — used when `storeId` is omitted so the underlying
   * hook can fan out queries across all stores the user can see.
   */
  accessibleStoreIds: ID[];
}

/**
 * Executive Cockpit highlight (PRD-040 ↔ PRD-052) — newest 5 stock
 * movements derived from paid / returned orders. Card is a button that
 * navigates to the full ledger; each row links to the source order.
 */
export function RecentMovementsWidget({
  storeId,
  accessibleStoreIds,
}: IRecentMovementsWidgetProps) {
  const navigate = useNavigate();
  const sellersProvider = useSellersProvider();

  const result = useInventoryMovements(
    {
      storeId: storeId ?? "all",
      type: "all",
      productQuery: "",
      period: "all",
      sellerId: "all",
    },
    accessibleStoreIds,
  );

  const sellersQuery = useQuery({
    queryKey: ["sellers-for-movements-widget"] as const,
    queryFn: () => sellersProvider.list({ active: true }),
    staleTime: 60_000,
  });

  const sellersById = useMemo<Map<ID, ISeller>>(() => {
    const m = new Map<ID, ISeller>();
    (sellersQuery.data ?? []).forEach((s) => m.set(s.id, s));
    return m;
  }, [sellersQuery.data]);

  const rows = useMemo(() => result.filtered.slice(0, WIDGET_ROWS), [result.filtered]);

  return (
    <Card className="flex h-full flex-col gap-3 p-5">
      <header className="flex items-baseline justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-base font-semibold tracking-tight text-foreground">
            <Icon icon="mdi:swap-vertical-variant" size={18} className="text-primary" />
            {S.widgetTitle}
          </h2>
          <p className="text-xs text-muted-foreground">{S.widgetSubtitle}</p>
        </div>
        <Link
          to="/app/gestao/estoque-movimentacao"
          className="text-xs text-primary hover:underline"
        >
          {S.widgetCta}
        </Link>
      </header>

      {result.isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: WIDGET_ROWS }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">{S.widgetEmpty}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {rows.map((mov) => {
            const seller = sellersById.get(mov.performedBy);
            const isOutflow = mov.quantity < 0;
            return (
              <li
                key={mov.id}
                className="group flex items-center gap-3 rounded-md border border-border/60 bg-muted/20 px-3 py-2"
              >
                <MovementTypeBadge type={mov.type} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">{mov.partName}</p>
                  <p className="truncate text-[11px] text-muted-foreground">
                    {seller?.name ?? S.rowSystemActor} ·{" "}
                    {formatRelativeTimeBR(mov.performedAt) ?? mov.performedAt}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    if (mov.orderId) {
                      void navigate({
                        to: "/app/pedidos/$id",
                        params: { id: mov.orderId as string },
                      });
                    } else {
                      void navigate({ to: "/app/gestao/estoque-movimentacao" });
                    }
                  }}
                  className={cn(
                    "shrink-0 font-mono text-sm font-semibold tabular-nums transition-colors hover:underline",
                    isOutflow ? "text-destructive" : "text-success",
                  )}
                  aria-label={`Abrir pedido ${mov.orderNumber ?? ""}`}
                >
                  {isOutflow ? "" : "+"}
                  {mov.quantity}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
