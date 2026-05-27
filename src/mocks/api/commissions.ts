import type {
  CommissionStatus,
  ICommission,
  ID,
} from "@/shared/types";
import { selectAllCommissions, selectStoreById } from "../store/selectors";
import { patchById, upsert } from "../store/mutations";
import { useMockStore } from "../store/mockStore";
import {
  MockNotFoundError,
  MockValidationError,
  paginate,
  runApi,
  type IPaginatedResult,
  type IPaginationParams,
} from "./utils";

export interface IListCommissionsParams extends IPaginationParams {
  storeId?: ID;
  sellerId?: ID;
  sellerIds?: ID[];
  status?: CommissionStatus;
  statuses?: CommissionStatus[];
  period?: string;
}

let createdSeq = 0;

function nextId(): ID {
  createdSeq += 1;
  return `comm-rt-${String(Date.now()).slice(-6)}-${createdSeq}`;
}

export const commissionsApi = {
  list(params: IListCommissionsParams = {}): Promise<IPaginatedResult<ICommission>> {
    return runApi(
      "commissionsApi",
      "list",
      () => {
        let all = selectAllCommissions();
        if (params.storeId) all = all.filter((c) => c.storeId === params.storeId);
        if (params.sellerId) all = all.filter((c) => c.sellerId === params.sellerId);
        if (params.sellerIds && params.sellerIds.length > 0) {
          const set = new Set(params.sellerIds);
          all = all.filter((c) => set.has(c.sellerId));
        }
        if (params.status) all = all.filter((c) => c.status === params.status);
        if (params.statuses && params.statuses.length > 0) {
          const set = new Set(params.statuses);
          all = all.filter((c) => set.has(c.status));
        }
        if (params.period) all = all.filter((c) => c.period === params.period);
        const sorted = [...all].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
        return paginate(sorted, params);
      },
      { payload: params },
    );
  },

  async create(input: Omit<ICommission, "id" | "createdAt">): Promise<ICommission> {
    return runApi("commissionsApi", "create", () => {
      const id = nextId();
      const createdAt = new Date().toISOString();
      const next: ICommission = { ...input, id, createdAt };
      upsert("commissions", next);
      return next;
    });
  },

  async update(id: ID, patch: Partial<ICommission>): Promise<ICommission> {
    return runApi("commissionsApi", "update", () => {
      const current = selectAllCommissions().find((c) => c.id === id);
      if (current && current.closedInPeriod && patch.status && patch.status !== current.status) {
        const transitioningOutOfClosed =
          current.status === "approved" && patch.status === "paid";
        if (!transitioningOutOfClosed && patch.status !== "disputed") {
          throw new MockValidationError(
            `commission ${id} is in closed period ${current.closedInPeriod} and cannot be mutated`,
          );
        }
      }
      const updated = patchById("commissions", id, patch);
      if (!updated) throw new MockNotFoundError("commission", id);
      return updated;
    });
  },

  async closeMonthlyPeriod(input: {
    storeId: ID;
    period: string;
    approvedBy: ID;
  }): Promise<ICommission[]> {
    return runApi("commissionsApi", "closeMonthlyPeriod", () => {
      const all = selectAllCommissions().filter(
        (c) => c.storeId === input.storeId && c.period === input.period && c.status === "calculated",
      );
      const now = new Date().toISOString();
      const updated: ICommission[] = [];
      for (const c of all) {
        const next = patchById("commissions", c.id, {
          status: "approved" as CommissionStatus,
          approvedAt: now,
          approvedBy: input.approvedBy,
          closedInPeriod: input.period,
        });
        if (next) updated.push(next);
      }
      const store = selectStoreById(input.storeId);
      if (store) {
        const closed = store.settings.commissionSettings.closedPeriods ?? [];
        if (!closed.includes(input.period)) {
          useMockStore.setState((state) => ({
            stores: state.stores.map((s) =>
              s.id !== input.storeId
                ? s
                : {
                    ...s,
                    settings: {
                      ...s.settings,
                      commissionSettings: {
                        ...s.settings.commissionSettings,
                        closedPeriods: [...closed, input.period],
                      },
                    },
                  },
            ),
          }));
        }
      }
      return updated;
    });
  },

  async openDispute(input: {
    commissionId: ID;
    reason: string;
    actorId: ID;
  }): Promise<ICommission> {
    return runApi("commissionsApi", "openDispute", () => {
      const updated = patchById("commissions", input.commissionId, {
        status: "disputed" as CommissionStatus,
        disputeReason: input.reason,
        disputedAt: new Date().toISOString(),
      });
      if (!updated) throw new MockNotFoundError("commission", input.commissionId);
      return updated;
    });
  },

  async resolveDispute(input: {
    commissionId: ID;
    resolution: string;
    actorId: ID;
    finalStatus: Extract<CommissionStatus, "approved" | "canceled">;
  }): Promise<ICommission> {
    return runApi("commissionsApi", "resolveDispute", () => {
      const now = new Date().toISOString();
      const updated = patchById("commissions", input.commissionId, {
        status: input.finalStatus,
        disputeResolution: input.resolution,
        disputeResolvedBy: input.actorId,
        disputeResolvedAt: now,
        approvedAt: input.finalStatus === "approved" ? now : undefined,
        approvedBy: input.finalStatus === "approved" ? input.actorId : undefined,
      });
      if (!updated) throw new MockNotFoundError("commission", input.commissionId);
      return updated;
    });
  },

  async registerPayment(input: {
    commissionId: ID;
    paidBy: ID;
    paidAt?: string;
  }): Promise<ICommission> {
    return runApi("commissionsApi", "registerPayment", () => {
      const target = selectAllCommissions().find((c) => c.id === input.commissionId);
      if (!target) throw new MockNotFoundError("commission", input.commissionId);
      if (target.status !== "approved") {
        throw new MockValidationError(
          `commission ${input.commissionId} must be approved before payment can be registered`,
        );
      }
      const updated = patchById("commissions", input.commissionId, {
        status: "paid" as CommissionStatus,
        paidAt: input.paidAt ?? new Date().toISOString(),
        paidBy: input.paidBy,
      });
      if (!updated) throw new MockNotFoundError("commission", input.commissionId);
      return updated;
    });
  },
};
