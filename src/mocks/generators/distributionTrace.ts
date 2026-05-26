import type {
  IConversation,
  ICustomer,
  IDistributionTrace,
  ILead,
  ISeller,
  DistributionMatchedCriterion,
  DistributionMode,
} from "@/shared/types";
import { SEED_STORE_ID } from "../data";
import { randomISO, type ISeededContext } from "./utils";

interface IGenerateTraceInput {
  sequence: number;
  conversation: IConversation;
  customers: ICustomer[];
  leads: ILead[];
  sellers: ISeller[];
  mode: DistributionMode;
  now?: Date;
}

const CRITERION_WEIGHTS: { value: DistributionMatchedCriterion; weight: number }[] = [
  { value: "carteira", weight: 40 },
  { value: "round_robin", weight: 25 },
  { value: "carga", weight: 15 },
  { value: "especialidade", weight: 10 },
  { value: "fallback_sdr", weight: 7 },
  { value: "fallback_fila", weight: 3 },
];

function pickCriterion(ctx: ISeededContext): DistributionMatchedCriterion {
  const total = CRITERION_WEIGHTS.reduce((acc, c) => acc + c.weight, 0);
  let roll = ctx.int(1, total);
  for (const entry of CRITERION_WEIGHTS) {
    roll -= entry.weight;
    if (roll <= 0) return entry.value;
  }
  return "carga";
}

/**
 * Synthesize a historical distribution trace.
 *
 * Used by the bootstrap so the painel administrativo of PRD-013 ships with a
 * believable history (~40 entries) without requiring the engine to be
 * exercised live. The chosen criterion is drawn from `CRITERION_WEIGHTS` to
 * resemble the real-world distribution observed in the briefing.
 */
export function generateDistributionTrace(
  ctx: ISeededContext,
  input: IGenerateTraceInput,
): IDistributionTrace {
  const id = `dist-${String(input.sequence + 1).padStart(4, "0")}`;
  const now = input.now ?? new Date();
  const timestamp = randomISO(ctx, new Date(input.conversation.createdAt), now);
  const matched = pickCriterion(ctx);
  const customer = input.conversation.customerId
    ? input.customers.find((c) => c.id === input.conversation.customerId)
    : undefined;
  const lead = input.conversation.leadId
    ? input.leads.find((l) => l.id === input.conversation.leadId)
    : undefined;

  let selectedSellerId: string | null = input.conversation.assignedSellerId ?? null;
  let candidates: IDistributionTrace["candidatesEvaluated"] = [];

  if (matched === "carteira" && customer) {
    selectedSellerId = customer.sellerId;
    candidates = [
      {
        sellerId: customer.sellerId,
        reason: "carteira existente do cliente",
        selected: true,
      },
    ];
  } else if (matched === "fallback_sdr") {
    selectedSellerId = null;
    candidates = input.sellers.slice(0, 2).map((s) => ({
      sellerId: s.id,
      reason: `availability=${s.availability} — não disponível`,
      selected: false,
    }));
    candidates.push({
      sellerId: "sdr-agent",
      reason: "SDR assumiu (fallback)",
      selected: true,
    });
  } else if (matched === "fallback_fila") {
    selectedSellerId = null;
    candidates = input.sellers.slice(0, 2).map((s) => ({
      sellerId: s.id,
      reason: `availability=${s.availability} — não disponível`,
      selected: false,
    }));
    candidates.push({
      sellerId: "queue",
      reason: "Sem SDR — conversa entrou em fila",
      selected: true,
    });
  } else {
    // round-robin, carga, especialidade — pick from sellers
    const online = input.sellers.filter((s) => s.availability === "online");
    const pool = online.length > 0 ? online : input.sellers;
    const winner = ctx.pick(pool);
    selectedSellerId = winner.id;
    candidates = pool.map((s) => {
      const load = ctx.int(1, 6);
      return {
        sellerId: s.id,
        reason: `online, carga=${load}`,
        selected: s.id === winner.id,
      };
    });
  }

  return {
    id,
    conversationId: input.conversation.id,
    customerId: customer?.id,
    leadId: lead?.id,
    storeId: SEED_STORE_ID,
    timestamp,
    selectedSellerId,
    criterionMatched: matched,
    candidatesEvaluated: candidates,
    mode: input.mode,
  };
}
