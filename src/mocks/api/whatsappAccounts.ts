import type { ID, IWhatsAppAccount, IWhatsAppAccountAccessRule } from "@/shared/types";
import { selectAllWhatsAppAccounts } from "../store/selectors";
import { patchById, upsert } from "../store/mutations";
import { MockNotFoundError, runApi } from "./utils";

// In-memory access rules (mock-only; supabase usa a tabela real).
const mockAccessRules = new Map<string, IWhatsAppAccountAccessRule[]>();

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

  async create(input: Omit<IWhatsAppAccount, "id" | "createdAt">): Promise<IWhatsAppAccount> {
    return runApi("whatsappAccountsApi", "create", () => {
      const account: IWhatsAppAccount = {
        ...input,
        id: `wa-${crypto.randomUUID()}`,
        createdAt: new Date().toISOString(),
      };
      upsert("whatsappAccounts", account);
      return account;
    });
  },

  async getAccessRules(accountId: ID): Promise<IWhatsAppAccountAccessRule[]> {
    return runApi("whatsappAccountsApi", "getAccessRules", () => [
      ...(mockAccessRules.get(String(accountId)) ?? []),
    ]);
  },

  async replaceAccessRules(
    accountId: ID,
    rules: Array<Pick<IWhatsAppAccountAccessRule, "kind" | "targetValue">>,
  ): Promise<IWhatsAppAccountAccessRule[]> {
    return runApi("whatsappAccountsApi", "replaceAccessRules", () => {
      const now = new Date().toISOString();
      const built: IWhatsAppAccountAccessRule[] = rules.map((r) => ({
        id: `waar-${crypto.randomUUID()}`,
        whatsappAccountId: String(accountId),
        kind: r.kind,
        targetValue: r.targetValue,
        createdAt: now,
      }));
      mockAccessRules.set(String(accountId), built);
      return [...built];
    });
  },
};
