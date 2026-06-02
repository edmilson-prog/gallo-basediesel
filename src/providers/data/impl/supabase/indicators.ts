import { NotImplementedError } from "../../errors";
import type { IIndicatorsProvider } from "../../contracts/indicators";

const stub = (method: string) => () => {
  throw new NotImplementedError(
    `SupabaseIndicatorsProvider.${method} — implementar no PRD-120+ (indicadores via Supabase).`,
  );
};

export const supabaseIndicatorsProvider: IIndicatorsProvider = {
  list: stub("list"),
  upsert: stub("upsert"),
  update: stub("update"),
};
