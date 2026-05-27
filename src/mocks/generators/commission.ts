import type {
  CommissionStatus,
  ICommission,
  ICommissionRuleConfig,
  ICommissionSettings,
  IOrder,
  ID,
} from "@/shared/types";
import { monthRef, pickWeighted, randomISO, type ISeededContext } from "./utils";

/**
 * Status distribution targets the "pending close" experience: most commissions
 * stay in `calculated` until the manager closes the month. We sprinkle a few
 * `approved`/`paid`/`disputed` to make the UI varied.
 */
const STATUS_WEIGHTS = [
  { value: "calculated" as const, weight: 6 },
  { value: "approved" as const, weight: 3 },
  { value: "paid" as const, weight: 2 },
  { value: "disputed" as const, weight: 1 },
];

const round2 = (v: number): number => Math.round(v * 100) / 100;

/**
 * Generate one commission for a paid order using the configured store rules.
 * Snapshots the resolved rule into the commission so retroactive edits never
 * mutate already-emitted records.
 */
export function generateCommission(
  ctx: ISeededContext,
  options: {
    sequence: number;
    order: IOrder;
    settings: ICommissionSettings;
  },
): ICommission {
  const id: ID = `comm-${String(options.sequence + 1).padStart(4, "0")}`;
  const order = options.order;
  const paidAt = order.paidAt ?? order.updatedAt;
  const rule = resolveRule(order, options.settings);
  const baseValue = round2(Math.max(0, order.subtotal - order.discount));
  const baseRate = rule.baseRate;
  const baseCommission = round2(baseValue * baseRate);
  const totalCommission = baseCommission;
  const period = monthRef(new Date(paidAt));
  const status: CommissionStatus = pickWeighted(ctx, STATUS_WEIGHTS);
  const createdAt = randomISO(ctx, new Date(order.createdAt), new Date(order.updatedAt));

  return {
    id,
    storeId: order.storeId,
    sellerId: order.sellerId,
    orderId: order.id,
    baseValue,
    baseRate,
    rate: baseRate,
    baseCommission,
    goalBonus: 0,
    totalCommission,
    value: totalCommission,
    isSplit: false,
    ruleSnapshot: rule,
    period,
    status,
    calculatedAt: createdAt,
    createdAt,
    approvedAt: status === "approved" || status === "paid" ? createdAt : undefined,
    paidAt: status === "paid" ? createdAt : undefined,
    closedInPeriod: status === "approved" || status === "paid" ? period : undefined,
    notes: undefined,
  };
}

function resolveRule(order: IOrder, settings: ICommissionSettings): ICommissionRuleConfig {
  const specific = settings.rules.find(
    (r) => r.isActive && r.sellerId === order.sellerId && r.storeId === order.storeId,
  );
  if (specific) return specific;
  const storeDefault = settings.rules.find(
    (r) => r.isActive && !r.sellerId && r.storeId === order.storeId,
  );
  if (storeDefault) return storeDefault;
  return {
    id: `__seed-default-${order.storeId}`,
    storeId: order.storeId,
    name: "Taxa padrão da loja",
    baseRate: settings.defaultRate,
    validFrom: "2020-01-01T00:00:00.000Z",
    isActive: true,
    createdBy: "system",
    createdAt: "2020-01-01T00:00:00.000Z",
  };
}
