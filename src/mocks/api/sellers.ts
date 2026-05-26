import type { ID, ISeller } from "@/shared/types";
import { selectAllSellers, selectSellerById } from "../store/selectors";
import { useMockStore } from "../store/mockStore";
import { MockNotFoundError, runApi } from "./utils";

export interface IListSellersParams {
  storeId?: ID;
  active?: boolean;
}

export const sellersApi = {
  list(params: IListSellersParams = {}): Promise<ISeller[]> {
    return runApi(
      "sellersApi",
      "list",
      () => {
        let all = selectAllSellers();
        if (params.storeId) all = all.filter((s) => s.storeId === params.storeId);
        if (typeof params.active === "boolean") all = all.filter((s) => s.active === params.active);
        return [...all].sort((a, b) => a.fullName.localeCompare(b.fullName, "pt-BR"));
      },
      { payload: params },
    );
  },

  async get(id: ID): Promise<ISeller> {
    return runApi("sellersApi", "get", () => {
      const found = selectSellerById(id);
      if (!found) throw new MockNotFoundError("seller", id);
      return found;
    });
  },

  async setAvailability(id: ID, availability: ISeller["availability"]): Promise<ISeller> {
    return runApi(
      "sellersApi",
      "setAvailability",
      () => {
        let updated: ISeller | null = null;
        useMockStore.setState((state) => {
          const sellers = state.sellers.map((s) => {
            if (s.id !== id) return s;
            updated = { ...s, availability };
            return updated;
          });
          return { sellers };
        });
        if (!updated) throw new MockNotFoundError("seller", id);
        return updated;
      },
      { payload: { id, availability } },
    );
  },

  async update(id: ID, patch: Partial<ISeller>): Promise<ISeller> {
    return runApi(
      "sellersApi",
      "update",
      () => {
        let updated: ISeller | null = null;
        useMockStore.setState((state) => {
          const sellers = state.sellers.map((s) => {
            if (s.id !== id) return s;
            updated = { ...s, ...patch, id: s.id, storeId: s.storeId } as ISeller;
            return updated;
          });
          return { sellers };
        });
        if (!updated) throw new MockNotFoundError("seller", id);
        return updated;
      },
      { payload: { id, patch } },
    );
  },
};
