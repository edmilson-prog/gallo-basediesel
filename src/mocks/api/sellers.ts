import type { ID, ISeller } from "@/shared/types";
import { selectAllSellers, selectSellerById } from "../store/selectors";
import { useMockStore } from "../store/mockStore";
import { patchById, upsert } from "../store/mutations";
import { MockNotFoundError, MockValidationError, runApi } from "./utils";

export interface IListSellersParams {
  storeId?: ID;
  active?: boolean;
}

export interface ICreateSellerInput {
  storeId: ID;
  fullName: string;
  email: string;
  phone?: string;
  type: ISeller["type"];
  region?: string;
  attendantName?: string;
}

export const sellersApi = {
  list(params: IListSellersParams = {}): Promise<ISeller[]> {
    return runApi(
      "sellersApi",
      "list",
      () => {
        let all = selectAllSellers();
        all = all.filter((s) => !s.deletedAt);
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

  async create(input: ICreateSellerInput): Promise<ISeller> {
    return runApi(
      "sellersApi",
      "create",
      () => {
        if (!input.fullName.trim())
          throw new MockValidationError("fullName is required", "fullName");
        if (!input.email.trim()) throw new MockValidationError("email is required", "email");
        const created: ISeller = {
          id: `seller-${crypto.randomUUID()}`,
          storeId: input.storeId,
          fullName: input.fullName.trim(),
          email: input.email.trim().toLowerCase(),
          phone: input.phone?.trim() || undefined,
          type: input.type,
          region: input.region?.trim() || undefined,
          attendantName: input.attendantName?.trim() || undefined,
          availability: "offline",
          divisions: ["parts"],
          active: true,
          createdAt: new Date().toISOString(),
        };
        upsert("sellers", created);
        return created;
      },
      { payload: input },
    );
  },

  async remove(id: ID): Promise<void> {
    return runApi(
      "sellersApi",
      "remove",
      () => {
        const patched = patchById("sellers", id, {
          deletedAt: new Date().toISOString(),
          active: false,
        });
        if (!patched) throw new MockNotFoundError("seller", id);
      },
      { payload: { id } },
    );
  },
};
