import { NotImplementedError } from "../../errors";
import type { IGoalsProvider } from "../../contracts/goals";

const stub = (method: string) => () => {
  throw new NotImplementedError(
    `SupabaseGoalsProvider.${method} — implementar no PRD-120+ (metas via Supabase).`,
  );
};

export const supabaseGoalsProvider: IGoalsProvider = {
  list: stub("list"),
  upsert: stub("upsert"),
  update: stub("update"),
};
