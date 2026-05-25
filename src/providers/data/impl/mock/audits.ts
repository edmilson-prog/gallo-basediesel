import { auditsApi } from "@/mocks";
import type { IAuditsProvider } from "../../contracts/audits";
import { scopedListParams } from "./_storeScope";

export const mockAuditsProvider: IAuditsProvider = {
  list: (params) => auditsApi.list(scopedListParams(params, "audit_log")),
  create: (input) => auditsApi.create(input),
};
