import { NotImplementedError } from "../../errors";
import type { IMediaStorageProvider } from "../../contracts/mediaStorage";

const stub = (method: string) => () => {
  throw new NotImplementedError(
    `SupabaseMediaProvider.${method} — implementar na Fase 2 (Supabase Storage + tabela media_assets, PRD-026 RNF-007).`,
  );
};

export const supabaseMediaProvider: IMediaStorageProvider = {
  upload: stub("upload"),
  get: stub("get"),
  getSignedUrl: stub("getSignedUrl"),
  delete: stub("delete"),
  list: stub("list"),
  ensureFromMessage: stub("ensureFromMessage"),
  update: stub("update"),
};
