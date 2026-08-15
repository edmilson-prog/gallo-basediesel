import type {
  Division,
  ID,
  IApplication,
  IPart,
  IPartCrossReference,
  IStorefrontConfig,
  PartCategory,
} from "@/shared/types";
import { DEFAULT_STOREFRONT_CONFIG } from "@/shared/types";
import type { IStorefrontProvider } from "../../contracts/storefront";
import { FETCH_ALL_PAGE_SIZE } from "../../contracts/_shared";
import { getSupabaseClient } from "@/shared/lib/supabase";
import { fetchLargePage } from "./_pagination";

/**
 * Supabase implementation of {@link IStorefrontProvider} (PRD-110 — anon wiring).
 *
 * Serves the public storefront as the `anon` Postgres role. It selects ONLY the
 * columns granted to `anon` (see migrations `storefront_anon_read` /
 * `storefront_anon_read_stock`) and maps them through {@link rowToPublicPart},
 * which defaults the required-but-omitted sensitive fields (`unitCost`,
 * `marginPercent`, `supplier`) so the {@link IPart} contract still holds — the
 * storefront never reads those.
 *
 * Config and best-seller ranking come from SECURITY DEFINER RPCs
 * (`storefront_config`, `storefront_top_selling`) so the full `stores.settings`
 * blob and the private `orders` table are never exposed to `anon`.
 */

const TABLE = "parts";

/**
 * Public column projection — must stay a subset of the columns granted to
 * `anon` on `public.parts`. Excludes: unit_cost, margin_percent, average_cost,
 * suppliers, supplier, supplier_code, price_tables, fiscal, sefaz_status,
 * sefaz_checked_at, storage_location.
 */
const PUBLIC_COLUMNS =
  "id, sku, name, description, oem_codes, equivalent_part_ids, cross_references, segment, application_notes, applications, brand, category, subcategory, is_original, image_url, unit_price, gtin, reference, group_label, part_type, weight_kg, box_quantity, fractionable, unit_of_measure, stock_available, stock_minimum, division, active, store_id, created_at, updated_at";

/**
 * Safety ceiling for the full public catalog fetch — the shared fetch-all
 * ceiling, fulfilled in sequential ≤1000-row chunks by `fetchLargePage`
 * (PostgREST caps any single request at 1000 rows). `FETCH_ALL_PAGE_SIZE`
 * must stay above the catalog size.
 */
const CATALOG_LIMIT = FETCH_ALL_PAGE_SIZE;
const DEFAULT_TOP_LIMIT = 2000;

/** Raw row shape returned when selecting {@link PUBLIC_COLUMNS}. */
interface PublicPartRow {
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
  category: PartCategory | null;
  subcategory: string | null;
  is_original: boolean | null;
  image_url: string | null;
  unit_price: number;
  gtin: string | null;
  reference: string | null;
  group_label: string | null;
  part_type: string | null;
  weight_kg: number | null;
  box_quantity: number | null;
  fractionable: boolean | null;
  unit_of_measure: string | null;
  stock_available: number;
  stock_minimum: number;
  division: Division;
  active: boolean;
  store_id: string | null;
  created_at: string;
  updated_at: string;
}

/** Row returned by the `storefront_top_selling` RPC. */
interface TopSellingRow {
  part_id: string;
}

function rowToPublicPart(row: PublicPartRow): IPart {
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
    // Not granted to the public role — defaulted to satisfy IPart. The
    // storefront never reads these.
    supplier: "",
    unitCost: 0,
    marginPercent: 0,
    category: row.category ?? undefined,
    subcategory: row.subcategory ?? undefined,
    isOriginal: row.is_original ?? undefined,
    imageUrl: row.image_url ?? undefined,
    unitPrice: row.unit_price,
    gtin: row.gtin ?? undefined,
    reference: row.reference ?? undefined,
    group: row.group_label ?? undefined,
    partType: row.part_type ?? undefined,
    weightKg: row.weight_kg ?? undefined,
    boxQuantity: row.box_quantity ?? undefined,
    fractionable: row.fractionable ?? undefined,
    unitOfMeasure: row.unit_of_measure ?? undefined,
    stockAvailable: row.stock_available,
    stockMinimum: row.stock_minimum,
    division: row.division,
    active: row.active,
    storeId: row.store_id ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export const supabaseStorefrontProvider: IStorefrontProvider = {
  async listCatalog(): Promise<IPart[]> {
    const { data } = await fetchLargePage<PublicPartRow>(
      async (rangeFrom, rangeTo) => {
        const { data, error, count } = await getSupabaseClient()
          .from(TABLE)
          .select(PUBLIC_COLUMNS, { count: "exact" })
          .order("name", { ascending: true })
          .order("id", { ascending: true })
          .range(rangeFrom, rangeTo);
        if (error) throw new Error(`[supabase] storefront.listCatalog failed: ${error.message}`);
        return { data: (data ?? []) as unknown as PublicPartRow[], count: count ?? 0 };
      },
      0,
      CATALOG_LIMIT,
    );
    return data.map(rowToPublicPart);
  },

  async getPart(id: ID): Promise<IPart> {
    const { data, error } = await getSupabaseClient()
      .from(TABLE)
      .select(PUBLIC_COLUMNS)
      .eq("id", id)
      .single();
    if (error) throw new Error(`[supabase] storefront.getPart(${id}) failed: ${error.message}`);
    return rowToPublicPart(data as PublicPartRow);
  },

  async listEquivalents(id: ID): Promise<IPart[]> {
    const client = getSupabaseClient();
    const { data: partData, error: partError } = await client
      .from(TABLE)
      .select("equivalent_part_ids")
      .eq("id", id)
      .single();
    if (partError) {
      throw new Error(`[supabase] storefront.listEquivalents(${id}) failed: ${partError.message}`);
    }
    const ids = (partData as Pick<PublicPartRow, "equivalent_part_ids">).equivalent_part_ids ?? [];
    if (ids.length === 0) return [];

    const { data, error } = await client.from(TABLE).select(PUBLIC_COLUMNS).in("id", ids);
    if (error) {
      throw new Error(`[supabase] storefront.listEquivalents(${id}) failed: ${error.message}`);
    }
    return (data as PublicPartRow[]).map(rowToPublicPart);
  },

  async getConfig(storeId: ID): Promise<IStorefrontConfig> {
    const { data, error } = await getSupabaseClient().rpc("storefront_config", {
      p_store_id: storeId,
    });
    if (error) {
      throw new Error(`[supabase] storefront.getConfig(${storeId}) failed: ${error.message}`);
    }
    return (data as IStorefrontConfig | null) ?? DEFAULT_STOREFRONT_CONFIG;
  },

  async listTopSellingIds(storeId: ID, limit = DEFAULT_TOP_LIMIT): Promise<ID[]> {
    const { data, error } = await getSupabaseClient().rpc("storefront_top_selling", {
      p_store_id: storeId,
      p_limit: limit,
    });
    if (error) {
      throw new Error(
        `[supabase] storefront.listTopSellingIds(${storeId}) failed: ${error.message}`,
      );
    }
    return (data as TopSellingRow[]).map((row) => row.part_id);
  },
};
