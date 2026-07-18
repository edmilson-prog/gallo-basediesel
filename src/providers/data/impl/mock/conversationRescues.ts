import type { IConversationRescuesProvider } from "../../contracts/conversationRescues";

/**
 * Mock impl (spec 2026-07-17, "Fora de escopo"): there is no `pg_cron` tick in
 * Demonstração mode, so no rescue ever gets created organically. `list()`
 * always returns empty; `claim()` is unreachable from the UI (the broadcast
 * panel never renders without entries) but still throws a clear error if
 * ever called directly, instead of silently no-op'ing.
 */
export const mockConversationRescuesProvider: IConversationRescuesProvider = {
  async list() {
    return [];
  },
  async claim(rescueId) {
    throw new Error(
      `[mock] claim(${rescueId}) failed: no rescue broadcasts exist in Demonstração mode.`,
    );
  },
};
