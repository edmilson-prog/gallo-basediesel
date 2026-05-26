import type { ID, IWhatsAppAccount } from "@/shared/types";

export interface IListWhatsAppAccountsParams {
  storeId?: ID;
}

/**
 * Contract for WhatsApp account access.
 *
 * Accounts hold the capability matrix (template support, proactive messaging,
 * etc.) consumed by the conversation UI to adapt input controls (PRD-011).
 *
 * @see ../../../mocks/api/whatsappAccounts.ts
 * @see ../../../../docs/provider-pattern.md
 */
export interface IWhatsAppAccountsProvider {
  list(params?: IListWhatsAppAccountsParams): Promise<IWhatsAppAccount[]>;
  get(id: ID): Promise<IWhatsAppAccount>;
}
