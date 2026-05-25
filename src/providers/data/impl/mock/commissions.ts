import { commissionsApi } from "@/mocks";
import type { ICommissionsProvider } from "../../contracts/commissions";

export const mockCommissionsProvider: ICommissionsProvider = {
  list: (params) => commissionsApi.list(params),
  update: (id, patch) => commissionsApi.update(id, patch),
};
