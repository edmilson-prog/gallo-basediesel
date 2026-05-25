import { auditsApi } from "@/mocks";
import type { IAuditsProvider } from "../../contracts/audits";

export const mockAuditsProvider: IAuditsProvider = {
  list: (params) => auditsApi.list(params),
  create: (input) => auditsApi.create(input),
};
