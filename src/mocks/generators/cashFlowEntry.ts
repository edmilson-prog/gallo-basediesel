import type { ICashFlowEntry, ID } from "@/shared/types";
import type { ISeededContext } from "./utils";

const round2 = (v: number): number => Math.round(v * 100) / 100;

/**
 * Generate the manual cash flow entries (PRD-055 RF-003): a handful of capital
 * injections (aporte) and owner withdrawals (retirada) spread across the last
 * 12 months. Derived entries (orders/expenses/commissions) are NOT generated —
 * the engine computes them on the fly.
 */
export function generateManualCashFlowEntries(options: {
  ctx: ISeededContext;
  storeId: ID;
  ownerId: ID;
  now: Date;
}): ICashFlowEntry[] {
  const { ctx, storeId, ownerId, now } = options;
  const out: ICashFlowEntry[] = [];

  const plan: {
    type: "entrada" | "retirada";
    description: string;
    min: number;
    max: number;
    monthOffset: number;
  }[] = [
    {
      type: "entrada",
      description: "Aporte de capital do sócio",
      min: 30_000,
      max: 60_000,
      monthOffset: 1,
    },
    {
      type: "entrada",
      description: "Aporte para capital de giro",
      min: 20_000,
      max: 40_000,
      monthOffset: 6,
    },
    {
      type: "retirada",
      description: "Pró-labore do sócio",
      min: 12_000,
      max: 18_000,
      monthOffset: 3,
    },
    {
      type: "retirada",
      description: "Distribuição de lucros",
      min: 15_000,
      max: 35_000,
      monthOffset: 8,
    },
    {
      type: "retirada",
      description: "Pró-labore do sócio",
      min: 12_000,
      max: 18_000,
      monthOffset: 10,
    },
  ];

  plan.forEach((p, i) => {
    const date = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (11 - p.monthOffset), ctx.int(3, 25)),
    ).toISOString();
    out.push({
      id: `cf-manual-${String(i + 1).padStart(3, "0")}`,
      type: p.type === "entrada" ? "entrada" : "saida",
      source: p.type === "entrada" ? "aporte" : "retirada",
      description: p.description,
      amount: round2(ctx.int(p.min, p.max)),
      date,
      status: "realizado",
      storeId,
      createdBy: ownerId,
      createdAt: date,
    });
  });

  return out;
}
