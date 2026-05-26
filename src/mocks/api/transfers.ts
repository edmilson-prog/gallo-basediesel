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
        if (input.type === "temporary" && !input.endDate) {
          throw new MockValidationError("endDate is required for temporary transfers", "endDate");
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
        // Para permanent_* re-atribui o sellerId nos clientes; temporary mantém o vínculo.
        if (input.type !== "temporary") {
          reassignCustomers(input.customerIds, input.toSellerId);
        }
        return transfer;
      },
      { payload: input },
    );
  },
};
