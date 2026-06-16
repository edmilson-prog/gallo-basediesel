import type { IDepartmentsProvider } from "../contracts/departments";
import { useDataProviderSlice } from "./_useDataProviderSlice";

export function useDepartmentsProvider(): IDepartmentsProvider {
  return useDataProviderSlice("departments", "useDepartmentsProvider");
}
