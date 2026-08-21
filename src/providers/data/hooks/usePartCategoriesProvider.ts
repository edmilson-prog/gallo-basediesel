import type { IPartCategoriesProvider } from "../contracts/partCategories";
import { useDataProviderSlice } from "./_useDataProviderSlice";

export function usePartCategoriesProvider(): IPartCategoriesProvider {
  return useDataProviderSlice("partCategories", "usePartCategoriesProvider");
}
