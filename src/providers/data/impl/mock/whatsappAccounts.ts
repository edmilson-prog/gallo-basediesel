import { whatsappAccountsApi } from "@/mocks";
import type { IWhatsAppAccountsProvider } from "../../contracts/whatsappAccounts";

export const mockWhatsAppAccountsProvider: IWhatsAppAccountsProvider = {
  list: (params = {}) => whatsappAccountsApi.list(params),
  get: (id) => whatsappAccountsApi.get(id),
  update: (id, patch) =>
    whatsappAccountsApi.update(id, {
      ...(patch.label !== undefined ? { label: patch.label } : {}),
      ...(patch.credentialsRef !== undefined ? { credentialsRef: patch.credentialsRef } : {}),
      ...(patch.providerConfig !== undefined
        ? { providerConfig: patch.providerConfig ?? undefined }
        : {}),
    }),
};
