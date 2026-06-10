import type {
  ID,
  IWhatsAppAccount,
  IWhatsAppProviderConfig,
  WhatsAppFailoverPolicy,
} from "@/shared/types";

export interface IListWhatsAppAccountsParams {
  storeId?: ID;
}

/**
 * Editable subset of a WhatsApp account (PRD-119/120 — Admin → Integrações).
 * Deliberately narrow: provider/phone/store binding and capabilities are
 * operational facts, not form fields; secrets never transit the client
 * (`credentialsRef` is only the NAME PREFIX of the Edge Function secrets).
 * The failover fields power the PRD-120 owner override (policy, backup
 * account and the manual activate/deactivate toggle).
 */
export interface IWhatsAppAccountPatch {
  label?: string;
  credentialsRef?: string;
  providerConfig?: IWhatsAppProviderConfig | null;
  failoverPolicy?: WhatsAppFailoverPolicy;
  failoverAccountId?: ID | null;
  isFailoverActive?: boolean;
}

/**
 * Contract for WhatsApp account access.
 *
 * Accounts hold the capability matrix (template support, proactive messaging,
 * etc.) consumed by the conversation UI to adapt input controls (PRD-011).
 * `update` powers the Owner-only config screen (PRD-119); writes are
 * staff-only at the RLS layer.
 *
 * @see ../../../mocks/api/whatsappAccounts.ts
 * @see ../../../../docs/provider-pattern.md
 */
export interface IWhatsAppAccountsProvider {
  list(params?: IListWhatsAppAccountsParams): Promise<IWhatsAppAccount[]>;
  get(id: ID): Promise<IWhatsAppAccount>;
  update(id: ID, patch: IWhatsAppAccountPatch): Promise<IWhatsAppAccount>;
}
