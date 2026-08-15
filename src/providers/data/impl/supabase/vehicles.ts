import type { ID, IVehicle, IVehicleServiceEntry } from "@/shared/types";
import type {
  IAddServiceEntryInput,
  IListVehiclesParams,
  IVehiclesProvider,
} from "../../contracts/vehicles";
import type { IPaginatedResult } from "../../contracts/_shared";
import { getSupabaseClient } from "@/shared/lib/supabase";
import { fetchLargePage } from "./_pagination";

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
 * carry no own `storeId`/`sellerId`): when a storeId/storeIds/sellerIds scope
 * is present the query inner-joins `customers` and filters on the embedded
 * relation server-side (`customers.store_id` / `customers.seller_id`), so no
 * customer-id list is ever materialized client-side (which would both cap at
 * 1000 ids and risk URL overflow on the resulting `.in()`).
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

export const supabaseVehiclesProvider: IVehiclesProvider = {
  async list(params: IListVehiclesParams = {}): Promise<IPaginatedResult<IVehicle>> {
    const page = Math.max(1, Math.floor(params.page ?? 1));
    const pageSize = Math.max(1, Math.min(50_000, Math.floor(params.pageSize ?? 20)));
    const from = (page - 1) * pageSize;

    // Store-/seller-scope is resolved server-side via an inner join on the
    // owning customer (vehicles carry no own store/seller). An inner join that
    // matches nothing naturally yields zero rows and count 0. The unscoped
    // path keeps the plain projection — no join cost when no scope is set.
    const hasScope =
      !!params.storeId || (params.storeIds?.length ?? 0) > 0 || (params.sellerIds?.length ?? 0) > 0;

    const buildQuery = () => {
      let query = getSupabaseClient()
        .from(TABLE)
        .select(hasScope ? `${COLUMNS}, customers!inner(id)` : COLUMNS, { count: "exact" });

      if (params.storeId) query = query.eq("customers.store_id", params.storeId);
      if (params.storeIds && params.storeIds.length > 0)
        query = query.in("customers.store_id", params.storeIds);
      if (params.sellerIds && params.sellerIds.length > 0)
        query = query.in("customers.seller_id", params.sellerIds);
      if (params.customerId) query = query.eq("customer_id", params.customerId);
      if (params.customerIds && params.customerIds.length > 0)
        query = query.in("customer_id", params.customerIds);
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
      return query;
    };

    const orderColumn = VALID_ORDER_COLUMNS[params.orderBy ?? "brand"] ?? "brand";
    const ascending = (params.orderDir ?? "asc") === "asc";

    const { data, total } = await fetchLargePage<VehicleRow>(
      async (rangeFrom, rangeTo) => {
        const { data, error, count } = await buildQuery()
          .order(orderColumn, { ascending })
          .order("id", { ascending: true })
          .range(rangeFrom, rangeTo);
        if (error) throw new Error(`[supabase] vehicles.list failed: ${error.message}`);
        return { data: (data ?? []) as unknown as VehicleRow[], count: count ?? 0 };
      },
      from,
      pageSize,
    );

    return {
      data: data.map(rowToVehicle),
      total,
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
