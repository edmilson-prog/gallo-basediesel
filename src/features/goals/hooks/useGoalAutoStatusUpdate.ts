import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { ICustomer, ID, IGoal, IOrder } from "@/shared/types";
import {
  FETCH_ALL_PAGE_SIZE,
  useCustomersProvider,
  useGoalsProvider,
  useOrdersProvider,
  recordAuditLogSync,
  type IGoalsProvider,
} from "@/providers/data";
import { calculateGoalProgress } from "../engine/calculate";

export interface IUseGoalAutoStatusUpdateParams {
  storeId?: ID;
}

const STORAGE_KEY = "gallo-goal-auto-status-run";
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
 * Auto-transition overdue active goals (PRD-042 RF-026). Runs at most once per
 * browser per 24 hours, and only when invoked by a Gestor/Owner-facing dashboard
 * (Vendedor view doesn't trigger writes).
 *
 * For each active goal with `endDate < now`:
 *   - `percentage >= 100` → status: "concluida" + audit `goal_auto_complete`.
 *   - otherwise → status: "arquivada" + audit `goal_auto_archive`.
 */
export function useGoalAutoStatusUpdate(params: IUseGoalAutoStatusUpdateParams = {}): void {
  const goalsProvider = useGoalsProvider();
  const ordersProvider = useOrdersProvider();
  const customersProvider = useCustomersProvider();
  const queryClient = useQueryClient();
  const ranRef = useRef(false);

  useEffect(() => {
    if (ranRef.current) return;
    if (!shouldRunNow()) return;
    ranRef.current = true;

    void (async () => {
      const now = new Date();
      try {
        const goalsRes = await goalsProvider.list({ storeId: params.storeId, pageSize: 500 });
        const overdue = goalsRes.data.filter(
          (g) => (g.status ?? "ativa") === "ativa" && new Date(g.period.end) < now,
        );
        if (overdue.length === 0) {
          markRanNow();
          return;
        }
        const ordersRes = await ordersProvider.list({
          storeId: params.storeId,
          paymentStatus: "pago",
          pageSize: 2000,
        });
        const customersRes = await customersProvider.list({
          storeId: params.storeId,
          pageSize: FETCH_ALL_PAGE_SIZE,
        });

        await Promise.all(
          overdue.map((g) =>
            transitionGoal(g, {
              orders: ordersRes.data,
              customers: customersRes.data,
              goalsProvider,
            }),
          ),
        );
        markRanNow();
        await queryClient.invalidateQueries({ queryKey: ["goals"] });
      } catch {
        /* swallow — audit logger never throws; provider errors are tolerable */
      }
    })();
  }, [goalsProvider, ordersProvider, customersProvider, params.storeId, queryClient]);
}

async function transitionGoal(
  goal: IGoal,
  ctx: {
    orders: IOrder[];
    customers: ICustomer[];
    goalsProvider: IGoalsProvider;
  },
): Promise<void> {
  const progress = calculateGoalProgress(goal, {
    orders: ctx.orders,
    customers: ctx.customers,
  });
  const reachedTarget = progress.percentage >= 100;
  const nextStatus = reachedTarget ? "concluida" : "arquivada";
  await ctx.goalsProvider.update(goal.id, {
    status: nextStatus,
    currentValue: progress.currentValue,
    progressPercent: progress.percentage / 100,
  });
  recordAuditLogSync({
    actorId: "system",
    action: reachedTarget ? "goal_auto_complete" : "goal_auto_archive",
    resource: "goal",
    resourceId: goal.id,
    storeId: goal.storeId,
  });
}
