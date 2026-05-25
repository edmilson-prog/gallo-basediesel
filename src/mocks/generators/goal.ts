import type { IGoal, ISeller, ID } from "@/shared/types";
import { SEED_STORE_ID } from "../data";
import { monthRange, monthRef, type ISeededContext } from "./utils";

/**
 * Goal set: 2 store-level (revenue + positivacao) plus 2 individual goals per
 * vendedor seller (revenue + tickets). Team-level goals stay dormant per
 * decisão arquitetural (PRD-002).
 */
export function generateGoals(
  ctx: ISeededContext,
  options: { sellers: ISeller[]; now?: Date },
): IGoal[] {
  const now = options.now ?? new Date();
  const { start, end } = monthRange(now);
  const period = monthRef(now);
  const goals: IGoal[] = [];

  goals.push(
    makeGoal({
      id: `goal-${period}-store-revenue`,
      level: "store",
      targetId: SEED_STORE_ID,
      metric: "revenue",
      targetValue: 1_200_000,
      currentValue: ctx.int(400_000, 1_400_000),
      start,
      end,
    }),
  );

  goals.push(
    makeGoal({
      id: `goal-${period}-store-positivacao`,
      level: "store",
      targetId: SEED_STORE_ID,
      metric: "positivacao",
      targetValue: 70,
      currentValue: ctx.int(40, 90),
      start,
      end,
    }),
  );

  for (const seller of options.sellers) {
    if (seller.id === "seller-joao-gallo") continue; // owner is not in the individual ranking
    goals.push(
      makeGoal({
        id: `goal-${period}-${seller.id}-revenue`,
        level: "individual",
        targetId: seller.id,
        metric: "revenue",
        targetValue: 350_000,
        currentValue: ctx.int(80_000, 450_000),
        start,
        end,
      }),
    );
    goals.push(
      makeGoal({
        id: `goal-${period}-${seller.id}-tickets`,
        level: "individual",
        targetId: seller.id,
        metric: "tickets",
        targetValue: 25,
        currentValue: ctx.int(8, 32),
        start,
        end,
      }),
    );
  }

  return goals;
}

interface IMakeGoalInput {
  id: ID;
  level: IGoal["level"];
  targetId: ID;
  metric: IGoal["metric"];
  targetValue: number;
  currentValue: number;
  start: Date;
  end: Date;
}

function makeGoal(input: IMakeGoalInput): IGoal {
  const progressPercent = input.targetValue > 0 ? input.currentValue / input.targetValue : 0;
  const nowISO = new Date().toISOString();
  return {
    id: input.id,
    storeId: SEED_STORE_ID,
    level: input.level,
    targetId: input.targetId,
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
    createdAt: nowISO,
    updatedAt: nowISO,
  };
}
