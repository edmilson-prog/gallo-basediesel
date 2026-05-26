import { NotImplementedError } from "../../errors";
import type { IManagerDashboardProvider } from "../../contracts/managerDashboard";

const stub = (method: string) => () => {
  throw new NotImplementedError(
    `SupabaseManagerDashboardProvider.${method} — implementar no PRD-100+ (BI / materialized views).`,
  );
};

export const supabaseManagerDashboardProvider: IManagerDashboardProvider = {
  snapshot: stub("snapshot"),
};
