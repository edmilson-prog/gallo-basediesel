import { managerDashboardApi } from "@/mocks";
import type {
  IManagerDashboardProvider,
  IManagerDashboardSnapshot,
  IManagerDashboardSnapshotParams,
} from "../../contracts/managerDashboard";

export const mockManagerDashboardProvider: IManagerDashboardProvider = {
  snapshot: (params: IManagerDashboardSnapshotParams): Promise<IManagerDashboardSnapshot> =>
    managerDashboardApi.snapshot(params),
};
