import type { IConversation, ISdrSession, SdrFinishReason, SdrSessionState } from "@/shared/types";
import { daysAgo, randomISO, type ISeededContext } from "./utils";

interface IGenerateSdrSessionInput {
  sequence: number;
  conversation: IConversation;
  now?: Date;
}

const FINISH_REASON_WEIGHTS: { value: SdrFinishReason; weight: number }[] = [
  { value: "completed", weight: 35 },
  { value: "escalated", weight: 30 },
  { value: "abandoned", weight: 20 },
  { value: "paused_by_human", weight: 15 },
];

const SAMPLE_NEEDS = [
  "preciso de filtro de óleo pro Volvo R450",
  "buscando pastilha de freio dianteira",
  "fiz revisão e preciso de injetor novo",
  "tenho um Scania 2018 com vazamento na bomba",
  "preciso fechar pedido de embreagem para hoje",
  "estou cotando rolamento para Mercedes Actros",
  "preciso de orçamento para amortecedores",
  "frete para Frederico Westphalen para um cilindro",
];

const SAMPLE_NAMES = [
  "João",
  "Carlos",
  "Maria",
  "Roberto",
  "Lucas",
  "Eduarda",
  "Diego",
  "Patrícia",
  "Marcelo",
  "Vanessa",
];

const SAMPLE_COMPANIES = [
  "Frota Express",
  "Transporte Bauer",
  "Logística Sul",
  "Trans-FW",
  "PJ - autônomo",
  "Cooperativa Diesel",
];

function pickFinishReason(ctx: ISeededContext): SdrFinishReason {
  const total = FINISH_REASON_WEIGHTS.reduce((acc, w) => acc + w.weight, 0);
  let roll = ctx.int(1, total);
  for (const entry of FINISH_REASON_WEIGHTS) {
    roll -= entry.weight;
    if (roll <= 0) return entry.value;
  }
  return "completed";
}

function stateForFinishReason(reason: SdrFinishReason): SdrSessionState {
  switch (reason) {
    case "escalated":
      return "finalizado";
    case "completed":
      return "finalizado";
    case "abandoned":
      return "finalizado";
    case "paused_by_human":
      return "pausado";
  }
}

/**
 * Synthesize a historical `ISdrSession` for the conversation. Used by the
 * bootstrap so the PRD-024 painel renders believable metrics from day one and
 * so the simulator inspector has real-shaped data to surface.
 */
export function generateSdrSession(
  ctx: ISeededContext,
  input: IGenerateSdrSessionInput,
): ISdrSession {
  const id = `sdr-${String(input.sequence + 1).padStart(4, "0")}`;
  const finishReason = pickFinishReason(ctx);
  const state = stateForFinishReason(finishReason);
  const now = input.now ?? new Date();
  const startedAt = randomISO(ctx, daysAgo(30, now), now);
  const durationMs = ctx.int(60_000, 25 * 60_000);
  const finishedAt = new Date(new Date(startedAt).getTime() + durationMs).toISOString();
  const lastActivityAt = finishedAt;

  return {
    id,
    conversationId: input.conversation.id,
    state,
    collectedData: {
      name: ctx.pick(SAMPLE_NAMES),
      company: ctx.bool(0.6) ? ctx.pick(SAMPLE_COMPANIES) : undefined,
      needs: ctx.pick(SAMPLE_NEEDS),
    },
    startedAt,
    lastActivityAt,
    finishedAt,
    finishReason,
    pausedFromState: finishReason === "paused_by_human" ? "qualificacao" : undefined,
  };
}
