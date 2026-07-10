import type {
  ID,
  IWhatsAppAccount,
  IWhatsAppAccountAccessRule,
  IWhatsAppCapabilities,
} from "@/shared/types";
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
  purpose: IWhatsAppAccount["purpose"];
  go_server_id: string | null;
  alerts_muted: boolean;
}

const TABLE = "whatsapp_accounts";
const COLUMNS =
  "id, store_id, label, phone_number, provider, credentials_ref, status, capabilities, " +
  "provider_config, current_state, state_changed_at, failover_policy, failover_account_id, " +
  "is_failover_active, created_at, purpose, go_server_id, alerts_muted";

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
    purpose: row.purpose ?? "atendimento",
    goServerId: row.go_server_id ?? undefined,
    alertsMuted: row.alerts_muted ?? false,
  };
}

export const supabaseWhatsAppAccountsProvider: IWhatsAppAccountsProvider = {
  async list(params?: IListWhatsAppAccountsParams): Promise<IWhatsAppAccount[]> {
    let query = getSupabaseClient().from(TABLE).select(COLUMNS);
    if (params?.storeId) query = query.eq("store_id", params.storeId);
    // WAHA sessions are managed exclusively from the dedicated "WAHA" tab
    // (`WahaSection`, reading `whatsapp_accounts` directly) — they carry no
    // `providerConfig.baseUrl`/`instanceName`, so every other consumer of this
    // generic list (Contas tab, Inbox instance filter, connection status,
    // failover pickers, templates screen) would break on a "waha" row.
    query = query.neq("provider", "waha");

    const { data, error } = await query.order("created_at", { ascending: true });
    if (error) throw new Error(`[supabase] whatsappAccounts.list failed: ${error.message}`);
    return (data as unknown as WhatsAppAccountRow[]).map(rowToWhatsAppAccount);
  },

  async listAccessibleAccountIds(): Promise<ID[]> {
    // Reuse the existing SECURITY DEFINER helper (same source of truth as
    // can_access_conversation). It takes no args — the viewer comes from the JWT
    // (current_seller_id / current_app_role / current_store_id). EXECUTE is
    // already granted to `authenticated`, so no migration is needed.
    const { data, error } = await getSupabaseClient().rpc("current_seller_accessible_account_ids");
    if (error) {
      throw new Error(
        `[supabase] whatsappAccounts.listAccessibleAccountIds failed: ${error.message}`,
      );
    }
    // PostgREST may return a `setof uuid` either as a scalar array (string[]) or
    // as single-column rows ([{ <col>: string }]). Tolerate both without assuming
    // the column name (take the row's first value when it is an object), and skip
    // any null / non-object row defensively (typeof null === "object").
    return ((data ?? []) as unknown[]).flatMap((row) => {
      if (typeof row === "string") return [row as ID];
      if (row && typeof row === "object") return [Object.values(row)[0] as ID];
      return [];
    });
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

  async create(input: Omit<IWhatsAppAccount, "id" | "createdAt">): Promise<IWhatsAppAccount> {
    const id: ID = crypto.randomUUID();
    const row = {
      id,
      store_id: input.storeId,
      label: input.label,
      phone_number: input.phoneNumber,
      provider: input.provider,
      credentials_ref: input.credentialsRef,
      status: input.status,
      capabilities: input.capabilities,
      provider_config: input.providerConfig ?? null,
      current_state: input.currentState,
      state_changed_at: input.stateChangedAt ?? null,
      failover_policy: input.failoverPolicy,
      failover_account_id: input.failoverAccountId ?? null,
      is_failover_active: input.isFailoverActive,
      purpose: input.purpose,
      go_server_id: input.goServerId ?? null,
      alerts_muted: input.alertsMuted ?? false,
    };
    const { data, error } = await getSupabaseClient()
      .from(TABLE)
      .insert(row)
      .select(COLUMNS)
      .single();
    if (error) throw new Error(`[supabase] whatsappAccounts.create failed: ${error.message}`);
    return rowToWhatsAppAccount(data as unknown as WhatsAppAccountRow);
  },

  async getAccessRules(accountId: ID): Promise<IWhatsAppAccountAccessRule[]> {
    const { data, error } = await getSupabaseClient()
      .from("whatsapp_account_access_rules")
      .select("id, whatsapp_account_id, kind, target_value, created_at")
      .eq("whatsapp_account_id", accountId);
    if (error) throw new Error(`[supabase] getAccessRules(${accountId}) failed: ${error.message}`);
    return (data ?? []).map((r) => ({
      id: r.id as string,
      whatsappAccountId: r.whatsapp_account_id as string,
      kind: r.kind as IWhatsAppAccountAccessRule["kind"],
      targetValue: r.target_value as string,
      createdAt: r.created_at as string,
    }));
  },

  async replaceAccessRules(
    accountId: ID,
    rules: Array<Pick<IWhatsAppAccountAccessRule, "kind" | "targetValue">>,
  ): Promise<IWhatsAppAccountAccessRule[]> {
    const client = getSupabaseClient();
    const del = await client
      .from("whatsapp_account_access_rules")
      .delete()
      .eq("whatsapp_account_id", accountId);
    if (del.error)
      throw new Error(`[supabase] replaceAccessRules delete failed: ${del.error.message}`);
    if (rules.length === 0) return [];
    const { data, error } = await client
      .from("whatsapp_account_access_rules")
      .insert(
        rules.map((r) => ({
          whatsapp_account_id: accountId,
          kind: r.kind,
          target_value: r.targetValue,
        })),
      )
      .select("id, whatsapp_account_id, kind, target_value, created_at");
    if (error) throw new Error(`[supabase] replaceAccessRules insert failed: ${error.message}`);
    return (data ?? []).map((r) => ({
      id: r.id as string,
      whatsappAccountId: r.whatsapp_account_id as string,
      kind: r.kind as IWhatsAppAccountAccessRule["kind"],
      targetValue: r.target_value as string,
      createdAt: r.created_at as string,
    }));
  },

  async update(id: ID, patch: IWhatsAppAccountPatch): Promise<IWhatsAppAccount> {
    const row: Record<string, unknown> = {};
    if (patch.label !== undefined) row.label = patch.label;
    if (patch.credentialsRef !== undefined) row.credentials_ref = patch.credentialsRef;
    if (patch.providerConfig !== undefined) row.provider_config = patch.providerConfig;
    if (patch.failoverPolicy !== undefined) row.failover_policy = patch.failoverPolicy;
    if (patch.failoverAccountId !== undefined) row.failover_account_id = patch.failoverAccountId;
    if (patch.isFailoverActive !== undefined) row.is_failover_active = patch.isFailoverActive;
    if (patch.alertsMuted !== undefined) row.alerts_muted = patch.alertsMuted;

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
