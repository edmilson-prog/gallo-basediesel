import type { ID, IVehicle, IVehicleServiceEntry } from "@/shared/types";
import type {
  IAddServiceEntryInput,
  IListVehiclesParams,
  IVehiclesProvider,
} from "../../contracts/vehicles";
import type { IPaginatedResult } from "../../contracts/_shared";
import { getSupabaseClient } from "@/shared/lib/supabase";

/**
 * Supabase implementation of {@link IVehiclesProvider} (PRD-016/104).
 *
 * snake_case table ↔ camelCase IVehicle via `rowToVehicle`. The vehicle's
 * `serviceHistory` (array of objects) is persisted as a single jsonb column,
 * mirroring the mock layer where the timeline lives on the vehicle itself.
 *
 * Reads work today under the temporary permissive RLS; the mutations
 * (create/update/delete/addServiceEntry) require the write policies that land
 * with PRD-103.
 *
 * Store-/seller-scoped filtering is derived from the owning customer (vehicles
 * carry no own `storeId`/`sellerId`): the storeIds/sellerIds params first
 * resolve the matching customer ids, then constrain the vehicle query by
 * `customer_id`.
 */

interface VehicleRow {
  id: string;
  customer_id: string;
  brand: string;
  model: string;
  year: number;
  engine: string;
  model_id: string | null;
  plate: string | null;
  vin: string | null;
  current_km: number | null;
  service_history: IVehicleServiceEntry[];
  cadastro_status: IVehicle["cadastroStatus"];
  created_at: string;
}

const TABLE = "vehicles";
const COLUMNS =
  "id, customer_id, brand, model, year, engine, model_id, plate, vin, current_km, service_history, cadastro_status, created_at";

function rowToVehicle(row: VehicleRow): IVehicle {
  return {
    id: row.id,
    customerId: row.customer_id,
    brand: row.brand,
    model: row.model,
    year: row.year,
    engine: row.engine,
    modelId: row.model_id,
    plate: row.plate ?? undefined,
    vin: row.vin ?? undefined,
    currentKm: row.current_km ?? undefined,
    serviceHistory: row.service_history ?? [],
    cadastroStatus: row.cadastro_status,
    createdAt: row.created_at,
  };
}

/** Maps a camelCase patch to snake_case columns. `id`/`customerId`/`createdAt`
 *  are immutable and never written. */
function vehiclePatchToRow(patch: Partial<IVehicle>): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (patch.brand !== undefined) row.brand = patch.brand;
  if (patch.model !== undefined) row.model = patch.model;
  if (patch.year !== undefined) row.year = patch.year;
  if (patch.engine !== undefined) row.engine = patch.engine;
  if (patch.modelId !== undefined) row.model_id = patch.modelId;
  if (patch.plate !== undefined) row.plate = patch.plate;
  if (patch.vin !== undefined) row.vin = patch.vin;
  if (patch.currentKm !== undefined) row.current_km = patch.currentKm;
  if (patch.serviceHistory !== undefined) row.service_history = patch.serviceHistory;
  if (patch.cadastroStatus !== undefined) row.cadastro_status = patch.cadastroStatus;
  return row;
}

/** Maps the contract's `orderBy` tokens to sortable DB columns. Tokens that
 *  depend on related tables (seller/customerName/lastServiceAt) fall back to
 *  `brand`, matching the mock default ordering. */
const VALID_ORDER_COLUMNS: Record<string, string> = {
  brand: "brand",
  engine: "engine",
  plate: "plate",
  cadastroStatus: "cadastro_status",
  createdAt: "created_at",
  currentKm: "current_km",
  year: "year",
};

/**
 * Resolves customer ids matching the store/seller scope filters, so vehicles
 * (which carry no own store/seller) can be constrained by `customer_id`.
 * Returns `null` when no scope filter is set.
 */
async function resolveScopedCustomerIds(params: IListVehiclesParams): Promise<ID[] | null> {
  const needsStore = !!params.storeId || (params.storeIds?.length ?? 0) > 0;
  const needsSeller = (params.sellerIds?.length ?? 0) > 0;
  if (!needsStore && !needsSeller) return null;

  let query = getSupabaseClient().from("customers").select("id");
  if (params.storeId) query = query.eq("store_id", params.storeId);
  if (params.storeIds && params.storeIds.length > 0) query = query.in("store_id", params.storeIds);
  if (params.sellerIds && params.sellerIds.length > 0)
    query = query.in("seller_id", params.sellerIds);

  const { data, error } = await query;
  if (error) throw new Error(`[supabase] vehicles.list failed: ${error.message}`);
  return (data as { id: string }[]).map((c) => c.id);
}

export const supabaseVehiclesProvider: IVehiclesProvider = {
  async list(params: IListVehiclesParams = {}): Promise<IPaginatedResult<IVehicle>> {
    const page = params.page ?? 1;
    const pageSize = params.pageSize ?? 20;

    const scopedCustomerIds = await resolveScopedCustomerIds(params);
    // Scope filters matched no customer → no vehicles.
    if (scopedCustomerIds !== null && scopedCustomerIds.length === 0) {
      return { data: [], total: 0, page, pageSize };
    }

    let query = getSupabaseClient().from(TABLE).select(COLUMNS, { count: "exact" });

    if (params.customerId) query = query.eq("customer_id", params.customerId);
    if (params.customerIds && params.customerIds.length > 0)
      query = query.in("customer_id", params.customerIds);
    if (scopedCustomerIds !== null) query = query.in("customer_id", scopedCustomerIds);
    if (params.brand) query = query.eq("brand", params.brand);
    if (params.brands && params.brands.length > 0) query = query.in("brand", params.brands);
    if (params.model) query = query.ilike("model", `%${params.model}%`);
    if (params.engine) query = query.ilike("engine", `%${params.engine}%`);
    if (params.yearMin !== undefined) query = query.gte("year", params.yearMin);
    if (params.yearMax !== undefined) query = query.lte("year", params.yearMax);
    if (params.cadastroStatus) query = query.eq("cadastro_status", params.cadastroStatus);
    if (params.cadastroStatuses && params.cadastroStatuses.length > 0)
      query = query.in("cadastro_status", params.cadastroStatuses);
    if (params.search) {
      const q = params.search.trim();
      if (q.length > 0) {
        const like = `%${q}%`;
        query = query.or(`plate.ilike.${like},vin.ilike.${like},model.ilike.${like}`);
      }
    }

    const orderColumn = VALID_ORDER_COLUMNS[params.orderBy ?? "brand"] ?? "brand";
    const ascending = (params.orderDir ?? "asc") === "asc";
    query = query.order(orderColumn, { ascending });

    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;
    query = query.range(from, to);

    const { data, error, count } = await query;
    if (error) throw new Error(`[supabase] vehicles.list failed: ${error.message}`);
    return {
      data: (data as VehicleRow[]).map(rowToVehicle),
      total: count ?? 0,
      page,
      pageSize,
    };
  },

  async get(id: ID): Promise<IVehicle> {
    const { data, error } = await getSupabaseClient()
      .from(TABLE)
      .select(COLUMNS)
      .eq("id", id)
      .single();
    if (error) throw new Error(`[supabase] vehicles.get(${id}) failed: ${error.message}`);
    return rowToVehicle(data as VehicleRow);
  },

  async listByCustomer(customerId: ID): Promise<IVehicle[]> {
    const { data, error } = await getSupabaseClient()
      .from(TABLE)
      .select(COLUMNS)
      .eq("customer_id", customerId)
      .order("brand", { ascending: true });
    if (error)
      throw new Error(`[supabase] vehicles.listByCustomer(${customerId}) failed: ${error.message}`);
    return (data as VehicleRow[]).map(rowToVehicle);
  },

  async create(input: Omit<IVehicle, "id" | "createdAt" | "serviceHistory">): Promise<IVehicle> {
    const insertRow = {
      id: crypto.randomUUID(),
      customer_id: input.customerId,
      brand: input.brand,
      model: input.model,
      year: input.year,
      engine: input.engine,
      model_id: input.modelId,
      plate: input.plate ?? null,
      vin: input.vin ?? null,
      current_km: input.currentKm ?? null,
      service_history: [],
      cadastro_status: input.cadastroStatus,
      created_at: new Date().toISOString(),
    };
    const { data, error } = await getSupabaseClient()
      .from(TABLE)
      .insert(insertRow)
      .select(COLUMNS)
      .single();
    if (error) throw new Error(`[supabase] vehicles.create failed: ${error.message}`);
    return rowToVehicle(data as VehicleRow);
  },

  async update(id: ID, patch: Partial<IVehicle>): Promise<IVehicle> {
    const { data, error } = await getSupabaseClient()
      .from(TABLE)
      .update(vehiclePatchToRow(patch))
      .eq("id", id)
      .select(COLUMNS)
      .single();
    if (error) throw new Error(`[supabase] vehicles.update(${id}) failed: ${error.message}`);
    return rowToVehicle(data as VehicleRow);
  },

  async delete(id: ID): Promise<void> {
    const { error } = await getSupabaseClient().from(TABLE).delete().eq("id", id);
    if (error) throw new Error(`[supabase] vehicles.delete(${id}) failed: ${error.message}`);
  },

  async addServiceEntry(vehicleId: ID, entry: IAddServiceEntryInput): Promise<IVehicle> {
    const existing = await this.get(vehicleId);
    const serviceEntry: IVehicleServiceEntry = {
      ...entry,
      id: `vse-${crypto.randomUUID()}`,
    };
    const nextHistory = [...existing.serviceHistory, serviceEntry];
    const bumpsKm = entry.km !== undefined && entry.km > (existing.currentKm ?? 0);
    return this.update(vehicleId, {
      serviceHistory: nextHistory,
      ...(bumpsKm ? { currentKm: entry.km } : {}),
    });
  },
};
