import type { ID } from "@/shared/types";
import type { IConversationPin, IConversationPinsProvider } from "../../contracts/conversationPins";
import { logMockMutation } from "./_audit";

/**
 * In-memory mock of {@link IConversationPinsProvider}. Pins start empty and live
 * only for the session (reset on reload) — acceptable for the demo data source;
 * the supabase impl is the real persistence.
 */
const PINS: IConversationPin[] = [];

export const mockConversationPinsProvider: IConversationPinsProvider = {
  list: async (sellerId) =>
    PINS.filter((p) => p.sellerId === sellerId).sort((a, b) =>
      b.createdAt.localeCompare(a.createdAt),
    ),

  pin: async ({ conversationId, sellerId, storeId }) => {
    const existing = PINS.find(
      (p) => p.conversationId === conversationId && p.sellerId === sellerId,
    );
    if (existing) return existing;
    const pin: IConversationPin = {
      conversationId,
      sellerId,
      storeId,
      createdAt: new Date().toISOString(),
    };
    PINS.push(pin);
    logMockMutation({
      action: "create",
      resource: "conversation_pin",
      resourceId: conversationId,
      after: pin,
      storeId,
    });
    return pin;
  },

  unpin: async (conversationId: ID, sellerId: ID) => {
    const idx = PINS.findIndex(
      (p) => p.conversationId === conversationId && p.sellerId === sellerId,
    );
    if (idx < 0) return;
    const [removed] = PINS.splice(idx, 1);
    logMockMutation({
      action: "delete",
      resource: "conversation_pin",
      resourceId: conversationId,
      storeId: removed?.storeId,
    });
  },
};
