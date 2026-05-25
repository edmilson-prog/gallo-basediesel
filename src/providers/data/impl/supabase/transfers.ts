import { NotImplementedError } from "../../errors";
import type { ITransfersProvider } from "../../contracts/transfers";

const stub = (method: string) => () => {
  throw new NotImplementedError(
    `SupabaseTransfersProvider.${method} — implementar no PRD-120+ (transferências de carteira via Supabase).`,
  );
};

export const supabaseTransfersProvider: ITransfersProvider = {
  list: stub("list"),
};
