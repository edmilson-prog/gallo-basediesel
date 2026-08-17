import type { ILead, ILeadStage, ID } from "@/shared/types";
import { SEED_PIPELINE_STAGES, SEED_STORE_ID, SEED_TAGS, SEED_LOSS_REASONS } from "../data";
import {
  daysAgo,
  pickWeighted,
  randomCNPJ,
  randomCPF,
  randomDate,
  randomISO,
  randomPhone,
  type ISeededContext,
} from "./utils";

const STAGE_BY_KEY: Record<string, ILeadStage> = Object.fromEntries(
  SEED_PIPELINE_STAGES.map((s) => [s.id, s]),
);

const TAG_LABELS = SEED_TAGS.map((t) => t.label);

/** Distribution of leads across pipeline stages (RF-013 statistical realism). */
const STAGE_WEIGHTS = [
  { value: "stage-novo", weight: 30 },
  { value: "stage-qualificacao", weight: 20 },
  { value: "stage-orcamento", weight: 15 },
  { value: "stage-negociacao", weight: 10 },
  { value: "stage-fechado", weight: 5 },
] as const;

interface IGenerateLeadInput {
  sequence: number;
  sellerIds: ID[];
  customerIdForConversion?: ID;
  now?: Date;
}

export function generateLead(ctx: ISeededContext, input: IGenerateLeadInput): ILead {
  const id: ID = `lead-${String(input.sequence + 1).padStart(4, "0")}`;
  const stageKey = pickWeighted(
    ctx,
    STAGE_WEIGHTS as unknown as { value: string; weight: number }[],
  );
  const stage = STAGE_BY_KEY[stageKey];
  const now = input.now ?? new Date();
  const createdAt = randomISO(ctx, daysAgo(60, now), now);
  const updatedAt = randomDate(ctx, new Date(createdAt), now).toISOString();
  const isClosed = stage.id === "stage-fechado";
  const converted = isClosed && ctx.bool(0.4);

  return {
    id,
    storeId: SEED_STORE_ID,
    sellerId: ctx.pick(input.sellerIds),
    name: ctx.faker.person.fullName(),
    phone: randomPhone(ctx),
    email: ctx.bool(0.6) ? ctx.faker.internet.email() : undefined,
    // Only a minority of leads has a document — that IS the state the panel's
    // conversion checklist reports on, and seeding every lead with one would
    // make the mock show a permanently complete ring nobody can read.
    document: ctx.bool(0.3) ? (ctx.bool(0.4) ? randomCNPJ(ctx) : randomCPF(ctx)) : undefined,
    stage,
    temperature: pickWeighted(ctx, [
      { value: "frio" as const, weight: 3 },
      { value: "morno" as const, weight: 5 },
      { value: "quente" as const, weight: 2 },
    ]),
    origin: pickWeighted(ctx, [
      { value: "whatsapp" as const, weight: 6 },
      { value: "ecommerce" as const, weight: 2 },
      { value: "indicacao" as const, weight: 1 },
      { value: "google" as const, weight: 2 },
      { value: "outro" as const, weight: 1 },
    ]),
    estimatedValue: ctx.bool(0.7) ? roundMoney(ctx.int(50_000, 1_800_000) / 100) : undefined,
    nextActionAt: ctx.bool(0.55)
      ? randomISO(ctx, now, new Date(now.getTime() + 14 * 86400_000))
      : undefined,
    lossReason: isClosed && !converted ? ctx.pick(SEED_LOSS_REASONS).name : undefined,
    lossNotes:
      isClosed && !converted
        ? "Cliente confirmou desistência ou comprou em outro fornecedor."
        : undefined,
    convertedToCustomerId: converted ? input.customerIdForConversion : undefined,
    conversations: [],
    tags: pickTags(ctx),
    createdAt,
    updatedAt,
  };
}

function pickTags(ctx: ISeededContext): string[] {
  const n = ctx.int(0, 2);
  const out = new Set<string>();
  while (out.size < n) out.add(ctx.pick(TAG_LABELS));
  return Array.from(out);
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}
