import { NotImplementedError } from "../../errors";
import type { ISdrSessionsProvider } from "../../contracts/sdrSessions";

const stub = (method: string) => () => {
  throw new NotImplementedError(
    `SupabaseSdrSessionsProvider.${method} — implementar na Fase 2 (sessões SDR como tabela + Edge Function).`,
  );
};

export const supabaseSdrSessionsProvider: ISdrSessionsProvider = {
  list: stub("list"),
  listActive: stub("listActive"),
  getByConversation: stub("getByConversation"),
  upsert: stub("upsert"),
  patch: stub("patch"),
  pause: stub("pause"),
  resume: stub("resume"),
};
