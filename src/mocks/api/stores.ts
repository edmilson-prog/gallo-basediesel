import type { ID, IStore } from "@/shared/types";
import { selectAllStores } from "../store/selectors";
import { MockNotFoundError, runApi } from "./utils";

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
};
