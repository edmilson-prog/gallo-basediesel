import type { IRolesProvider } from "../contracts/roles";
import { useDataProviderSlice } from "./_useDataProviderSlice";

export function useRolesProvider(): IRolesProvider {
  return useDataProviderSlice("roles", "useRolesProvider");
}
