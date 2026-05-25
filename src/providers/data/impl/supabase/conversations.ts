import { NotImplementedError } from "../../errors";
import type { IConversationsProvider } from "../../contracts/conversations";

const stub = (method: string) => () => {
  throw new NotImplementedError(
    `SupabaseConversationsProvider.${method} — implementar no PRD-100+ (WhatsApp/multichannel).`,
  );
};

export const supabaseConversationsProvider: IConversationsProvider = {
  list: stub("list"),
  get: stub("get"),
  update: stub("update"),
  markRead: stub("markRead"),
  assignSeller: stub("assignSeller"),
  archive: stub("archive"),
};
