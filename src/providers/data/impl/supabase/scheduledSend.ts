import { NotImplementedError } from "../../errors";
import type { IScheduledSendProvider } from "../../contracts/scheduledSend";

const stub = (method: string) => () => {
  throw new NotImplementedError(
    `SupabaseScheduledSendProvider.${method} — implementar na Fase 2 (PRD-027 RNF-007).`,
  );
};

export const supabaseScheduledSendProvider: IScheduledSendProvider = {
  list: stub("list"),
  listDue: stub("listDue"),
  create: stub("create"),
  update: stub("update"),
  cancel: stub("cancel"),
  markSent: stub("markSent"),
  markFailed: stub("markFailed"),
};
