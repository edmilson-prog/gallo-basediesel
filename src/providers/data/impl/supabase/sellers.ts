import { NotImplementedError } from "../../errors";
import type { ISellersProvider } from "../../contracts/sellers";

const stub = (method: string) => () => {
  throw new NotImplementedError(
    `SupabaseSellersProvider.${method} — implementar no PRD-105+ (vendedores via Supabase Auth + RLS).`,
  );
};

export const supabaseSellersProvider: ISellersProvider = {
  list: stub("list"),
  get: stub("get"),
  setAvailability: stub("setAvailability"),
};
