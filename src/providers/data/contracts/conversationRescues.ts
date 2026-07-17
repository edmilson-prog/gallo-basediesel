import type { ID, IConversationRescue } from "@/shared/types";

/**
 * Contract for the offline-rescue broadcast queue (spec 2026-07-17). Only
 * `broadcasting` rows are ever returned by `list()` — resolved/cancelled
 * rows are audit trail, not something the client needs to poll.
 */
export interface IConversationRescuesProvider {
  list(): Promise<IConversationRescue[]>;
  claim(rescueId: ID): Promise<IConversationRescue>;
}
