import { NotImplementedError } from "../../errors";
import type { IMessagesProvider } from "../../contracts/messages";

const stub = (method: string) => () => {
  throw new NotImplementedError(
    `SupabaseMessagesProvider.${method} — implementar no PRD-100+ (mensagens via Supabase + provider WhatsApp).`,
  );
};

export const supabaseMessagesProvider: IMessagesProvider = {
  list: stub("list"),
  send: stub("send"),
  markStatus: stub("markStatus"),
  simulateIncoming: stub("simulateIncoming"),
  listForAnalytics: stub("listForAnalytics"),
};
