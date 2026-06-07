import { NotImplementedError } from "../../errors";
import type { IAssetLibraryProvider } from "../../contracts/assetLibrary";

const stub = (method: string) => () => {
  throw new NotImplementedError(
    `SupabaseAssetLibraryProvider.${method} — implementar na Fase 2 (PRD-027 RNF-007).`,
  );
};

export const supabaseAssetLibraryProvider: IAssetLibraryProvider = {
  list: stub("list"),
  get: stub("get"),
  search: stub("search"),
  getRecent: stub("getRecent"),
  getFavorites: stub("getFavorites"),
  toggleFavorite: stub("toggleFavorite"),
  create: stub("create"),
  update: stub("update"),
  publish: stub("publish"),
  unpublish: stub("unpublish"),
  bumpVersion: stub("bumpVersion"),
  delete: stub("delete"),
  listCombos: stub("listCombos"),
  saveCombo: stub("saveCombo"),
  deleteCombo: stub("deleteCombo"),
  recordSend: stub("recordSend"),
  getUsageStats: stub("getUsageStats"),
};
