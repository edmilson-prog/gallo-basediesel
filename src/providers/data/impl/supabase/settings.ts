import { NotImplementedError } from "../../errors";
import type { ISettingsProvider } from "../../contracts/settings";

const stub = (method: string) => () => {
  throw new NotImplementedError(
    `SupabaseSettingsProvider.${method} — implementar no PRD-105+ (configurações de loja via Supabase).`,
  );
};

export const supabaseSettingsProvider: ISettingsProvider = {
  get: stub("get"),
  update: stub("update"),
};
