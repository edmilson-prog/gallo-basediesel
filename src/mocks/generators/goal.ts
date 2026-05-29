import type { IGoal, ISeller, ID, GoalMetric, GoalStatus } from "@/shared/types";
import { STORE_MONTHLY_REVENUE_TARGET } from "../config";
import { SEED_STORE_ID } from "../data";
import { monthRange, monthRef, type ISeededContext } from "./utils";

const METRIC_LABELS: Record<GoalMetric, string> = {
  revenue: "Faturamento",
  margin: "Margem",
  tickets: "Pedidos",
  ticket_medio: "Ticket médio",
  novos_clientes: "Novos clientes",
  positivacao: "Positivação",
  recovery: "Recuperação",
  conversion: "Conversão",
};

function autoName(metric: GoalMetric, date: Date): string {
  const month = date.toLocaleDateString("pt-BR", { month: "long" });
  const capitalized = month.charAt(0).toUpperCase() + month.slice(1);
  return `${METRIC_LABELS[metric]} mensal — ${capitalized} ${date.getFullYear()}`;
}

/**
 * Goal set (PRD-042): mix of active monthly goals + 5 months of history with
 * `status: concluida | arquivada` decided by attainment + 1 canceled goal.
 * Team-level goals stay dormant per PRD-002.
 */
export function generateGoals(
  ctx: ISeededContext,
  options: { sellers: ISeller[]; now?: Date },
): IGoal[] {
  const now = options.now ?? new Date();
  const goals: IGoal[] = [];

  goals.push(...buildPeriod(ctx, now, options.sellers, "ativa"));

  for (let i = 1; i <= 5; i += 1) {
    const past = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const targets = buildPeriod(ctx, past, options.sellers, undefined);
    for (const g of targets) {
      const reachedTarget = g.currentValue >= g.targetValue;
      g.status = reachedTarget ? "concluida" : "arquivada";
      goals.push(g);
    }
  }

  goals.push(
    cancelGoal(
      makeGoal(ctx, {
        id: `goal-${monthRef(now)}-store-recovery-cancelled`,
        level: "store",
        targetId: SEED_STORE_ID,
        sellerId: undefined,
        metric: "recovery",
        targetValue: 25,
        currentValue: 4,
        start: monthRange(now).start,
        end: monthRange(now).end,
        status: "cancelada",
      }),
      "Mudança de estratégia comercial para o trimestre",
    ),
  );

  return goals;
}

function buildPeriod(
  ctx: ISeededContext,
  date: Date,
  sellers: ISeller[],
  status: GoalStatus | undefined,
): IGoal[] {
  const out: IGoal[] = [];
  const { start, end } = monthRange(date);
  const period = monthRef(date);

  out.push(
    makeGoal(ctx, {
      id: `goal-${period}-store-revenue`,
      level: "store",
      targetId: SEED_STORE_ID,
      sellerId: undefined,
      metric: "revenue",
      targetValue: STORE_MONTHLY_REVENUE_TARGET,
      currentValue: ctx.int(400_000, 1_400_000),
      start,
      end,
      status,
    }),
  );

  out.push(
    makeGoal(ctx, {
      id: `goal-${period}-store-positivacao`,
      level: "store",
      targetId: SEED_STORE_ID,
      sellerId: undefined,
      metric: "positivacao",
      targetValue: 70,
      currentValue: ctx.int(40, 90),
      start,
      end,
      status,
    }),
  );

  for (const seller of sellers) {
    if (seller.id === "seller-joao-gallo") continue;
    out.push(
      makeGoal(ctx, {
        id: `goal-${period}-${seller.id}-revenue`,
        level: "individual",
        targetId: seller.id,
        sellerId: seller.id,
        metric: "revenue",
        targetValue: 350_000,
        currentValue: ctx.int(80_000, 450_000),
        start,
        end,
        status,
      }),
    );
    out.push(
      makeGoal(ctx, {
        id: `goal-${period}-${seller.id}-tickets`,
        level: "individual",
        targetId: seller.id,
        sellerId: seller.id,
        metric: "tickets",
        targetValue: 25,
        currentValue: ctx.int(8, 32),
        start,
        end,
        status,
      }),
    );
  }

  if (sellers.length > 0) {
    const featured = sellers.find((s) => s.id !== "seller-joao-gallo") ?? sellers[0];
    out.push(
      makeGoal(ctx, {
        id: `goal-${period}-${featured.id}-ticket-medio`,
        level: "individual",
        targetId: featured.id,
        sellerId: featured.id,
        metric: "ticket_medio",
        targetValue: 1_000,
        currentValue: ctx.int(600, 1_300),
        start,
        end,
        status,
      }),
    );
    out.push(
      makeGoal(ctx, {
        id: `goal-${period}-${featured.id}-novos`,
        level: "individual",
        targetId: featured.id,
        sellerId: featured.id,
        metric: "novos_clientes",
        targetValue: 10,
        currentValue: ctx.int(1, 14),
        start,
        end,
        status,
      }),
    );
  }

  return out;
}

interface IMakeGoalInput {
  id: ID;
  level: IGoal["level"];
  targetId: ID;
  sellerId: ID | undefined;
  metric: GoalMetric;
  targetValue: number;
  currentValue: number;
  start: Date;
  end: Date;
  status: GoalStatus | undefined;
}

function makeGoal(_ctx: ISeededContext, input: IMakeGoalInput): IGoal {
  const progressPercent = input.targetValue > 0 ? input.currentValue / input.targetValue : 0;
  const nowISO = new Date().toISOString();
  return {
    id: input.id,
    storeId: SEED_STORE_ID,
    level: input.level,
    targetId: input.targetId,
    sellerId: input.sellerId,
    period: {
      type: "monthly",
      start: input.start.toISOString(),
      end: input.end.toISOString(),
    },
    metric: input.metric,
    targetValue: input.targetValue,
    currentValue: input.currentValue,
    progressPercent,
    division: "parts",
    name: autoName(input.metric, input.start),
    status: input.status ?? "ativa",
    createdBy: input.level === "store" ? "seller-joao-gallo" : "seller-marina-cardoso",
    createdAt: nowISO,
    updatedAt: nowISO,
  };
}

function cancelGoal(goal: IGoal, reason: string): IGoal {
  goal.status = "cancelada";
  goal.cancelReason = reason;
  return goal;
}
