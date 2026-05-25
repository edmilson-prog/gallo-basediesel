import { NotImplementedError } from "../../errors";
import type { ISegmentsProvider } from "../../contracts/segments";

const stub = (method: string) => () => {
  throw new NotImplementedError(
    `SupabaseSegmentsProvider.${method} — implementar no PRD-110+ (segmentos salvos via Supabase).`,
  );
};

export const supabaseSegmentsProvider: ISegmentsProvider = {
  list: stub("list"),
};
