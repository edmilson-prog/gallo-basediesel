import { commissionsApi } from "@/mocks";
import type { ICommissionsProvider } from "../../contracts/commissions";
import { logMockMutation } from "./_audit";
import { scopedListParams } from "./_storeScope";

export const mockCommissionsProvider: ICommissionsProvider = {
  list: (params) => commissionsApi.list(scopedListParams(params, "commission")),
  update: async (id, patch) => {
    const updated = await commissionsApi.update(id, patch);
    const isApproval =
      patch && "status" in patch && (patch.status === "aprovado" || patch.status === "pago");
    logMockMutation({
      action: isApproval ? "approve" : "update",
      resource: "commission",
      resourceId: updated.id,
      after: updated,
      storeId: updated.storeId,
    });
    return updated;
  },
};
