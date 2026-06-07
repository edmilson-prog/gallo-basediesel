import { NotImplementedError } from "../../errors";
import type { ITrackableLinkProvider } from "../../contracts/trackableLink";

const stub = (method: string) => () => {
  throw new NotImplementedError(
    `SupabaseTrackableLinkProvider.${method} — implementar na Fase 2 (PRD-027 RNF-007).`,
  );
};

export const supabaseTrackableLinkProvider: ITrackableLinkProvider = {
  create: stub("create"),
  get: stub("get"),
  listByConversation: stub("listByConversation"),
  registerOpen: stub("registerOpen"),
};
