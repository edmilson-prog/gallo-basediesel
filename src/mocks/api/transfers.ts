import type { CarteiraTransferType, ICarteiraTransfer, ID } from "@/shared/types";
import { selectAllTransfers } from "../store/selectors";
import { useMockStore } from "../store/mockStore";
import {
  MockValidationError,
  paginate,
  runApi,
  type IPaginatedResult,
  type IPaginationParams,
} from "./utils";

export interface IListTransfersParams extends IPaginationParams {
  storeId?: ID;
  fromSellerId?: ID;
  toSellerId?: ID;
  status?: ICarteiraTransfer["status"];
  statuses?: ICarteiraTransfer["status"][];
  types?: CarteiraTransferType[];
  since?: string;
  until?: string;
}

export interface ICreateTransferApiInput {
  storeId: ID;
  type: CarteiraTransferType;
  fromSellerId: ID;
  toSellerId: ID;
  customerIds: ID[];
  reason: string;
  startDate?: string;
  endDate?: string;
  createdBy: ID;
}

function pushTransfer(transfer: ICarteiraTransfer): void {
  useMockStore.setState((state) => ({ transfers: [...state.transfers, transfer] }));
}

function reassignCustomers(customerIds: ID[], toSellerId: ID): void {
  if (customerIds.length === 0) return;
  const ids = new Set(customerIds);
  useMockStore.setState((state) => ({
    customers: state.customers.map((c) => (ids.has(c.id) ? { ...c, sellerId: toSellerId } : c)),
  }));
}

function patchTransferStatus(
  transferId: ID,
  status: ICarteiraTransfer["status"],
): ICarteiraTransfer | undefined {
  let result: ICarteiraTransfer | undefined;
  useMockStore.setState((state) => ({
    transfers: state.transfers.map((t) => {
      if (t.id !== transferId) return t;
      result = { ...t, status };
      return result;
    }),
  }));
  return result;
}

export const transfersApi = {
  list(params: IListTransfersParams = {}): Promise<IPaginatedResult<ICarteiraTransfer>> {
    return runApi(
      "transfersApi",
      "list",
      () => {
        let all = selectAllTransfers();
        if (params.storeId) all = all.filter((t) => t.storeId === params.storeId);
        if (params.fromSellerId) all = all.filter((t) => t.fromSellerId === params.fromSellerId);
        if (params.toSellerId) all = all.filter((t) => t.toSellerId === params.toSellerId);
        if (params.status) all = all.filter((t) => t.status === params.status);
        if (params.statuses?.length) all = all.filter((t) => params.statuses!.includes(t.status));
        if (params.types?.length) all = all.filter((t) => params.types!.includes(t.type));
        if (params.since) all = all.filter((t) => t.startDate >= params.since!);
        if (params.until) all = all.filter((t) => t.startDate <= params.until!);
        const sorted = [...all].sort((a, b) => b.startDate.localeCompare(a.startDate));
        return paginate(sorted, params);
      },
      { payload: params },
    );
  },

  async create(input: ICreateTransferApiInput): Promise<ICarteiraTransfer> {
    return runApi(
      "transfersApi",
      "create",
      () => {
        if (input.customerIds.length === 0) {
          throw new MockValidationError("customerIds is required", "customerIds");
        }
        if (input.fromSellerId === input.toSellerId) {
          throw new MockValidationError(
            "fromSellerId must be different from toSellerId",
            "toSellerId",
          );
        }
        if (input.type === "temporary" && !input.endDate) {
          throw new MockValidationError("endDate is required for temporary transfers", "endDate");
        }
        if (input.type === "temporary" && input.endDate && input.startDate) {
          if (new Date(input.endDate).getTime() <= new Date(input.startDate).getTime()) {
            throw new MockValidationError("endDate must be after startDate", "endDate");
          }
        }
        const now = new Date().toISOString();
        const transfer: ICarteiraTransfer = {
          id: `transfer-${crypto.randomUUID()}`,
          storeId: input.storeId,
          type: input.type,
          fromSellerId: input.fromSellerId,
          toSellerId: input.toSellerId,
          customerIds: [...input.customerIds],
          reason: input.reason,
          startDate: input.startDate ?? now,
          endDate: input.endDate,
          autoRevertAt: input.type === "temporary" ? input.endDate : undefined,
          status: "active",
          createdBy: input.createdBy,
          createdAt: now,
        };
        pushTransfer(transfer);
        // Em todos os tipos, customers passam para o seller destino durante a vigência.
        // Reversão (manual ou via timer) reverte o sellerId.
        reassignCustomers(input.customerIds, input.toSellerId);
        return transfer;
      },
      { payload: input },
    );
  },

  async revert(transferId: ID): Promise<ICarteiraTransfer> {
    return runApi(
      "transfersApi",
      "revert",
      () => {
        const all = selectAllTransfers();
        const target = all.find((t) => t.id === transferId);
        if (!target) {
          throw new MockValidationError(`Transfer ${transferId} not found`, "transferId");
        }
        if (target.status !== "active") {
          throw new MockValidationError("Only active transfers can be reverted", "status");
        }
        reassignCustomers(target.customerIds, target.fromSellerId);
        const updated = patchTransferStatus(transferId, "reverted");
        return updated ?? { ...target, status: "reverted" };
      },
      { payload: { transferId } },
    );
  },

  async expire(transferId: ID): Promise<ICarteiraTransfer> {
    return runApi(
      "transfersApi",
      "expire",
      () => {
        const all = selectAllTransfers();
        const target = all.find((t) => t.id === transferId);
        if (!target) {
          throw new MockValidationError(`Transfer ${transferId} not found`, "transferId");
        }
        if (target.status !== "active") {
          throw new MockValidationError("Only active transfers can be expired", "status");
        }
        // Auto-revert: customers voltam ao seller origem
        reassignCustomers(target.customerIds, target.fromSellerId);
        const updated = patchTransferStatus(transferId, "expired");
        return updated ?? { ...target, status: "expired" };
      },
      { payload: { transferId } },
    );
  },
};
