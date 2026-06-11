import type { ID, IWhatsAppAccount, IWhatsAppCapabilities } from "@/shared/types";
import type {
  IListWhatsAppAccountsParams,
  IWhatsAppAccountMetrics,
  IWhatsAppAccountPatch,
  IWhatsAppAccountsProvider,
} from "../../contracts/whatsappAccounts";
import { computeFailureRate } from "../../contracts/whatsappAccounts";
import { getSupabaseClient } from "@/shared/lib/supabase";

/**
 * Supabase implementation of {@link IWhatsAppAccountsProvider} (PRD-011/104/119).
 *
 * snake_case table ↔ camelCase {@link IWhatsAppAccount} via `rowToWhatsAppAccount`.
 * The capability matrix and the non-secret engine config (`provider_config`,
 * PRD-111) are `jsonb` columns. `update` powers the Owner-only config screen
 * (PRD-119) — RLS keeps writes staff-only; secrets never transit here
 * (`credentials_ref` is just the name prefix of the Edge Function secrets).
 */

interface WhatsAppAccountRow {
  id: string;
  store_id: string;
  label: string;
  phone_number: string;
  provider: IWhatsAppAccount["provider"];
  credentials_ref: string;
  status: IWhatsAppAccount["status"];
  capabilities: IWhatsAppCapabilities;
  provider_config: IWhatsAppAccount["providerConfig"] | null;
  current_state: IWhatsAppAccount["currentState"];
  state_changed_at: string | null;
  failover_policy: IWhatsAppAccount["failoverPolicy"];
  failover_account_id: string | null;
  is_failover_active: boolean;
  created_at: string;
}

const TABLE = "whatsapp_accounts";
const COLUMNS =
  "id, store_id, label, phone_number, provider, credentials_ref, status, capabilities, " +
  "provider_config, current_state, state_changed_at, failover_policy, failover_account_id, " +
  "is_failover_active, created_at";

function rowToWhatsAppAccount(row: WhatsAppAccountRow): IWhatsAppAccount {
  return {
    id: row.id,
    storeId: row.store_id,
    label: row.label,
    phoneNumber: row.phone_number,
    provider: row.provider,
    credentialsRef: row.credentials_ref,
    status: row.status,
    capabilities: row.capabilities,
    providerConfig: row.provider_config ?? undefined,
    currentState: row.current_state,
    stateChangedAt: row.state_changed_at ?? undefined,
    failoverPolicy: row.failover_policy,
    failoverAccountId: row.failover_account_id ?? undefined,
    isFailoverActive: row.is_failover_active,
    createdAt: row.created_at,
  };
}

export const supabaseWhatsAppAccountsProvider: IWhatsAppAccountsProvider = {
  async list(params?: IListWhatsAppAccountsParams): Promise<IWhatsAppAccount[]> {
    let query = getSupabaseClient().from(TABLE).select(COLUMNS);
    if (params?.storeId) query = query.eq("store_id", params.storeId);

    const { data, error } = await query.order("created_at", { ascending: true });
    if (error) throw new Error(`[supabase] whatsappAccounts.list failed: ${error.message}`);
    return (data as unknown as WhatsAppAccountRow[]).map(rowToWhatsAppAccount);
  },

  async get(id: ID): Promise<IWhatsAppAccount> {
    const { data, error } = await getSupabaseClient()
      .from(TABLE)
      .select(COLUMNS)
      .eq("id", id)
      .single();
    if (error) throw new Error(`[supabase] whatsappAccounts.get(${id}) failed: ${error.message}`);
    return rowToWhatsAppAccount(data as unknown as WhatsAppAccountRow);
  },

  async update(id: ID, patch: IWhatsAppAccountPatch): Promise<IWhatsAppAccount> {
    const row: Record<string, unknown> = {};
    if (patch.label !== undefined) row.label = patch.label;
    if (patch.credentialsRef !== undefined) row.credentials_ref = patch.credentialsRef;
    if (patch.providerConfig !== undefined) row.provider_config = patch.providerConfig;
    if (patch.failoverPolicy !== undefined) row.failover_policy = patch.failoverPolicy;
    if (patch.failoverAccountId !== undefined) row.failover_account_id = patch.failoverAccountId;
    if (patch.isFailoverActive !== undefined) row.is_failover_active = patch.isFailoverActive;

    const { data, error } = await getSupabaseClient()
      .from(TABLE)
      .update(row)
      .eq("id", id)
      .select(COLUMNS)
      .single();
    if (error)
      throw new Error(`[supabase] whatsappAccounts.update(${id}) failed: ${error.message}`);
    return rowToWhatsAppAccount(data as unknown as WhatsAppAccountRow);
  },

  async getMetrics(id: ID, days = 30): Promise<IWhatsAppAccountMetrics> {
    const { data, error } = await getSupabaseClient().rpc("whatsapp_account_metrics", {
      p_account_id: id,
      p_days: days,
    });
    if (error)
      throw new Error(`[supabase] whatsappAccounts.getMetrics(${id}) failed: ${error.message}`);
    // Staff-only silent filter: non-staff callers get null → empty metrics.
    const payload = (data ?? {}) as {
      windowDays?: number;
      sent?: number;
      failed?: number;
      lastOutboundAt?: string | null;
    };
    const sent = payload.sent ?? 0;
    const failed = payload.failed ?? 0;
    return {
      windowDays: payload.windowDays ?? days,
      sent,
      failed,
      failureRate: computeFailureRate(sent, failed),
      lastOutboundAt: payload.lastOutboundAt ?? undefined,
    };
  },
};
