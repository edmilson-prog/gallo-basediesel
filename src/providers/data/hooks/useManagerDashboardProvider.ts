import type { IManagerDashboardProvider } from "../contracts/managerDashboard";
import { useDataProviderSlice } from "./_useDataProviderSlice";

export function useManagerDashboardProvider(): IManagerDashboardProvider {
  return useDataProviderSlice("managerDashboard", "useManagerDashboardProvider");
}
