import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { ID, IOrder, IPart, IProductIndicator } from "@/shared/types";
import {
  useIndicatorsProvider,
  useOrdersProvider,
  usePartsProvider,
  recordAuditLogSync,
  type IIndicatorsProvider,
} from "@/providers/data";
import { calculateIndicatorProgress } from "../engine/calculate";

export interface IUseIndicatorAutoStatusUpdateParams {
  storeId?: ID;
}

const STORAGE_KEY = "gallo-indicator-auto-status-run";
const ONE_DAY_MS = 24 * 3600_000;

function shouldRunNow(): boolean {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return true;
    const last = Number(raw);
    if (Number.isNaN(last)) return true;
    return Date.now() - last >= ONE_DAY_MS;
  } catch {
    return true;
  }
}

function markRanNow(): void {
  try {
    localStorage.setItem(STORAGE_KEY, String(Date.now()));
  } catch {
    /* best-effort */
  }
}

/**
 * Auto-transition overdue active indicators at period end (mirrors
 * `useGoalAutoStatusUpdate` for the product-indicator feature).
 * Runs at most once per browser per 24 hours, mounted in the
 * Owner/Gestor-facing `AggregatedIndicatorsDashboard`.
 *
 * For each active indicator with `period.end < now`:
 *   - `percentage >= 100` → status: "concluido" + audit `indicator_auto_complete`.
 *   - otherwise          → status: "arquivado" + audit `indicator_auto_archive`.
 */
export function useIndicatorAutoStatusUpdate(
  params: IUseIndicatorAutoStatusUpdateParams = {},
): void {
  const indicatorsProvider = useIndicatorsProvider();
  const ordersProvider = useOrdersProvider();
  const partsProvider = usePartsProvider();
  const queryClient = useQueryClient();
  const ranRef = useRef(false);

  useEffect(() => {
    if (ranRef.current) return;
    if (!shouldRunNow()) return;
    ranRef.current = true;

    void (async () => {
      const now = new Date();
      try {
        const indicatorsRes = await indicatorsProvider.list({
          storeId: params.storeId,
          pageSize: 500,
        });
        const overdue = indicatorsRes.data.filter(
          (ind) => ind.status === "ativo" && new Date(ind.period.end) < now,
        );
        if (overdue.length === 0) {
          markRanNow();
          return;
        }

        const ordersRes = await ordersProvider.list({
          storeId: params.storeId,
          paymentStatus: "pago",
          pageSize: 5000,
        });
        const partsRes = await partsProvider.list({ pageSize: 5000 });

        await Promise.all(
          overdue.map((ind) =>
            transitionIndicator(ind, {
              orders: ordersRes.data,
              parts: partsRes.data,
              now,
              indicatorsProvider,
            }),
          ),
        );
        markRanNow();
        await queryClient.invalidateQueries({ queryKey: ["indicators"] });
      } catch {
        /* swallow — audit logger never throws; provider errors are tolerable */
      }
    })();
  }, [indicatorsProvider, ordersProvider, partsProvider, params.storeId, queryClient]);
}

async function transitionIndicator(
  indicator: IProductIndicator,
  ctx: {
    orders: IOrder[];
    parts: IPart[];
    now: Date;
    indicatorsProvider: IIndicatorsProvider;
  },
): Promise<void> {
  const progress = calculateIndicatorProgress(indicator, {
    orders: ctx.orders,
    parts: ctx.parts,
    now: ctx.now,
  });
  const reachedTarget = progress.percentage >= 100;
  const nextStatus = reachedTarget ? "concluido" : "arquivado";
  await ctx.indicatorsProvider.update(indicator.id, { status: nextStatus });
  recordAuditLogSync({
    actorId: "system",
    action: reachedTarget ? "indicator_auto_complete" : "indicator_auto_archive",
    resource: "indicator",
    resourceId: indicator.id,
    storeId: indicator.storeId,
  });
}
