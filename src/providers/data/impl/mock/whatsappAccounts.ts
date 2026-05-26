import { whatsappAccountsApi } from "@/mocks";
import type { IWhatsAppAccountsProvider } from "../../contracts/whatsappAccounts";

export const mockWhatsAppAccountsProvider: IWhatsAppAccountsProvider = {
  list: (params = {}) => whatsappAccountsApi.list(params),
  get: (id) => whatsappAccountsApi.get(id),
};
