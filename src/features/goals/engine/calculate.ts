import type {
  ICustomer,
  IGoal,
  IGoalProgress,
  IOrder,
} from "@/shared/types";
import { computeProjection, describePeriodWindow } from "./projection";
import { statusFromRatio, computeWindowedTrend } from "@/shared/progress";

export interface IGoalContext {
  orders: IOrder[];
  customers: ICustomer[];
  /** Reference clock — defaults to `new Date()`; injectable for memo stability. */
  now?: Date;
}

function isWithin(iso: string | undefined, fromIso: string, toIso: string): boolean {
  if (!iso) return false;
  return iso >= fromIso && iso <= toIso;
}

function matchesGoal(order: IOrder, goal: IGoal): boolean {
  if (order.storeId !== goal.storeId) return false;
  if (goal.level === "individual" && order.sellerId !== goal.targetId) return false;
  if (goal.division && order.division !== goal.division) return false;
  return true;
}

function isPaid(order: IOrder): boolean {
  return order.paymentStatus === "pago";
}

/**
 * Pure function — compute the runtime progress of a goal given orders and
 * customers in scope. Never reads `goal.currentValue` / `progressPercent`
 * (those are stale snapshots from the mock seed) — except for `recovery` and
 * `conversion` metrics whose real implementation lives in PRDs 044/053.
 */
export function calculateGoalProgress(goal: IGoal, context: IGoalContext): IGoalProgress {
  const now = context.now ?? new Date();
  const fromIso = goal.period.start;
  const toIso = goal.period.end;

  let currentValue = 0;

  switch (goal.metric) {
    case "revenue": {
      for (const o of context.orders) {
        if (!matchesGoal(o, goal)) continue;
        if (!isPaid(o)) continue;
        if (!isWithin(o.paidAt ?? o.createdAt, fromIso, toIso)) continue;
        currentValue += o.total;
      }
      break;
    }
    case "margin": {
      for (const o of context.orders) {
        if (!matchesGoal(o, goal)) continue;
        if (!isPaid(o)) continue;
        if (!isWithin(o.paidAt ?? o.createdAt, fromIso, toIso)) continue;
        for (const item of o.items) currentValue += item.marginValue;
      }
      break;
    }
    case "ticket_medio": {
      const matching: number[] = [];
      for (const o of context.orders) {
        if (!matchesGoal(o, goal)) continue;
        if (!isPaid(o)) continue;
        if (!isWithin(o.paidAt ?? o.createdAt, fromIso, toIso)) continue;
        matching.push(o.total);
      }
      currentValue =
        matching.length > 0 ? matching.reduce((a, b) => a + b, 0) / matching.length : 0;
      break;
    }
    case "tickets": {
      for (const o of context.orders) {
        if (!matchesGoal(o, goal)) continue;
        if (!isPaid(o)) continue;
        if (!isWithin(o.paidAt ?? o.createdAt, fromIso, toIso)) continue;
        currentValue += 1;
      }
      break;
    }
    case "positivacao": {
      const seen = new Set<string>();
      for (const o of context.orders) {
        if (!matchesGoal(o, goal)) continue;
        if (!isPaid(o)) continue;
        if (!isWithin(o.paidAt ?? o.createdAt, fromIso, toIso)) continue;
        seen.add(o.customerId);
      }
      currentValue = seen.size;
      break;
    }
    case "novos_clientes": {
      for (const c of context.customers) {
        if (c.storeId !== goal.storeId) continue;
        if (goal.level === "individual" && c.sellerId !== goal.targetId) continue;
        if (!isWithin(c.createdAt, fromIso, toIso)) continue;
        currentValue += 1;
      }
      break;
    }
    case "recovery":
    case "conversion": {
      // Advanced metrics depend on PRDs 044/053 — fall back to seed snapshot.
      currentValue = goal.currentValue;
      break;
    }
  }

  const window = describePeriodWindow(goal.period, now);
  const percentage =
    goal.targetValue > 0 ? Math.round((currentValue / goal.targetValue) * 1000) / 10 : 0;
  const projection = computeProjection(
    currentValue,
    window.daysPassed,
    window.totalDays,
    goal.targetValue,
  );
  const paceRatio = window.daysRatio > 0 ? percentage / (window.daysRatio * 100) : 1;
  const status = statusFromRatio(percentage, window.daysRatio);
  const trendSamples = context.orders
    .filter((o) => matchesGoal(o, goal) && isPaid(o))
    .map((o) => ({ ts: o.paidAt ?? o.createdAt, value: o.total }))
    .filter((s) => s.ts >= fromIso && s.ts <= toIso);
  const trend = computeWindowedTrend(trendSamples, fromIso, now);

  return {
    goalId: goal.id,
    currentValue,
    percentage,
    projection,
    daysRemaining: window.daysRemaining,
    totalDays: window.totalDays,
    status,
    trend,
    paceRatio,
  };
}
