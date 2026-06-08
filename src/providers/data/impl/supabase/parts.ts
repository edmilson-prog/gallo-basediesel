import type {
  Division,
  ID,
  IApplication,
  IPart,
  IPartCrossReference,
  IPartFiscal,
  IPartSupplier,
  IPriceTable,
  ISO8601,
  PartCategory,
  SefazStatus,
} from "@/shared/types";
import type { IListPartsParams, IPartsProvider } from "../../contracts/parts";
import type { IPaginatedResult } from "../../contracts/_shared";
import { getSupabaseClient } from "@/shared/lib/supabase";

/**
 * Supabase implementation of {@link IPartsProvider} (PRD-110).
 *
 * snake_case `parts` table ↔ camelCase {@link IPart} via `rowToPart`. The list
 * endpoint pushes filtering, ordering and pagination down to PostgREST so the
 * `IPaginatedResult` total reflects the full filtered set (exact count). Nested
 * structures (applications, suppliers, price tables, fiscal, cross-references)
 * live in `jsonb`; the OEM and equivalent-part code arrays live in `text[]`.
 *
 * Reads work today under the temporary permissive RLS; the mutations
 * (create/update/delete) require the write policies that land with PRD-103.
 */

interface PartRow {
  id: string;
  sku: string;
  name: string;
  description: string | null;
  oem_codes: string[];
  equivalent_part_ids: string[];
  cross_references: IPartCrossReference[] | null;
  segment: string | null;
  application_notes: string | null;
  applications: IApplication[];
  brand: string;
  supplier: string;
  category: PartCategory | null;
  subcategory: string | null;
  is_original: boolean | null;
  image_url: string | null;
  unit_cost: number;
  unit_price: number;
  margin_percent: number;
  gtin: string | null;
  sefaz_status: SefazStatus | null;
  sefaz_checked_at: string | null;
  supplier_code: string | null;
  reference: string | null;
  group_label: string | null;
  part_type: string | null;
  price_tables: IPriceTable[] | null;
  fiscal: IPartFiscal | null;
  weight_kg: number | null;
  storage_location: string | null;
  box_quantity: number | null;
  fractionable: boolean | null;
  unit_of_measure: string | null;
  suppliers: IPartSupplier[] | null;
  average_cost: number | null;
  stock_available: number;
  stock_minimum: number;
  division: Division;
  active: boolean;
  store_id: string | null;
  created_at: string;
  updated_at: string;
}

const TABLE = "parts";
const COLUMNS =
  "id, sku, name, description, oem_codes, equivalent_part_ids, cross_references, segment, application_notes, applications, brand, supplier, category, subcategory, is_original, image_url, unit_cost, unit_price, margin_percent, gtin, sefaz_status, sefaz_checked_at, supplier_code, reference, group_label, part_type, price_tables, fiscal, weight_kg, storage_location, box_quantity, fractionable, unit_of_measure, suppliers, average_cost, stock_available, stock_minimum, division, active, store_id, created_at, updated_at";

/** Maps the `orderBy` contract value to the underlying snake_case column. */
const ORDER_BY_COLUMN: Record<NonNullable<IListPartsParams["orderBy"]>, string> = {
  name: "name",
  stockAvailable: "stock_available",
  unitPrice: "unit_price",
};

function rowToPart(row: PartRow): IPart {
  return {
    id: row.id,
    sku: row.sku,
    name: row.name,
    description: row.description ?? undefined,
    oemCodes: row.oem_codes,
    equivalentPartIds: row.equivalent_part_ids,
    crossReferences: row.cross_references ?? undefined,
    segment: row.segment ?? undefined,
    applicationNotes: row.application_notes ?? undefined,
    applications: row.applications,
    brand: row.brand,
    supplier: row.supplier,
    category: row.category ?? undefined,
    subcategory: row.subcategory ?? undefined,
    isOriginal: row.is_original ?? undefined,
    imageUrl: row.image_url ?? undefined,
    unitCost: row.unit_cost,
    unitPrice: row.unit_price,
    marginPercent: row.margin_percent,
    gtin: row.gtin ?? undefined,
    sefazStatus: row.sefaz_status ?? undefined,
    sefazCheckedAt: row.sefaz_checked_at ?? undefined,
    supplierCode: row.supplier_code ?? undefined,
    reference: row.reference ?? undefined,
    group: row.group_label ?? undefined,
    partType: row.part_type ?? undefined,
    priceTables: row.price_tables ?? undefined,
    fiscal: row.fiscal ?? undefined,
    weightKg: row.weight_kg ?? undefined,
    storageLocation: row.storage_location ?? undefined,
    boxQuantity: row.box_quantity ?? undefined,
    fractionable: row.fractionable ?? undefined,
    unitOfMeasure: row.unit_of_measure ?? undefined,
    suppliers: row.suppliers ?? undefined,
    averageCost: row.average_cost ?? undefined,
    stockAvailable: row.stock_available,
    stockMinimum: row.stock_minimum,
    division: row.division,
    active: row.active,
    storeId: row.store_id ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Maps a camelCase patch to snake_case columns. `id`/`storeId`/`createdAt` are
 * immutable and never written.
 */
function partPatchToRow(patch: Partial<IPart>): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (patch.sku !== undefined) row.sku = patch.sku;
  if (patch.name !== undefined) row.name = patch.name;
  if (patch.description !== undefined) row.description = patch.description;
  if (patch.oemCodes !== undefined) row.oem_codes = patch.oemCodes;
  if (patch.equivalentPartIds !== undefined) row.equivalent_part_ids = patch.equivalentPartIds;
  if (patch.crossReferences !== undefined) row.cross_references = patch.crossReferences;
  if (patch.segment !== undefined) row.segment = patch.segment;
  if (patch.applicationNotes !== undefined) row.application_notes = patch.applicationNotes;
  if (patch.applications !== undefined) row.applications = patch.applications;
  if (patch.brand !== undefined) row.brand = patch.brand;
  if (patch.supplier !== undefined) row.supplier = patch.supplier;
  if (patch.category !== undefined) row.category = patch.category;
  if (patch.subcategory !== undefined) row.subcategory = patch.subcategory;
  if (patch.isOriginal !== undefined) row.is_original = patch.isOriginal;
  if (patch.imageUrl !== undefined) row.image_url = patch.imageUrl;
  if (patch.unitCost !== undefined) row.unit_cost = patch.unitCost;
  if (patch.unitPrice !== undefined) row.unit_price = patch.unitPrice;
  if (patch.marginPercent !== undefined) row.margin_percent = patch.marginPercent;
  if (patch.gtin !== undefined) row.gtin = patch.gtin;
  if (patch.sefazStatus !== undefined) row.sefaz_status = patch.sefazStatus;
  if (patch.sefazCheckedAt !== undefined) row.sefaz_checked_at = patch.sefazCheckedAt;
  if (patch.supplierCode !== undefined) row.supplier_code = patch.supplierCode;
  if (patch.reference !== undefined) row.reference = patch.reference;
  if (patch.group !== undefined) row.group_label = patch.group;
  if (patch.partType !== undefined) row.part_type = patch.partType;
  if (patch.priceTables !== undefined) row.price_tables = patch.priceTables;
  if (patch.fiscal !== undefined) row.fiscal = patch.fiscal;
  if (patch.weightKg !== undefined) row.weight_kg = patch.weightKg;
  if (patch.storageLocation !== undefined) row.storage_location = patch.storageLocation;
  if (patch.boxQuantity !== undefined) row.box_quantity = patch.boxQuantity;
  if (patch.fractionable !== undefined) row.fractionable = patch.fractionable;
  if (patch.unitOfMeasure !== undefined) row.unit_of_measure = patch.unitOfMeasure;
  if (patch.suppliers !== undefined) row.suppliers = patch.suppliers;
  if (patch.averageCost !== undefined) row.average_cost = patch.averageCost;
  if (patch.stockAvailable !== undefined) row.stock_available = patch.stockAvailable;
  if (patch.stockMinimum !== undefined) row.stock_minimum = patch.stockMinimum;
  if (patch.division !== undefined) row.division = patch.division;
  if (patch.active !== undefined) row.active = patch.active;
  return row;
}

/**
 * Maps a create input to a full insert row. Generates the stable `part-...` id
 * and the createdAt/updatedAt timestamps, mirroring the mock provider.
 */
function createInputToRow(
  input: Omit<IPart, "id" | "createdAt" | "updatedAt">,
): Record<string, unknown> {
  const now: ISO8601 = new Date().toISOString();
  return {
    ...partPatchToRow(input),
    id: `part-${crypto.randomUUID()}`,
    store_id: input.storeId ?? null,
    created_at: now,
    updated_at: now,
  };
}

export const supabasePartsProvider: IPartsProvider = {
  async list(params: IListPartsParams = {}): Promise<IPaginatedResult<IPart>> {
    const page = Math.max(1, Math.floor(params.page ?? 1));
    const pageSize = Math.max(1, Math.min(200, Math.floor(params.pageSize ?? 20)));
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    let query = getSupabaseClient().from(TABLE).select(COLUMNS, { count: "exact" });

    if (typeof params.active === "boolean") query = query.eq("active", params.active);
    if (params.brand) query = query.eq("brand", params.brand);
    if (params.inStock) query = query.gt("stock_available", 0);
    if (params.oem) query = query.ilike("oem_codes_text", `%${params.oem}%`);
    if (params.search) {
      const q = params.search;
      query = query.or(
        `name.ilike.%${q}%,sku.ilike.%${q}%,brand.ilike.%${q}%,oem_codes_text.ilike.%${q}%`,
      );
    }

    const column = ORDER_BY_COLUMN[params.orderBy ?? "name"];
    const ascending = params.orderDir !== "desc";
    query = query.order(column, { ascending }).range(from, to);

    const { data, error, count } = await query;
    if (error) throw new Error(`[supabase] parts.list failed: ${error.message}`);
    return {
      data: (data as PartRow[]).map(rowToPart),
      total: count ?? 0,
      page,
      pageSize,
    };
  },

  async get(id: ID): Promise<IPart> {
    const { data, error } = await getSupabaseClient()
      .from(TABLE)
      .select(COLUMNS)
      .eq("id", id)
      .single();
    if (error) throw new Error(`[supabase] parts.get(${id}) failed: ${error.message}`);
    return rowToPart(data as PartRow);
  },

  async findByOem(code: ID): Promise<IPart[]> {
    const { data, error } = await getSupabaseClient()
      .from(TABLE)
      .select(COLUMNS)
      .contains("oem_codes", [code]);
    if (error) throw new Error(`[supabase] parts.findByOem(${code}) failed: ${error.message}`);
    return (data as PartRow[]).map(rowToPart);
  },

  async listEquivalents(id: ID): Promise<IPart[]> {
    const client = getSupabaseClient();
    const { data: partData, error: partError } = await client
      .from(TABLE)
      .select("equivalent_part_ids")
      .eq("id", id)
      .single();
    if (partError) {
      throw new Error(`[supabase] parts.listEquivalents(${id}) failed: ${partError.message}`);
    }
    const ids = (partData as Pick<PartRow, "equivalent_part_ids">).equivalent_part_ids ?? [];
    if (ids.length === 0) return [];

    const { data, error } = await client.from(TABLE).select(COLUMNS).in("id", ids);
    if (error) {
      throw new Error(`[supabase] parts.listEquivalents(${id}) failed: ${error.message}`);
    }
    return (data as PartRow[]).map(rowToPart);
  },

  async create(input: Omit<IPart, "id" | "createdAt" | "updatedAt">): Promise<IPart> {
    const { data, error } = await getSupabaseClient()
      .from(TABLE)
      .insert(createInputToRow(input))
      .select(COLUMNS)
      .single();
    if (error) throw new Error(`[supabase] parts.create failed: ${error.message}`);
    return rowToPart(data as PartRow);
  },

  async update(id: ID, patch: Partial<IPart>): Promise<IPart> {
    const { data, error } = await getSupabaseClient()
      .from(TABLE)
      .update({ ...partPatchToRow(patch), updated_at: new Date().toISOString() })
      .eq("id", id)
      .select(COLUMNS)
      .single();
    if (error) throw new Error(`[supabase] parts.update(${id}) failed: ${error.message}`);
    return rowToPart(data as PartRow);
  },

  async delete(id: ID): Promise<void> {
    const { error } = await getSupabaseClient().from(TABLE).delete().eq("id", id);
    if (error) throw new Error(`[supabase] parts.delete(${id}) failed: ${error.message}`);
  },
};
