import type { ID, IStore } from "@/shared/types";
import type {
  IStoreCreateInput,
  IStoreMemberCounts,
  IStoreUpdateInput,
} from "@/providers/data/contracts/stores";
import { buildDefaultSettings } from "@/providers/data/engine/buildDefaultSettings";
import { selectAllStores } from "../store/selectors";
import { useMockStore } from "../store/mockStore";
import { MockNotFoundError, MockValidationError, runApi } from "./utils";

export const storesApi = {
  list(): Promise<IStore[]> {
    return runApi("storesApi", "list", () => [...selectAllStores()]);
  },

  async get(id: ID): Promise<IStore> {
    return runApi("storesApi", "get", () => {
      const found = selectAllStores().find((s) => s.id === id);
      if (!found) throw new MockNotFoundError("store", id);
      return found;
    });
  },

  create(input: IStoreCreateInput): Promise<IStore> {
    return runApi(
      "storesApi",
      "create",
      () => {
        if (!input.name.trim()) throw new MockValidationError("name is required", "name");
        const id = crypto.randomUUID();
        const created: IStore = {
          id,
          name: input.name.trim(),
          type: input.type,
          address: input.address,
          cnpj: input.cnpj,
          managerId: input.managerId,
          settings: input.settings ?? buildDefaultSettings(id),
          activeDivisions: input.activeDivisions.length ? [...input.activeDivisions] : ["parts"],
          isActive: true,
          createdAt: new Date().toISOString(),
        };
        useMockStore.setState((state) => ({ stores: [...state.stores, created] }));
        return created;
      },
      { payload: input },
    );
  },

  update(id: ID, patch: IStoreUpdateInput): Promise<IStore> {
    return runApi(
      "storesApi",
      "update",
      () => {
        let updated: IStore | null = null;
        useMockStore.setState((state) => {
          const stores = state.stores.map((s) => {
            if (s.id !== id) return s;
            updated = {
              ...s,
              ...(patch.name !== undefined ? { name: patch.name } : {}),
              ...(patch.cnpj !== undefined ? { cnpj: patch.cnpj } : {}),
              ...(patch.address !== undefined ? { address: patch.address } : {}),
              // managerId is explicit-set (mirrors update_store's non-coalesced
              // manager_id) so "Sem gestor" (undefined) clears it in both backends.
              managerId: patch.managerId,
              ...(patch.activeDivisions !== undefined
                ? { activeDivisions: [...patch.activeDivisions] }
                : {}),
            };
            return updated;
          });
          return updated ? { stores } : state;
        });
        const result = updated as IStore | null;
        if (!result) throw new MockNotFoundError("store", id);
        return result;
      },
      { payload: { id, patch } },
    );
  },

  setActive(id: ID, active: boolean): Promise<IStore> {
    return runApi(
      "storesApi",
      "setActive",
      () => {
        const all = selectAllStores();
        const target = all.find((s) => s.id === id);
        if (!target) throw new MockNotFoundError("store", id);
        if (active === false) {
          if (target.type === "matriz") {
            throw new MockValidationError("A matriz não pode ser desativada", "isActive");
          }
          const activeCount = all.filter((s) => s.isActive).length;
          if (activeCount <= 1) {
            throw new MockValidationError(
              "Não é possível desativar a última loja ativa",
              "isActive",
            );
          }
        }
        let updated: IStore | null = null;
        useMockStore.setState((state) => ({
          stores: state.stores.map((s) => {
            if (s.id !== id) return s;
            updated = { ...s, isActive: active };
            return updated;
          }),
        }));
        const result = updated as IStore | null;
        if (!result) throw new MockNotFoundError("store", id);
        return result;
      },
      { payload: { id, active } },
    );
  },

  getMemberCounts(): Promise<IStoreMemberCounts[]> {
    return runApi("storesApi", "getMemberCounts", () => {
      const { sellers, customers } = useMockStore.getState();
      return selectAllStores().map((s) => ({
        storeId: s.id,
        sellersCount: sellers.filter((se) => se.storeId === s.id).length,
        customersCount: customers.filter((c) => c.storeId === s.id).length,
      }));
    });
  },
};
