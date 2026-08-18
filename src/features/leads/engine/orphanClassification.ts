/**
 * Pure decision core for the WAHA orphan-contact migration: 5,246 WhatsApp
 * contacts that carry a conversation but no linked lead/customer. Each
 * contact is classified into exactly one bucket so the migration script
 * (Task 4, `scripts/migrate-orphans-to-leads.ts`) can act deterministically
 * instead of a human eyeballing 5k rows.
 *
 * Precedence, checked in this order:
 *   1. `hasCommercialRelation || hasManualData` → "review" — a contact that
 *      already carries commercial history or hand-entered data is never
 *      auto-deleted or auto-classified, no matter its conversation state.
 *   2. No conversation at all → "delete" — nothing worth preserving.
 *   3. A conversation exists but never received a message (`lastMessageAt`
 *      is null) → "lead_dormente" — an empty conversation is dead history,
 *      not an active lead.
 *   4. `lastMessageAt` within `VITALITY_WINDOW_DAYS` of `nowIso` (inclusive
 *      at the boundary) → "lead_ativo"; older than that → "lead_dormente".
 */
export type OrphanClass = "lead_ativo" | "lead_dormente" | "delete" | "review";

export interface IOrphanInput {
  hasConversation: boolean;
  lastMessageAt: string | null; // ISO 8601, max across the contact's conversations
  hasManualData: boolean; // cpf/cnpj/email/note/vehicle recorded by hand
  hasCommercialRelation: boolean; // order/quote/ex-lead — expected false, guarded anyway
}

/** A conversation whose last message falls within this many days of `nowIso` counts as active. */
export const VITALITY_WINDOW_DAYS = 7;

/** Loss reason recorded on leads created by this migration (both lead_ativo and lead_dormente). */
export const IMPORT_LOSS_REASON = "Importado sem interação";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function classifyOrphan(input: IOrphanInput, nowIso: string): OrphanClass {
  if (input.hasCommercialRelation || input.hasManualData) return "review";
  if (!input.hasConversation) return "delete";
  if (input.lastMessageAt === null) return "lead_dormente";

  const now = new Date(nowIso).getTime();
  const lastMessage = new Date(input.lastMessageAt).getTime();
  const windowStart = now - VITALITY_WINDOW_DAYS * MS_PER_DAY;

  return lastMessage >= windowStart ? "lead_ativo" : "lead_dormente";
}
