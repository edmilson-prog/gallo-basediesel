import type {
  CommissionSplitPolicy,
  ICarteiraTransfer,
  ICommission,
  ICommissionGoalBonus,
  ICommissionGoalSnapshot,
  ICommissionRuleConfig,
  ICommissionSettings,
  ICommissionSplitDetails,
  ID,
  IGoal,
  IOrder,
} from "@/shared/types";

/**
 * Context passed to the engine. Pure inputs only — the engine itself never
 * mutates external state and never performs I/O.
 */
export interface ICommissionEngineContext {
  settings: ICommissionSettings;
  transfers: ICarteiraTransfer[];
  goals: IGoal[];
  /** Optional injected "now" for deterministic tests. */
  now?: Date;
}

export interface ICommissionBeneficiary {
  sellerId: ID;
  isSplit: boolean;
  splitDetails?: ICommissionSplitDetails;
}

const round2 = (value: number): number => Math.round(value * 100) / 100;

const monthRef = (iso: string): string => {
  const d = new Date(iso);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
};

/**
 * Resolve the rule that applies to a given seller for the store.
 *
 * Resolution order:
 *  1. Active, in-window rule with `sellerId === seller`
 *  2. Active, in-window rule without `sellerId` (store default)
 *  3. Synthetic fallback rule using `settings.defaultRate`
 */
export function findApplicableRule(params: {
  sellerId: ID;
  storeId: ID;
  paidAt: string;
  settings: ICommissionSettings;
}): ICommissionRuleConfig {
  const { sellerId, storeId, paidAt, settings } = params;
  const paid = new Date(paidAt).getTime();
  const inWindow = (rule: ICommissionRuleConfig): boolean => {
    if (!rule.isActive) return false;
    if (rule.storeId !== storeId) return false;
    if (new Date(rule.validFrom).getTime() > paid) return false;
    if (rule.validUntil && new Date(rule.validUntil).getTime() < paid) return false;
    return true;
  };
  const specific = settings.rules.find((r) => r.sellerId === sellerId && inWindow(r));
  if (specific) return specific;
  const storeDefault = settings.rules.find((r) => !r.sellerId && inWindow(r));
  if (storeDefault) return storeDefault;
  return {
    id: `__fallback-default-${storeId}`,
    storeId,
    name: "Taxa padrão da loja (fallback)",
    baseRate: settings.defaultRate,
    validFrom: "2020-01-01T00:00:00.000Z",
    isActive: true,
    createdBy: "system",
    createdAt: "2020-01-01T00:00:00.000Z",
  };
}

/**
 * Identify the commission beneficiary for an order, applying the split policy
 * when a temporary carteira transfer is active at the moment of payment.
 */
export function determineCommissionBeneficiary(params: {
  order: IOrder;
  transfers: ICarteiraTransfer[];
  splitPolicy: CommissionSplitPolicy;
}): ICommissionBeneficiary {
  const { order, transfers, splitPolicy } = params;
  const paidAt = order.paidAt ?? order.updatedAt;
  const paidMs = new Date(paidAt).getTime();
  const active = transfers.find((t) => {
    if (t.type !== "temporary") return false;
    if (t.status !== "active") return false;
    if (t.storeId !== order.storeId) return false;
    if (!t.customerIds.includes(order.customerId)) return false;
    const start = new Date(t.startDate).getTime();
    const end = t.endDate ? new Date(t.endDate).getTime() : Infinity;
    if (paidMs < start) return false;
    if (paidMs > end) return false;
    if (t.fromSellerId !== order.sellerId) return false;
    return true;
  });
  if (!active) {
    return { sellerId: order.sellerId, isSplit: false };
  }
  if (splitPolicy === "coverage_full") {
    return { sellerId: active.toSellerId, isSplit: false };
  }
  return {
    sellerId: active.toSellerId,
    isSplit: true,
    splitDetails: {
      coverageSellerId: active.toSellerId,
      titularSellerId: active.fromSellerId,
      coveragePct: 0.5,
      titularPct: 0.5,
      transferId: active.id,
    },
  };
}

interface IGoalBonusResolution {
  bonus: number;
  effectiveRate: number;
  goalSnapshot?: ICommissionGoalSnapshot;
}

const goalAchievement = (goal: IGoal): number => {
  if (!goal.targetValue || goal.targetValue <= 0) return 0;
  return goal.currentValue / goal.targetValue;
};

function resolveGoalBonus(params: {
  order: IOrder;
  rule: ICommissionRuleConfig;
  baseRate: number;
  baseValue: number;
  goals: IGoal[];
  enabled: boolean;
}): IGoalBonusResolution {
  const { order, rule, baseRate, baseValue, goals, enabled } = params;
  if (!enabled || !rule.goalBonus) {
    return { bonus: 0, effectiveRate: baseRate };
  }
  const bonus: ICommissionGoalBonus = rule.goalBonus;
  const period = monthRef(order.paidAt ?? order.createdAt);
  const sellerOfOrder = order.sellerId;
  const eligible = goals.find((g) => {
    const goalSeller = g.sellerId ?? (g.level === "individual" ? g.targetId : undefined);
    if (goalSeller !== sellerOfOrder) return false;
    if (g.storeId !== order.storeId) return false;
    if (String(g.metric) !== bonus.goalType) return false;
    if (g.status !== "concluida") return false;
    const refStart = g.period.start.slice(0, 7);
    const refEnd = g.period.end.slice(0, 7);
    if (period < refStart) return false;
    if (period > refEnd) return false;
    const achievement = goalAchievement(g) * 100;
    return achievement >= bonus.threshold;
  });
  if (!eligible) {
    return { bonus: 0, effectiveRate: baseRate };
  }
  const snapshot: ICommissionGoalSnapshot = {
    id: eligible.id,
    type: String(eligible.metric),
    targetValue: eligible.targetValue,
    currentValue: eligible.currentValue,
    achievementPct: round2(goalAchievement(eligible) * 100),
    period,
  };
  if (bonus.bonusType === "fixed") {
    return { bonus: round2(bonus.bonusValue), effectiveRate: baseRate, goalSnapshot: snapshot };
  }
  const effective = round2((baseRate + bonus.bonusValue / 100) * 10000) / 10000;
  const incrementalBonus = round2(baseValue * (effective - baseRate));
  return { bonus: incrementalBonus, effectiveRate: effective, goalSnapshot: snapshot };
}

export interface ICalculatedCommission {
  primary: Omit<ICommission, "id" | "createdAt">;
  /** Present when isSplit=true under split_50_50: a second commission for the titular. */
  secondary?: Omit<ICommission, "id" | "createdAt">;
}

/**
 * Compute commission record(s) for a paid order — pure function.
 *
 * Honors:
 *  - rule resolution (seller-specific > store default > fallback)
 *  - goal bonus when settings.goalBonusEnabled (fixed or percentage_points)
 *  - split policy when a temporary transfer is active
 *
 * Returns one or two commissions (two when `splitPolicy === 'split_50_50'`).
 */
export function calculateCommission(
  order: IOrder,
  ctx: ICommissionEngineContext,
): ICalculatedCommission {
  const baseValue = round2(Math.max(0, order.subtotal - order.discount));
  const paidAt = order.paidAt ?? order.updatedAt;
  const period = monthRef(paidAt);

  const beneficiary = determineCommissionBeneficiary({
    order,
    transfers: ctx.transfers,
    splitPolicy: ctx.settings.splitPolicy,
  });

  const buildFor = (
    sellerId: ID,
    share: number,
    splitDetails?: ICommissionSplitDetails,
  ): Omit<ICommission, "id" | "createdAt"> => {
    const rule = findApplicableRule({
      sellerId,
      storeId: order.storeId,
      paidAt,
      settings: ctx.settings,
    });
    const baseRate = rule.baseRate;
    const sharedBaseValue = round2(baseValue * share);
    const baseCommission = round2(sharedBaseValue * baseRate);
    const bonusRes = resolveGoalBonus({
      order: { ...order, sellerId },
      rule,
      baseRate,
      baseValue: sharedBaseValue,
      goals: ctx.goals,
      enabled: ctx.settings.goalBonusEnabled,
    });
    const totalCommission = round2(baseCommission + bonusRes.bonus);
    const calculatedAt = new Date(ctx.now ?? Date.now()).toISOString();
    return {
      storeId: order.storeId,
      sellerId,
      orderId: order.id,
      baseValue: sharedBaseValue,
      baseRate,
      rate: bonusRes.effectiveRate,
      baseCommission,
      goalBonus: round2(bonusRes.bonus),
      totalCommission,
      value: totalCommission,
      isSplit: Boolean(splitDetails),
      splitDetails,
      ruleSnapshot: rule,
      goalSnapshot: bonusRes.goalSnapshot,
      period,
      status: "calculated",
      calculatedAt,
    };
  };

  if (beneficiary.isSplit && beneficiary.splitDetails) {
    const sd = beneficiary.splitDetails;
    return {
      primary: buildFor(sd.coverageSellerId, sd.coveragePct, sd),
      secondary: buildFor(sd.titularSellerId, sd.titularPct, {
        ...sd,
        // swap perspectives for clarity but keep identifiers
      }),
    };
  }
  return { primary: buildFor(beneficiary.sellerId, 1) };
}
