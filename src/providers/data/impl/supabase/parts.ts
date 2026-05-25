import { NotImplementedError } from "../../errors";
import type { IPartsProvider } from "../../contracts/parts";

const stub = (method: string) => () => {
  throw new NotImplementedError(
    `SupabasePartsProvider.${method} — implementar no PRD-110+ (catálogo de peças via Supabase/DINTEC).`,
  );
};

export const supabasePartsProvider: IPartsProvider = {
  list: stub("list"),
  get: stub("get"),
  findByOem: stub("findByOem"),
  listEquivalents: stub("listEquivalents"),
  create: stub("create"),
  update: stub("update"),
  delete: stub("delete"),
};
