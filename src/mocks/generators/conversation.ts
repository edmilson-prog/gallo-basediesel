import type { ConversationStatus, IConversation, ICustomer, ILead, ID } from "@/shared/types";
import { SEED_STORE_ID, SEED_TAGS } from "../data";
import { daysAgo, pickWeighted, randomISO, type ISeededContext } from "./utils";

const TAG_LABELS = SEED_TAGS.map((t) => t.label);

interface IGenerateConversationInput {
  sequence: number;
  participant: { kind: "customer"; entity: ICustomer } | { kind: "lead"; entity: ILead };
  sellerIds: ID[];
  whatsappAccountIds: ID[];
  now?: Date;
}

export function generateConversation(
  ctx: ISeededContext,
  input: IGenerateConversationInput,
): IConversation {
  const id: ID = `conv-${String(input.sequence + 1).padStart(4, "0")}`;
  const now = input.now ?? new Date();
  const channel = pickWeighted(ctx, [
    { value: "whatsapp" as const, weight: 7 },
    { value: "ecommerce" as const, weight: 1 },
    { value: "phone" as const, weight: 1 },
    { value: "site" as const, weight: 1 },
  ]);
  const isSdrActive = ctx.bool(0.25);
  const assignedSellerId = isSdrActive
    ? undefined
    : input.participant.kind === "customer"
      ? (input.participant.entity.sellerId ?? undefined)
      : ctx.pick(input.sellerIds);
  // Invariant (spec 2026-07-02): unowned open conversation = 'aguardando';
  // owned = attended statuses; SDR-driven = em_andamento without an owner.
  const status: ConversationStatus = isSdrActive
    ? "em_andamento"
    : assignedSellerId === undefined
      ? pickWeighted(ctx, [
          { value: "aguardando" as const, weight: 8 },
          { value: "arquivada" as const, weight: 2 },
        ])
      : pickWeighted(ctx, [
          { value: "em_andamento" as const, weight: 5 },
          { value: "aguardando_cliente" as const, weight: 3 },
          { value: "resolvida" as const, weight: 3 },
          { value: "arquivada" as const, weight: 1 },
        ]);
  // Anchor the conversation start at the most recent of the entity's birth and
  // the 30-day window. Clamp to `now` defensively so a participant with a
  // future-dated `createdAt` (shouldn't happen but possible in seeds) doesn't
  // make `start > end`.
  const windowStart = daysAgo(30, now);
  const entityCreatedAt = new Date(input.participant.entity.createdAt);
  const lowerBound = entityCreatedAt > windowStart ? entityCreatedAt : windowStart;
  const safeLowerBound = lowerBound > now ? now : lowerBound;
  const createdAt = randomISO(ctx, safeLowerBound, now);
  const lastMessageAt = randomISO(ctx, new Date(createdAt), now);

  return {
    id,
    storeId: SEED_STORE_ID,
    customerId: input.participant.kind === "customer" ? input.participant.entity.id : undefined,
    leadId: input.participant.kind === "lead" ? input.participant.entity.id : undefined,
    assignedSellerId,
    channel,
    whatsappAccountId: channel === "whatsapp" ? ctx.pick(input.whatsappAccountIds) : undefined,
    status,
    isSdrActive,
    tags: pickTags(ctx),
    lastMessageAt,
    unreadCount: status === "aguardando" ? ctx.int(1, 4) : 0,
    createdAt,
  };
}

function pickTags(ctx: ISeededContext): string[] {
  const n = ctx.int(0, 2);
  const out = new Set<string>();
  while (out.size < n) out.add(ctx.pick(TAG_LABELS));
  return Array.from(out);
}
