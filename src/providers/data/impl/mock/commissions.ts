import { commissionsApi } from "@/mocks";
import type { ICommissionsProvider } from "../../contracts/commissions";
import { logMockMutation } from "./_audit";
import { scopedListParams } from "./_storeScope";

export const mockCommissionsProvider: ICommissionsProvider = {
  list: (params) => commissionsApi.list(scopedListParams(params, "commission")),
  create: async (input) => {
    const created = await commissionsApi.create(input);
    logMockMutation({
      action: "create",
      resource: "commission",
      resourceId: created.id,
      after: created,
      storeId: created.storeId,
    });
    return created;
  },
  update: async (id, patch) => {
    const updated = await commissionsApi.update(id, patch);
    const isApproval = patch && "status" in patch && patch.status === "approved";
    const isPayment = patch && "status" in patch && patch.status === "paid";
    let action = "update";
    if (isApproval) action = "approve";
    else if (isPayment) action = "pay";
    logMockMutation({
      action,
      resource: "commission",
      resourceId: updated.id,
      after: updated,
      storeId: updated.storeId,
    });
    return updated;
  },
  closeMonthlyPeriod: async (input) => {
    const updated = await commissionsApi.closeMonthlyPeriod(input);
    logMockMutation({
      action: "close_period",
      resource: "commission",
      resourceId: input.storeId,
      after: { period: input.period, count: updated.length },
      storeId: input.storeId,
    });
    return updated;
  },
  openDispute: async (input) => {
    const updated = await commissionsApi.openDispute(input);
    logMockMutation({
      action: "dispute_open",
      resource: "commission",
      resourceId: updated.id,
      after: { reason: input.reason },
      storeId: updated.storeId,
    });
    return updated;
  },
  resolveDispute: async (input) => {
    const updated = await commissionsApi.resolveDispute(input);
    logMockMutation({
      action: "dispute_resolve",
      resource: "commission",
      resourceId: updated.id,
      after: { resolution: input.resolution, finalStatus: input.finalStatus },
      storeId: updated.storeId,
    });
    return updated;
  },
  registerPayment: async (input) => {
    const updated = await commissionsApi.registerPayment(input);
    logMockMutation({
      action: "pay",
      resource: "commission",
      resourceId: updated.id,
      after: { paidAt: updated.paidAt, paidBy: updated.paidBy },
      storeId: updated.storeId,
    });
    return updated;
  },
};
