import type { ID, IWhatsAppAccount } from "@/shared/types";
import { selectAllWhatsAppAccounts } from "../store/selectors";
import { patchById } from "../store/mutations";
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

  async update(id: ID, patch: Partial<IWhatsAppAccount>): Promise<IWhatsAppAccount> {
    return runApi(
      "whatsappAccountsApi",
      "update",
      () => {
        const updated = patchById("whatsappAccounts", id, patch);
        if (!updated) throw new MockNotFoundError("whatsapp_account", id);
        return updated;
      },
      { payload: { id, patch } },
    );
  },
};
