import type { ID, ISupplier, ISupplierEntry, ISupplierStats } from "@/shared/types";
import type {
  ICreateSupplierInput,
  IListSuppliersParams,
  ISuppliersProvider,
  IUpdateSupplierPatch,
} from "../../contracts/suppliers";
import type { IPaginatedResult } from "../../contracts/_shared";
import { getSupabaseClient } from "@/shared/lib/supabase";
import {
  normalizeSupplierName,
  SUPPLIER_NAME_ALIASES,
} from "@/features/suppliers/engine/supplierName";

/**
 * Supabase implementation of {@link ISuppliersProvider}.
 *
 * `stats` is the interesting half. There is no `supplier_id` on `parts` yet, so
 * the join key is the NORMALIZED NAME: we read the catalog's `supplier` and
 * `suppliers` (jsonb entry history) columns and match in memory. That is why
 * `stats` is a separate call and not folded into `get` — it costs a catalog
 * scan and only the rail and the drawer want it.
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

function patchToRow(patch: IUpdateSupplierPatch): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (patch.name !== undefined) row.name = patch.name;
  if (patch.tradeName !== undefined) row.trade_name = patch.tradeName;
  if (patch.document !== undefined) row.document = patch.document || null;
  if (patch.category !== undefined) row.category = patch.category;
  if (patch.paymentTerms !== undefined) row.payment_terms = patch.paymentTerms;
  if (patch.leadTimeDays !== undefined) row.lead_time_days = patch.leadTimeDays;
  if (patch.contactName !== undefined) row.contact_name = patch.contactName;
  if (patch.contactPhone !== undefined) row.contact_phone = patch.contactPhone;
  if (patch.preferredPaymentMethod !== undefined)
    row.preferred_payment_method = patch.preferredPaymentMethod;
  if (patch.suppliedItems !== undefined) row.supplied_items = patch.suppliedItems;
  if (patch.status !== undefined) row.status = patch.status;
  if (patch.registryStatus !== undefined) row.registry_status = patch.registryStatus;
  if (patch.registryActivity !== undefined) row.registry_activity = patch.registryActivity;
  if (patch.city !== undefined) row.city = patch.city;
  if (patch.state !== undefined) row.state = patch.state;
  if (patch.notes !== undefined) row.notes = patch.notes;
  return row;
}

/** Collapses a raw catalog name to the same key the engine uses. */
function joinKey(raw: string): string {
  const key = normalizeSupplierName(raw);
  return SUPPLIER_NAME_ALIASES[key] ? normalizeSupplierName(SUPPLIER_NAME_ALIASES[key]) : key;
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
    if (params.search) {
      const digits = params.search.replace(/\D/g, "");
      const clauses = [`name.ilike.%${params.search}%`, `trade_name.ilike.%${params.search}%`];
      if (digits.length >= 3) clauses.push(`document.ilike.%${digits}%`);
      query = query.or(clauses.join(","));
    }

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
        trade_name: input.tradeName ?? null,
        document: input.document || null,
        category: input.category,
        payment_terms: input.paymentTerms ?? null,
        lead_time_days: input.leadTimeDays ?? null,
        contact_name: input.contactName ?? null,
        contact_phone: input.contactPhone ?? null,
        preferred_payment_method: input.preferredPaymentMethod ?? null,
        supplied_items: input.suppliedItems ?? [],
        status: "active",
        registry_status: input.registryStatus ?? null,
        registry_activity: input.registryActivity ?? null,
        city: input.city ?? null,
        state: input.state ?? null,
        source: "manual",
        notes: input.notes ?? null,
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

    const { data, error } = await getSupabaseClient()
      .from(PARTS_TABLE)
      .select("id, name, supplier, suppliers")
      .eq("store_id", supplier.storeId);
    if (error) throw new Error(`[supabase] suppliers.stats(${id}) failed: ${error.message}`);

    const parts = (data ?? []) as unknown as PartRow[];
    const mine = parts.filter((p) => p.supplier && joinKey(p.supplier) === key);

    const entries: ISupplierEntry[] = [];
    for (const part of mine) {
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
      monthly[11 - monthsAgo] += amount;
      total += amount;
    }

    return {
      supplierId: id,
      linkedParts: mine.length,
      purchasesLast12Months: total,
      lastEntries: entries.slice(0, 8),
      monthlyPurchases: monthly,
    };
  },
};
