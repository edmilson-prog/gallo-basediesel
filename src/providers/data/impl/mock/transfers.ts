import { transfersApi } from "@/mocks";
import type { ITransfersProvider } from "../../contracts/transfers";
import { logMockMutation } from "./_audit";
import { scopedListParams } from "./_storeScope";

export const mockTransfersProvider: ITransfersProvider = {
  list: (params) => transfersApi.list(scopedListParams(params, "transfer")),
  create: async (input) => {
    const created = await transfersApi.create(input);
    logMockMutation({
      action: "transfer.create",
      resource: "transfer",
      resourceId: created.id,
      after: {
        type: created.type,
        fromSellerId: created.fromSellerId,
        toSellerId: created.toSellerId,
        customerCount: created.customerIds.length,
        reason: created.reason,
        endDate: created.endDate,
        autoRevertAt: created.autoRevertAt,
      },
      storeId: created.storeId,
    });
    return created;
  },
  revert: async (transferId) => {
    const updated = await transfersApi.revert(transferId);
    logMockMutation({
      action: "transfer.revert",
      resource: "transfer",
      resourceId: updated.id,
      before: { status: "active" },
      after: {
        status: "reverted",
        fromSellerId: updated.fromSellerId,
        toSellerId: updated.toSellerId,
        customerCount: updated.customerIds.length,
      },
      storeId: updated.storeId,
    });
    return updated;
  },
  expire: async (transferId) => {
    const updated = await transfersApi.expire(transferId);
    logMockMutation({
      action: "transfer.expire",
      resource: "transfer",
      resourceId: updated.id,
      before: { status: "active" },
      after: {
        status: "expired",
        fromSellerId: updated.fromSellerId,
        toSellerId: updated.toSellerId,
        customerCount: updated.customerIds.length,
      },
      storeId: updated.storeId,
    });
    return updated;
  },
};
