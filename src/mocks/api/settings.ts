import type { ID, IPlatformSettings } from "@/shared/types";
import { useMockStore } from "../store/mockStore";
import { selectAllStores } from "../store/selectors";
import { MockNotFoundError, runApi } from "./utils";

export const settingsApi = {
  get(storeId: ID): Promise<IPlatformSettings> {
    return runApi("settingsApi", "get", () => {
      const store = selectAllStores().find((s) => s.id === storeId);
      if (!store) throw new MockNotFoundError("store", storeId);
      return store.settings;
    });
  },

  update(storeId: ID, patch: Partial<IPlatformSettings>): Promise<IPlatformSettings> {
    return runApi("settingsApi", "update", () => {
      let updated: IPlatformSettings | null = null;
      useMockStore.setState((state) => {
        const stores = state.stores.map((s) => {
          if (s.id !== storeId) return s;
          updated = { ...s.settings, ...patch, storeId } as IPlatformSettings;
          return { ...s, settings: updated };
        });
        return { stores };
      });
      if (!updated) throw new MockNotFoundError("store", storeId);
      return updated;
    });
  },
};
