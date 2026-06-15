import type {
  ID,
  ISO8601,
  IWhatsAppAccount,
  IWhatsAppAccountAccessRule,
  IWhatsAppProviderConfig,
  WhatsAppFailoverPolicy,
} from "@/shared/types";

export interface IListWhatsAppAccountsParams {
  storeId?: ID;
}

/** Outbound delivery aggregates for one account over a sliding window. */
export interface IWhatsAppAccountMetrics {
  windowDays: number;
  /** Messages that left (status sent/delivered/read). */
  sent: number;
  failed: number;
  /** failed / (sent + failed); 0 when there is no traffic. */
  failureRate: number;
  lastOutboundAt?: ISO8601;
}

/** Shared rate math so both impls (and the UI) agree on the denominator. */
export function computeFailureRate(sent: number, failed: number): number {
  const total = sent + failed;
  return total > 0 ? failed / total : 0;
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
  /** Cria uma nova instância (multi-instância). storeId vem no input (RLS). */
  create(input: Omit<IWhatsAppAccount, "id" | "createdAt">): Promise<IWhatsAppAccount>;
  /** Regras de acesso (Camada 1) da instância. Staff-only no RLS. */
  getAccessRules(accountId: ID): Promise<IWhatsAppAccountAccessRule[]>;
  /** Substitui o conjunto de regras de acesso da instância (replace-all). */
  replaceAccessRules(
    accountId: ID,
    rules: Array<Pick<IWhatsAppAccountAccessRule, "kind" | "targetValue">>,
  ): Promise<IWhatsAppAccountAccessRule[]>;
  update(id: ID, patch: IWhatsAppAccountPatch): Promise<IWhatsAppAccount>;
  /** Outbound delivery metrics for the accounts screen (staff-only data). */
  getMetrics(id: ID, days?: number): Promise<IWhatsAppAccountMetrics>;
}
