import { NotImplementedError } from "../../errors";
import type { IRecommendationsProvider } from "../../contracts/recommendations";

const stub = (method: string) => () => {
  throw new NotImplementedError(
    `SupabaseRecommendationsProvider.${method} — implementar no PRD-150+ (recomendações IA via Supabase + worker).`,
  );
};

export const supabaseRecommendationsProvider: IRecommendationsProvider = {
  list: stub("list"),
  resolve: stub("resolve"),
};
