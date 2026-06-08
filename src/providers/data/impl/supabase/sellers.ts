import type { Division, ID, ISeller } from "@/shared/types";
import type { IListSellersParams, ISellersProvider } from "../../contracts/sellers";
import { getSupabaseClient } from "@/shared/lib/supabase";

/**
 * Supabase implementation of {@link ISellersProvider} (PRD-101/104).
 *
 * snake_case table ↔ camelCase ISeller via `rowToSeller`. Reads work today
 * under the temporary permissive RLS; the mutations (setAvailability/update)
 * require the write policies that land with PRD-103.
 */

interface SellerRow {
  id: string;
  store_id: string;
  full_name: string;
  email: string;
  phone: string | null;
  type: ISeller["type"];
  availability: ISeller["availability"];
  divisions: Division[];
  theme_preference: ISeller["themePreference"] | null;
  region: string | null;
  commission_tier: ISeller["commissionTier"] | null;
  parent_seller_id: string | null;
  commission_rule: ISeller["commissionRule"] | null;
  vehicle_cadastro_mode: ISeller["vehicleCadastroMode"] | null;
  active: boolean;
  created_at: string;
}

const TABLE = "sellers";
const COLUMNS =
  "id, store_id, full_name, email, phone, type, availability, divisions, theme_preference, region, commission_tier, parent_seller_id, commission_rule, vehicle_cadastro_mode, active, created_at";

function rowToSeller(row: SellerRow): ISeller {
  return {
    id: row.id,
    storeId: row.store_id,
    fullName: row.full_name,
    email: row.email,
    phone: row.phone ?? undefined,
    type: row.type,
    availability: row.availability,
    divisions: row.divisions,
    themePreference: row.theme_preference ?? undefined,
    region: row.region ?? undefined,
    commissionTier: row.commission_tier ?? undefined,
    parentSellerId: row.parent_seller_id ?? undefined,
    commissionRule: row.commission_rule ?? undefined,
    vehicleCadastroMode: row.vehicle_cadastro_mode ?? undefined,
    active: row.active,
    createdAt: row.created_at,
  };
}

/** Maps a camelCase patch to snake_case columns. `id`/`storeId`/`createdAt` are
 *  immutable and never written. */
function sellerPatchToRow(patch: Partial<ISeller>): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (patch.fullName !== undefined) row.full_name = patch.fullName;
  if (patch.email !== undefined) row.email = patch.email;
  if (patch.phone !== undefined) row.phone = patch.phone;
  if (patch.type !== undefined) row.type = patch.type;
  if (patch.availability !== undefined) row.availability = patch.availability;
  if (patch.divisions !== undefined) row.divisions = patch.divisions;
  if (patch.themePreference !== undefined) row.theme_preference = patch.themePreference;
  if (patch.region !== undefined) row.region = patch.region;
  if (patch.commissionTier !== undefined) row.commission_tier = patch.commissionTier;
  if (patch.parentSellerId !== undefined) row.parent_seller_id = patch.parentSellerId;
  if (patch.commissionRule !== undefined) row.commission_rule = patch.commissionRule;
  if (patch.vehicleCadastroMode !== undefined)
    row.vehicle_cadastro_mode = patch.vehicleCadastroMode;
  if (patch.active !== undefined) row.active = patch.active;
  return row;
}

export const supabaseSellersProvider: ISellersProvider = {
  async list(params?: IListSellersParams): Promise<ISeller[]> {
    let query = getSupabaseClient().from(TABLE).select(COLUMNS);
    if (params?.storeId) query = query.eq("store_id", params.storeId);
    if (params?.active !== undefined) query = query.eq("active", params.active);

    const { data, error } = await query.order("created_at", { ascending: true });
    if (error) throw new Error(`[supabase] sellers.list failed: ${error.message}`);
    return (data as SellerRow[]).map(rowToSeller);
  },

  async get(id: ID): Promise<ISeller> {
    const { data, error } = await getSupabaseClient()
      .from(TABLE)
      .select(COLUMNS)
      .eq("id", id)
      .single();
    if (error) throw new Error(`[supabase] sellers.get(${id}) failed: ${error.message}`);
    return rowToSeller(data as SellerRow);
  },

  async setAvailability(id: ID, availability: ISeller["availability"]): Promise<ISeller> {
    const { data, error } = await getSupabaseClient()
      .from(TABLE)
      .update({ availability, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select(COLUMNS)
      .single();
    if (error)
      throw new Error(`[supabase] sellers.setAvailability(${id}) failed: ${error.message}`);
    return rowToSeller(data as SellerRow);
  },

  async update(id: ID, patch: Partial<ISeller>): Promise<ISeller> {
    const { data, error } = await getSupabaseClient()
      .from(TABLE)
      .update({ ...sellerPatchToRow(patch), updated_at: new Date().toISOString() })
      .eq("id", id)
      .select(COLUMNS)
      .single();
    if (error) throw new Error(`[supabase] sellers.update(${id}) failed: ${error.message}`);
    return rowToSeller(data as SellerRow);
  },
};
