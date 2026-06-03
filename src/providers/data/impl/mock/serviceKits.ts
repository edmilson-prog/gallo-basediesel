import { serviceKitsApi } from "@/mocks";
import type { IServiceKitsProvider } from "../../contracts/serviceKits";

export const mockServiceKitsProvider: IServiceKitsProvider = {
  list: (params) => serviceKitsApi.list(params),
};
