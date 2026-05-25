import { NotImplementedError } from "../../errors";
import type { IStoresProvider } from "../../contracts/stores";

const stub = (method: string) => () => {
  throw new NotImplementedError(
    `SupabaseStoresProvider.${method} — implementar no PRD-105+ (multi-loja via Supabase).`,
  );
};

export const supabaseStoresProvider: IStoresProvider = {
  list: stub("list"),
  get: stub("get"),
};
