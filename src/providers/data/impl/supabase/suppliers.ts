import type { ID, ISupplier, ISupplierEntry, ISupplierStats } from "@/shared/types";
import type {
  ICreateSupplierInput,
  IListSuppliersParams,
  ISuppliersProvider,
  IUpdateSupplierPatch,
} from "../../contracts/suppliers";
import type { IPaginatedResult } from "../../contracts/_shared";
import { FETCH_ALL_PAGE_SIZE } from "../../contracts/_shared";
import { getSupabaseClient } from "@/shared/lib/supabase";
import {
  normalizeSupplierName,
  SUPPLIER_NAME_ALIASES,
} from "@/features/suppliers/engine/supplierName";
import { fetchLargePage } from "./_pagination";

/**
 * Supabase implementation of {@link ISuppliersProvider}.
 *
 * `stats`/`statsMany` are the interesting half. There is no `supplier_id` on
 * `parts` yet, so the join key is the NORMALIZED NAME: we read the catalog's
 * `supplier` and `suppliers` (jsonb entry history) columns and match in
 * memory. That is why they are separate calls, not folded into `get`/`list`
 * — they cost a catalog scan and only the rail, the drawer and the list's
 * KPI strip/optional columns want them.
 *
 * Both paginate the `parts` read with {@link fetchLargePage} instead of a
 * bare `.select()`: PostgREST caps any single request at `db-max-rows` (1000
 * rows), and the catalog has 4.005 parts — an unpaginated read silently
 * truncates to an arbitrary ~25% slice, which is exactly wrong for numbers
 * rendered as confident totals. `statsMany` additionally makes this ONE pass
 * shared across every id in the batch (bucketed by normalized name), instead
 * of one pass per supplier — see its own comment below for the request-count
 * story.
 */

interface SupplierRow {
  id: string;
  store_id: string;
  name: string;
  trade_name: string | null;
  document: string | null;
  category: ISupplier["category"];
  payment_terms: string | null;
  lead_time_days: number | null;
  contact_name: string | null;
  contact_phone: string | null;
  preferred_payment_method: ISupplier["preferredPaymentMethod"] | null;
  supplied_items: string[] | null;
  status: ISupplier["status"];
  registry_status: string | null;
  registry_activity: string | null;
  city: string | null;
  state: string | null;
  source: ISupplier["source"];
  notes: string | null;
  created_at: string;
  updated_at: string;
}

/** Shape of one element of `parts.suppliers` (jsonb), written by the DINTEC import. */
interface PartEntryJson {
  name?: string;
  invoiceNumber?: string;
  invoiceDate?: string;
  cost?: number;
  quantity?: number;
}

interface PartRow {
  id: string;
  name: string;
  supplier: string | null;
  suppliers: PartEntryJson[] | null;
}

const TABLE = "suppliers";
const PARTS_TABLE = "parts";
const COLUMNS =
  "id, store_id, name, trade_name, document, category, payment_terms, lead_time_days, " +
  "contact_name, contact_phone, preferred_payment_method, supplied_items, status, " +
  "registry_status, registry_activity, city, state, source, notes, created_at, updated_at";

function rowToSupplier(row: SupplierRow): ISupplier {
  return {
    id: row.id,
    storeId: row.store_id,
    name: row.name,
    tradeName: row.trade_name ?? undefined,
    document: row.document ?? undefined,
    category: row.category,
    paymentTerms: row.payment_terms ?? undefined,
    leadTimeDays: row.lead_time_days ?? undefined,
    contactName: row.contact_name ?? undefined,
    contactPhone: row.contact_phone ?? undefined,
    preferredPaymentMethod: row.preferred_payment_method ?? undefined,
    suppliedItems: row.supplied_items ?? [],
    status: row.status,
    registryStatus: row.registry_status ?? undefined,
    registryActivity: row.registry_activity ?? undefined,
    city: row.city ?? undefined,
    state: row.state ?? undefined,
    source: row.source,
    notes: row.notes ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * `!== undefined` means "the caller sent this field, apply it" — `undefined`
 * itself always means "leave the column untouched," never "clear it." For
 * every OPTIONAL TEXT column, an applied value additionally goes through
 * `|| null`: `SupplierFormDialog` sends `""` (never `undefined`) for a field
 * the user has cleared, exactly so that case reaches here and becomes a real
 * `null` — the same convention `document` already used before this
 * function grew the rest of the optional columns. `leadTimeDays` is
 * deliberately excluded: it's numeric, and `0` is a legitimate lead time
 * that `|| null` would wrongly discard. `preferredPaymentMethod` is also
 * excluded: it's a typed enum with no `""` member, so the contract can't
 * carry a clear-intent through it — `undefined` still just means "leave it."
 */
function patchToRow(patch: IUpdateSupplierPatch): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (patch.name !== undefined) row.name = patch.name;
  if (patch.tradeName !== undefined) row.trade_name = patch.tradeName || null;
  if (patch.document !== undefined) row.document = patch.document || null;
  if (patch.category !== undefined) row.category = patch.category;
  if (patch.paymentTerms !== undefined) row.payment_terms = patch.paymentTerms || null;
  if (patch.leadTimeDays !== undefined) row.lead_time_days = patch.leadTimeDays;
  if (patch.contactName !== undefined) row.contact_name = patch.contactName || null;
  if (patch.contactPhone !== undefined) row.contact_phone = patch.contactPhone || null;
  if (patch.preferredPaymentMethod !== undefined)
    row.preferred_payment_method = patch.preferredPaymentMethod;
  if (patch.suppliedItems !== undefined) row.supplied_items = patch.suppliedItems;
  if (patch.status !== undefined) row.status = patch.status;
  if (patch.registryStatus !== undefined) row.registry_status = patch.registryStatus || null;
  if (patch.registryActivity !== undefined) row.registry_activity = patch.registryActivity || null;
  if (patch.city !== undefined) row.city = patch.city || null;
  if (patch.state !== undefined) row.state = patch.state || null;
  if (patch.notes !== undefined) row.notes = patch.notes || null;
  return row;
}

/** Collapses a raw catalog name to the same key the engine uses. */
function joinKey(raw: string): string {
  const key = normalizeSupplierName(raw);
  return SUPPLIER_NAME_ALIASES[key] ? normalizeSupplierName(SUPPLIER_NAME_ALIASES[key]) : key;
}

/**
 * Turns one supplier's bucket of matched `parts` rows into its
 * {@link ISupplierStats}. Pure — shared by `stats` (one supplier) and
 * `statsMany` (a whole batch) so the two can never drift.
 */
function statsFromParts(supplierId: ID, key: string, parts: PartRow[]): ISupplierStats {
  const entries: ISupplierEntry[] = [];
  for (const part of parts) {
    for (const raw of part.suppliers ?? []) {
      // A part's entry list can name a different supplier than the part's
      // own `supplier` column — trust the entry's own name when present.
      if (raw.name && joinKey(raw.name) !== key) continue;
      entries.push({
        invoiceNumber: raw.invoiceNumber,
        invoiceDate: raw.invoiceDate,
        cost: raw.cost ?? 0,
        quantity: raw.quantity ?? 0,
        partId: part.id,
        partName: part.name,
      });
    }
  }

  entries.sort((a, b) => (b.invoiceDate ?? "").localeCompare(a.invoiceDate ?? ""));

  const now = new Date();
  const monthly = Array.from({ length: 12 }, () => 0);
  let total = 0;
  for (const entry of entries) {
    if (!entry.invoiceDate) continue;
    const when = new Date(entry.invoiceDate);
    const monthsAgo =
      (now.getFullYear() - when.getFullYear()) * 12 + (now.getMonth() - when.getMonth());
    if (monthsAgo < 0 || monthsAgo > 11) continue;
    const amount = entry.cost * (entry.quantity || 1);
    // `noUncheckedIndexedAccess` types `monthly[idx]` as `number | undefined`
    // even though `Array.from({ length: 12 }, () => 0)` guarantees every
    // index is populated — `?? 0` satisfies the checker without changing
    // behavior.
    const idx = 11 - monthsAgo;
    monthly[idx] = (monthly[idx] ?? 0) + amount;
    total += amount;
  }

  return {
    supplierId,
    linkedParts: parts.length,
    purchasesLast12Months: total,
    lastEntries: entries.slice(0, 8),
    monthlyPurchases: monthly,
  };
}

/**
 * One paginated pass over every `parts` row of `storeId`, bucketed by the
 * normalized join key of `parts.supplier`. Parts with no supplier text are
 * dropped (they cannot belong to any bucket).
 */
async function fetchPartsBySupplierKey(storeId: ID): Promise<Map<string, PartRow[]>> {
  const buildQuery = () =>
    getSupabaseClient()
      .from(PARTS_TABLE)
      .select("id, name, supplier, suppliers", { count: "exact" })
      .eq("store_id", storeId);

  const { data } = await fetchLargePage<PartRow>(
    async (rangeFrom, rangeTo) => {
      const { data, error, count } = await buildQuery()
        .order("id", { ascending: true })
        .range(rangeFrom, rangeTo);
      if (error) throw new Error(`[supabase] suppliers.stats scan failed: ${error.message}`);
      return { data: (data ?? []) as unknown as PartRow[], count: count ?? 0 };
    },
    0,
    FETCH_ALL_PAGE_SIZE,
  );

  const buckets = new Map<string, PartRow[]>();
  for (const part of data) {
    if (!part.supplier) continue;
    const key = joinKey(part.supplier);
    const bucket = buckets.get(key);
    if (bucket) bucket.push(part);
    else buckets.set(key, [part]);
  }
  return buckets;
}

/** Builds the PostgREST `.or()` expression for a free-text supplier search, or
 *  `null` when the term is blank. Mirrors `buildContactSearchOr` in
 *  `contacts.ts`: `,`/`()` are `.or()` delimiters and are neutralized to
 *  spaces, and `*` — not `%` — is the ilike wildcard inside this compound
 *  filter string form. Exported for unit testing. */
export function buildSupplierSearchOr(search: string): string | null {
  const term = search.trim();
  if (!term) return null;
  const safe = term.replace(/[,()]/g, " ");
  const filters = [`name.ilike.*${safe}*`, `trade_name.ilike.*${safe}*`];
  const digits = term.replace(/\D/g, "");
  if (digits) filters.push(`document.ilike.*${digits}*`);
  return filters.join(",");
}

export const supabaseSuppliersProvider: ISuppliersProvider = {
  async list(params: IListSuppliersParams = {}): Promise<IPaginatedResult<ISupplier>> {
    const page = params.page ?? 1;
    const pageSize = params.pageSize ?? 50;
    const from = (page - 1) * pageSize;

    let query = getSupabaseClient()
      .from(TABLE)
      .select(COLUMNS, { count: "exact" })
      .order("name", { ascending: true })
      .range(from, from + pageSize - 1);

    if (params.category) query = query.eq("category", params.category);
    if (params.status) query = query.eq("status", params.status);
    const searchOr = params.search ? buildSupplierSearchOr(params.search) : null;
    if (searchOr) query = query.or(searchOr);

    const { data, error, count } = await query;
    if (error) throw new Error(`[supabase] suppliers.list failed: ${error.message}`);

    return {
      data: (data as unknown as SupplierRow[]).map(rowToSupplier),
      total: count ?? 0,
      page,
      pageSize,
    };
  },

  async get(id: ID): Promise<ISupplier> {
    const { data, error } = await getSupabaseClient()
      .from(TABLE)
      .select(COLUMNS)
      .eq("id", id)
      .single();
    if (error) throw new Error(`[supabase] suppliers.get(${id}) failed: ${error.message}`);
    return rowToSupplier(data as unknown as SupplierRow);
  },

  async create(input: ICreateSupplierInput): Promise<ISupplier> {
    const id: ID = crypto.randomUUID();
    const now = new Date().toISOString();
    const { data, error } = await getSupabaseClient()
      .from(TABLE)
      .insert({
        id,
        store_id: input.storeId,
        name: input.name,
        // Optional text columns use `|| null` (not `??`) so a blank string
        // from the form is stored as `null`, not literal "" — same
        // convention `patchToRow` (below) uses for updates.
        trade_name: input.tradeName || null,
        document: input.document || null,
        category: input.category,
        payment_terms: input.paymentTerms || null,
        lead_time_days: input.leadTimeDays ?? null,
        contact_name: input.contactName || null,
        contact_phone: input.contactPhone || null,
        preferred_payment_method: input.preferredPaymentMethod ?? null,
        supplied_items: input.suppliedItems ?? [],
        status: "active",
        registry_status: input.registryStatus || null,
        registry_activity: input.registryActivity || null,
        city: input.city || null,
        state: input.state || null,
        source: "manual",
        notes: input.notes || null,
        created_at: now,
        updated_at: now,
      })
      .select(COLUMNS)
      .single();
    if (error) {
      // 23505 = unique violation on (store_id, document).
      if (error.code === "23505") throw new Error("CNPJ já cadastrado nesta loja.");
      throw new Error(`[supabase] suppliers.create failed: ${error.message}`);
    }
    return rowToSupplier(data as unknown as SupplierRow);
  },

  async update(id: ID, patch: IUpdateSupplierPatch): Promise<ISupplier> {
    const { data, error } = await getSupabaseClient()
      .from(TABLE)
      .update({ ...patchToRow(patch), updated_at: new Date().toISOString() })
      .eq("id", id)
      .select(COLUMNS)
      .single();
    if (error) {
      if (error.code === "23505") throw new Error("CNPJ já cadastrado nesta loja.");
      throw new Error(`[supabase] suppliers.update(${id}) failed: ${error.message}`);
    }
    return rowToSupplier(data as unknown as SupplierRow);
  },

  async archive(id: ID): Promise<ISupplier> {
    return supabaseSuppliersProvider.update(id, { status: "inactive" });
  },

  async stats(id: ID): Promise<ISupplierStats> {
    const supplier = await supabaseSuppliersProvider.get(id);
    const key = joinKey(supplier.name);
    const buckets = await fetchPartsBySupplierKey(supplier.storeId);
    return statsFromParts(id, key, buckets.get(key) ?? []);
  },

  /**
   * Batched `stats`. For a 126-supplier list this issues exactly:
   *   1 request  — suppliers whose id is in `ids` (`.in("id", ids)`)
   *   ~5 requests — one paginated pass over the store's ~4.005 `parts`
   *                 rows (1000-row PostgREST chunks via `fetchLargePage`)
   * = ~6 requests total and one catalog scan, versus the previous
   * `Promise.all(ids.map(stats))`, which cost 2 requests and a full
   * (truncated) catalog scan PER supplier — ~252 requests and ~126.000 part
   * rows read for the same 126 suppliers.
   *
   * Suppliers are grouped by `storeId` so a mixed-store `ids` array (not how
   * any current caller uses this — `useSuppliersStatsIndex` always passes
   * ids from one store's list — but not ruled out by the signature either)
   * still gets one scan per distinct store rather than a wrong shared scan.
   */
  async statsMany(ids: ID[]): Promise<Map<ID, ISupplierStats>> {
    const result = new Map<ID, ISupplierStats>();
    if (ids.length === 0) return result;

    const { data, error } = await getSupabaseClient().from(TABLE).select(COLUMNS).in("id", ids);
    if (error) throw new Error(`[supabase] suppliers.statsMany failed: ${error.message}`);
    const suppliers = (data as unknown as SupplierRow[]).map(rowToSupplier);

    const byStore = new Map<ID, ISupplier[]>();
    for (const supplier of suppliers) {
      const bucket = byStore.get(supplier.storeId);
      if (bucket) bucket.push(supplier);
      else byStore.set(supplier.storeId, [supplier]);
    }

    for (const [storeId, storeSuppliers] of byStore) {
      const buckets = await fetchPartsBySupplierKey(storeId);
      for (const supplier of storeSuppliers) {
        const key = joinKey(supplier.name);
        result.set(supplier.id, statsFromParts(supplier.id, key, buckets.get(key) ?? []));
      }
    }

    return result;
  },
};
