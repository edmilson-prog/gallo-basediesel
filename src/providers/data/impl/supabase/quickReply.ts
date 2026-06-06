import { NotImplementedError } from "../../errors";
import type { IQuickReplyProvider } from "../../contracts/quickReply";

const stub = (method: string) => () => {
  throw new NotImplementedError(
    `SupabaseQuickReplyProvider.${method} — implementar na Fase 2 (PRD-027 RNF-007).`,
  );
};

export const supabaseQuickReplyProvider: IQuickReplyProvider = {
  list: stub("list"),
  get: stub("get"),
  findByShortcut: stub("findByShortcut"),
  create: stub("create"),
  update: stub("update"),
  delete: stub("delete"),
};
