import type { ID, IWhatsAppAccount } from "@/shared/types";
import { selectAllWhatsAppAccounts } from "../store/selectors";
import { MockNotFoundError, runApi } from "./utils";

export const whatsappAccountsApi = {
  list(params: { storeId?: ID } = {}): Promise<IWhatsAppAccount[]> {
    return runApi("whatsappAccountsApi", "list", () => {
      let all = selectAllWhatsAppAccounts();
      if (params.storeId) all = all.filter((a) => a.storeId === params.storeId);
      return [...all];
    });
  },

  async get(id: ID): Promise<IWhatsAppAccount> {
    return runApi("whatsappAccountsApi", "get", () => {
      const found = selectAllWhatsAppAccounts().find((a) => a.id === id);
      if (!found) throw new MockNotFoundError("whatsapp_account", id);
      return found;
    });
  },
};
