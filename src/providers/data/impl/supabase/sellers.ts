import type { Division, ID, ISeller } from "@/shared/types";
import type {
  ICreateSellerInput,
  IListSellersParams,
  ISellersProvider,
} from "../../contracts/sellers";
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
  attendant_name: string | null;
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
  department_id: string | null;
  rotation: ISeller["rotation"] | null;
  work_schedule: ISeller["workSchedule"] | null;
  schedule_overrides: ISeller["scheduleOverrides"] | null;
  access_grant: ISeller["accessGrant"] | null;
  active: boolean;
  created_at: string;
  deleted_at: string | null;
}

const TABLE = "sellers";
const COLUMNS =
  "id, store_id, full_name, attendant_name, email, phone, type, availability, divisions, theme_preference, region, commission_tier, parent_seller_id, commission_rule, vehicle_cadastro_mode, department_id, rotation, work_schedule, schedule_overrides, access_grant, active, created_at, deleted_at";

function rowToSeller(row: SellerRow): ISeller {
  return {
    id: row.id,
    storeId: row.store_id,
    fullName: row.full_name,
    attendantName: row.attendant_name ?? undefined,
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
    departmentId: row.department_id ?? null,
    rotation: row.rotation ?? undefined,
    workSchedule: row.work_schedule ?? undefined,
    scheduleOverrides: row.schedule_overrides ?? undefined,
    accessGrant: row.access_grant ?? null,
    active: row.active,
    createdAt: row.created_at,
    deletedAt: row.deleted_at ?? undefined,
  };
}

/** Maps a camelCase patch to snake_case columns. `id`/`storeId`/`createdAt` are
 *  immutable and never written. */
function sellerPatchToRow(patch: Partial<ISeller>): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (patch.fullName !== undefined) row.full_name = patch.fullName;
  if (patch.attendantName !== undefined) row.attendant_name = patch.attendantName;
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
  // Nullable: `null` clears the assignment; `undefined` leaves it untouched.
  if (patch.departmentId !== undefined) row.department_id = patch.departmentId ?? null;
  if (patch.rotation !== undefined) row.rotation = patch.rotation;
  if (patch.workSchedule !== undefined) row.work_schedule = patch.workSchedule;
  if (patch.scheduleOverrides !== undefined) row.schedule_overrides = patch.scheduleOverrides;
  // Nullable: `null` clears the grant; `undefined` leaves it untouched.
  if (patch.accessGrant !== undefined) row.access_grant = patch.accessGrant ?? null;
  if (patch.active !== undefined) row.active = patch.active;
  return row;
}

export const supabaseSellersProvider: ISellersProvider = {
  async list(params?: IListSellersParams): Promise<ISeller[]> {
    let query = getSupabaseClient().from(TABLE).select(COLUMNS);
    query = query.is("deleted_at", null);
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

  async create(input: ICreateSellerInput): Promise<ISeller> {
    // RLS sellers_insert (staff of the store) protects this direct insert; the
    // DB fills id/availability/divisions/active/created_at defaults.
    const { data, error } = await getSupabaseClient()
      .from(TABLE)
      .insert({
        store_id: input.storeId,
        full_name: input.fullName.trim(),
        email: input.email.trim().toLowerCase(),
        phone: input.phone?.trim() || null,
        type: input.type,
        region: input.region?.trim() || null,
        attendant_name: input.attendantName?.trim() || null,
        department_id: input.departmentId ?? null,
      })
      .select(COLUMNS)
      .single();
    if (error) throw new Error(`[supabase] sellers.create failed: ${error.message}`);
    return rowToSeller(data as SellerRow);
  },

  async remove(id: ID): Promise<void> {
    // Soft delete runs server-side (delete-seller Edge Function) because
    // revoking the login needs the service_role key.
    const { error } = await getSupabaseClient().functions.invoke("delete-seller", {
      body: { sellerId: id },
    });
    if (error) throw new Error(await extractFunctionError(error));
  },
};

/** Pulls the JSON `error` field out of a non-2xx Edge Function response. */
async function extractFunctionError(error: unknown): Promise<string> {
  const ctx = (error as { context?: Response }).context;
  if (ctx && typeof ctx.json === "function") {
    try {
      const body = (await ctx.json()) as { error?: string };
      if (body?.error) return body.error;
    } catch {
      /* fall through to the generic message */
    }
  }
  return error instanceof Error ? error.message : "[supabase] sellers.remove failed";
}
