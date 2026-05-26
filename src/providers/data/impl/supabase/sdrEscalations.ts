import { NotImplementedError } from "../../errors";
import type { ISdrEscalationsProvider } from "../../contracts/sdrEscalations";

const stub = (method: string) => () => {
  throw new NotImplementedError(
    `SupabaseSdrEscalationsProvider.${method} — implementar na Fase 2 (escalações SDR como tabela com FK pra sdr_sessions).`,
  );
};

export const supabaseSdrEscalationsProvider: ISdrEscalationsProvider = {
  list: stub("list"),
  getById: stub("getById"),
  getByConversation: stub("getByConversation"),
  create: stub("create"),
  patch: stub("patch"),
};
