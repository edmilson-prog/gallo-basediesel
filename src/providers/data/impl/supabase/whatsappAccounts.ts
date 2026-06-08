import type { ID, IWhatsAppAccount, IWhatsAppCapabilities } from "@/shared/types";
import type {
  IListWhatsAppAccountsParams,
  IWhatsAppAccountsProvider,
} from "../../contracts/whatsappAccounts";
import { getSupabaseClient } from "@/shared/lib/supabase";

/**
 * Supabase implementation of {@link IWhatsAppAccountsProvider} (PRD-011/104).
 *
 * snake_case table ↔ camelCase {@link IWhatsAppAccount} via `rowToWhatsAppAccount`.
 * Read-only, mirroring the mock provider. The capability matrix is stored as a
 * single `jsonb` column. Seeded from the small static mock fixture
 * (`mocks/generators/whatsappAccount.ts`).
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
  created_at: string;
}

const TABLE = "whatsapp_accounts";
const COLUMNS =
  "id, store_id, label, phone_number, provider, credentials_ref, status, capabilities, created_at";

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
    createdAt: row.created_at,
  };
}

export const supabaseWhatsAppAccountsProvider: IWhatsAppAccountsProvider = {
  async list(params?: IListWhatsAppAccountsParams): Promise<IWhatsAppAccount[]> {
    let query = getSupabaseClient().from(TABLE).select(COLUMNS);
    if (params?.storeId) query = query.eq("store_id", params.storeId);

    const { data, error } = await query.order("created_at", { ascending: true });
    if (error) throw new Error(`[supabase] whatsappAccounts.list failed: ${error.message}`);
    return (data as WhatsAppAccountRow[]).map(rowToWhatsAppAccount);
  },

  async get(id: ID): Promise<IWhatsAppAccount> {
    const { data, error } = await getSupabaseClient()
      .from(TABLE)
      .select(COLUMNS)
      .eq("id", id)
      .single();
    if (error) throw new Error(`[supabase] whatsappAccounts.get(${id}) failed: ${error.message}`);
    return rowToWhatsAppAccount(data as WhatsAppAccountRow);
  },
};
