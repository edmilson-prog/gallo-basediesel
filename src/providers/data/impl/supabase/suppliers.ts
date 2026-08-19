import type {
  ID,
  ISupplier,
  ISupplierEntry,
  ISupplierStats,
  IPendingSupplier,
} from "@/shared/types";
import type { IListSuppliersParams, ISuppliersProvider } from "../../contracts/suppliers";
import type { IPaginatedResult } from "../../contracts/_shared";
import { FETCH_ALL_PAGE_SIZE } from "../../contracts/_shared";
import { getSupabaseClient } from "@/shared/lib/supabase";
import { chunk } from "@/shared/utils/chunk";
import {
  canonicalSupplierName,
  normalizeSupplierName,
  SUPPLIER_NAME_ALIASES,
} from "@/features/suppliers/engine/supplierName";
import { fetchLargePage } from "./_pagination";

/**
 * Implementação Supabase de {@link ISuppliersProvider} (PRD-216).
 *
 * `suppliers` snake_case ↔ {@link ISupplier} camelCase via `rowToSupplier`.
 * O unique index `(store_id, cnpj)` é a barreira real do vínculo por CNPJ —
 * `findByCnpj` usa `maybeSingle`, então CNPJ novo devolve `null` em vez de
 * erro, que é o caminho normal da importação, não uma exceção.
 *
 * `stats`/`statsMany`/`pendingFromCatalog` são a extensão para a tela de
 * gestão. Não há `supplier_id` em `parts` ainda, então a chave de junção é o
 * NOME NORMALIZADO: lemos `parts.supplier` (texto) e `parts.suppliers` —
 * ambas colunas da tabela `parts`, não da tabela `suppliers` — e casamos em
 * memória. `parts.suppliers` é jsonb e carrega o histórico de entradas
 * (uma linha por nota/lote). É por isso que essas três operações são
 * chamadas separadas, não dobradas em `get`/`list`: custam um scan do
 * catálogo, e só o rail, o drawer e a fila de pendentes querem isso.
 *
 * Todas paginam a leitura de `parts` com {@link fetchLargePage} em vez de um
 * `.select()` cru: o PostgREST limita qualquer request a `db-max-rows` (1000
 * linhas), e o catálogo tem 4.005 peças — uma leitura sem paginação trunca
 * silenciosamente para uma fatia arbitrária de ~25%, o pior resultado
 * possível para números exibidos como totais confiáveis.
 */

interface SupplierRow {
  id: string;
  store_id: string;
  cnpj: string;
  corporate_name: string;
  trade_name: string | null;
  state_registration: string | null;
  address: string | null;
  payment_terms: string | null;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  category: string | null;
  lead_time_days: number | null;
  preferred_payment_method: ISupplier["preferredPaymentMethod"] | null;
  supplied_items: string[] | null;
  registry_status: string | null;
  registry_activity: string | null;
  city: string | null;
  state: string | null;
  notes: string | null;
  active: boolean;
  created_from_xml: boolean;
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

/** Minimal shape for the `pendingFromCatalog` scan — only what it needs. */
interface PartSupplierRow {
  id: string;
  supplier: string | null;
}

const TABLE = "suppliers";
const PARTS_TABLE = "parts";
const COLUMNS =
  "id, store_id, cnpj, corporate_name, trade_name, state_registration, address, payment_terms, " +
  "contact_name, contact_email, contact_phone, category, lead_time_days, preferred_payment_method, " +
  "supplied_items, registry_status, registry_activity, city, state, notes, active, created_from_xml, " +
  "created_at, updated_at";

/** Cap on ids per `.in("id", …)` in `statsMany`, same idiom and value as
 *  `messages.ts`'s `ANALYTICS_IN_CHUNK_SIZE` — keeps the request-line length
 *  well under the edge's URL limit (~39 chars/id encoded → 120 ids ≈ 4.7 KB).
 *  The supplier list is already ~124 rows on day one, over a single-request
 *  `.in()` on first load, not just "will break as data grows". */
const SUPPLIERS_IN_CHUNK_SIZE = 120;

function rowToSupplier(row: SupplierRow): ISupplier {
  return {
    id: row.id,
    storeId: row.store_id,
    cnpj: row.cnpj,
    corporateName: row.corporate_name,
    tradeName: row.trade_name ?? undefined,
    stateRegistration: row.state_registration ?? undefined,
    address: row.address ?? undefined,
    paymentTerms: row.payment_terms ?? undefined,
    contactName: row.contact_name ?? undefined,
    contactEmail: row.contact_email ?? undefined,
    contactPhone: row.contact_phone ?? undefined,
    category: row.category ?? undefined,
    leadTimeDays: row.lead_time_days ?? undefined,
    preferredPaymentMethod: row.preferred_payment_method ?? undefined,
    suppliedItems: row.supplied_items ?? undefined,
    registryStatus: row.registry_status ?? undefined,
    registryActivity: row.registry_activity ?? undefined,
    city: row.city ?? undefined,
    state: row.state ?? undefined,
    notes: row.notes ?? undefined,
    active: row.active,
    createdFromXml: row.created_from_xml,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function supplierToRow(patch: Partial<ISupplier>): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (patch.cnpj !== undefined) row.cnpj = patch.cnpj.replace(/\D/g, "");
  if (patch.corporateName !== undefined) row.corporate_name = patch.corporateName;
  if (patch.tradeName !== undefined) row.trade_name = patch.tradeName ?? null;
  if (patch.stateRegistration !== undefined)
    row.state_registration = patch.stateRegistration ?? null;
  if (patch.address !== undefined) row.address = patch.address ?? null;
  if (patch.paymentTerms !== undefined) row.payment_terms = patch.paymentTerms ?? null;
  if (patch.contactName !== undefined) row.contact_name = patch.contactName ?? null;
  if (patch.contactEmail !== undefined) row.contact_email = patch.contactEmail ?? null;
  if (patch.contactPhone !== undefined) row.contact_phone = patch.contactPhone ?? null;
  if (patch.category !== undefined) row.category = patch.category ?? null;
  if (patch.leadTimeDays !== undefined) row.lead_time_days = patch.leadTimeDays ?? null;
  if (patch.preferredPaymentMethod !== undefined)
    row.preferred_payment_method = patch.preferredPaymentMethod ?? null;
  if (patch.suppliedItems !== undefined) row.supplied_items = patch.suppliedItems ?? null;
  if (patch.registryStatus !== undefined) row.registry_status = patch.registryStatus ?? null;
  if (patch.registryActivity !== undefined) row.registry_activity = patch.registryActivity ?? null;
  if (patch.city !== undefined) row.city = patch.city ?? null;
  if (patch.state !== undefined) row.state = patch.state ?? null;
  if (patch.notes !== undefined) row.notes = patch.notes ?? null;
  if (patch.active !== undefined) row.active = patch.active;
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

/**
 * Same paginated idiom as {@link fetchPartsBySupplierKey}, but only reads
 * `id, supplier` — `pendingFromCatalog` doesn't need the name or the jsonb
 * entry history, just the raw supplier text per part.
 */
async function fetchPartSupplierNames(storeId: ID): Promise<string[]> {
  const buildQuery = () =>
    getSupabaseClient()
      .from(PARTS_TABLE)
      .select("id, supplier", { count: "exact" })
      .eq("store_id", storeId);

  const { data } = await fetchLargePage<PartSupplierRow>(
    async (rangeFrom, rangeTo) => {
      const { data, error, count } = await buildQuery()
        .order("id", { ascending: true })
        .range(rangeFrom, rangeTo);
      if (error)
        throw new Error(`[supabase] suppliers.pendingFromCatalog scan failed: ${error.message}`);
      return { data: (data ?? []) as unknown as PartSupplierRow[], count: count ?? 0 };
    },
    0,
    FETCH_ALL_PAGE_SIZE,
  );

  return data.map((part) => part.supplier).filter((name): name is string => Boolean(name));
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
  const filters = [`corporate_name.ilike.*${safe}*`];
  const digits = term.replace(/\D/g, "");
  if (digits) filters.push(`cnpj.ilike.*${digits}*`);
  return filters.join(",");
}

export const supabaseSuppliersProvider: ISuppliersProvider = {
  async list(params: IListSuppliersParams = {}): Promise<IPaginatedResult<ISupplier>> {
    const page = params.page ?? 1;
    const pageSize = params.pageSize ?? 20;

    let query = getSupabaseClient().from(TABLE).select(COLUMNS, { count: "exact" });
    if (params.storeId) query = query.eq("store_id", params.storeId);
    if (params.active !== undefined) query = query.eq("active", params.active);
    const searchOr = params.search ? buildSupplierSearchOr(params.search) : null;
    if (searchOr) query = query.or(searchOr);

    const { data, error, count } = await query
      .order("corporate_name", { ascending: true })
      .range((page - 1) * pageSize, page * pageSize - 1);
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

  async findByCnpj(cnpj: string, storeId: ID): Promise<ISupplier | null> {
    const { data, error } = await getSupabaseClient()
      .from(TABLE)
      .select(COLUMNS)
      .eq("cnpj", cnpj.replace(/\D/g, ""))
      .eq("store_id", storeId)
      .maybeSingle();
    if (error) throw new Error(`[supabase] suppliers.findByCnpj failed: ${error.message}`);
    return data ? rowToSupplier(data as unknown as SupplierRow) : null;
  },

  async create(input: Omit<ISupplier, "id" | "createdAt" | "updatedAt">): Promise<ISupplier> {
    const { data, error } = await getSupabaseClient()
      .from(TABLE)
      .insert({
        ...supplierToRow(input),
        store_id: input.storeId,
        created_from_xml: input.createdFromXml,
      })
      .select(COLUMNS)
      .single();
    if (error) throw new Error(`[supabase] suppliers.create failed: ${error.message}`);
    return rowToSupplier(data as unknown as SupplierRow);
  },

  async update(id: ID, patch: Partial<ISupplier>): Promise<ISupplier> {
    const { data, error } = await getSupabaseClient()
      .from(TABLE)
      .update({ ...supplierToRow(patch), updated_at: new Date().toISOString() })
      .eq("id", id)
      .select(COLUMNS)
      .single();
    if (error) throw new Error(`[supabase] suppliers.update(${id}) failed: ${error.message}`);
    return rowToSupplier(data as unknown as SupplierRow);
  },

  async archive(id: ID): Promise<ISupplier> {
    return supabaseSuppliersProvider.update(id, { active: false });
  },

  async stats(id: ID): Promise<ISupplierStats> {
    const supplier = await supabaseSuppliersProvider.get(id);
    const key = joinKey(supplier.corporateName);
    const buckets = await fetchPartsBySupplierKey(supplier.storeId);
    return statsFromParts(id, key, buckets.get(key) ?? []);
  },

  /**
   * Batched `stats`. For a ~126-supplier list this issues exactly:
   *   ~2 requests — suppliers whose id is in `ids`, chunked by
   *                 `SUPPLIERS_IN_CHUNK_SIZE` (120) so the `.in("id", …)`
   *                 request-line never overflows the edge's URL limit
   *   ~5 requests — one paginated pass over the store's ~4.005 `parts`
   *                 rows (1000-row PostgREST chunks via `fetchLargePage`)
   * = ~7 requests total and one catalog scan, versus a
   * `Promise.all(ids.map(stats))`, which would cost 2 requests and a full
   * (truncated) catalog scan PER supplier.
   *
   * Suppliers are grouped by `storeId` so a mixed-store `ids` array still
   * gets one scan per distinct store rather than a wrong shared scan.
   */
  async statsMany(ids: ID[]): Promise<Map<ID, ISupplierStats>> {
    const result = new Map<ID, ISupplierStats>();
    if (ids.length === 0) return result;

    // Chunked the same way messages.ts's conversation-id `.in()` is (see
    // `messages.ts:265-275`): dedup first so chunks are provably disjoint by
    // id (a duplicate straddling a chunk boundary would otherwise fetch that
    // supplier twice — harmless here since `rowToSupplier` is idempotent and
    // the result is a `Map` keyed by id, but there's no reason to do the
    // redundant work).
    const idBatches = chunk([...new Set(ids)], SUPPLIERS_IN_CHUNK_SIZE);
    const batchRows = await Promise.all(
      idBatches.map(async (batch) => {
        const { data, error } = await getSupabaseClient()
          .from(TABLE)
          .select(COLUMNS)
          .in("id", batch);
        if (error) throw new Error(`[supabase] suppliers.statsMany failed: ${error.message}`);
        return (data as unknown as SupplierRow[]).map(rowToSupplier);
      }),
    );
    const suppliers = batchRows.flat();

    const byStore = new Map<ID, ISupplier[]>();
    for (const supplier of suppliers) {
      const bucket = byStore.get(supplier.storeId);
      if (bucket) bucket.push(supplier);
      else byStore.set(supplier.storeId, [supplier]);
    }

    for (const [storeId, storeSuppliers] of byStore) {
      const buckets = await fetchPartsBySupplierKey(storeId);
      for (const supplier of storeSuppliers) {
        const key = joinKey(supplier.corporateName);
        result.set(supplier.id, statsFromParts(supplier.id, key, buckets.get(key) ?? []));
      }
    }

    return result;
  },

  /**
   * Which names in `parts.supplier` have no `suppliers` registry row yet.
   * `canonicalSupplierName` both drops placeholders ("Não informado" and
   * friends — 3.311 of the catalog's 4.005 parts) and resolves the tiny
   * alias table (e.g. "ufi" → "UFI Filters"), so grouping by
   * `normalizeSupplierName` of ITS OUTPUT — not of the raw string — keeps
   * alias variants in one bucket instead of splitting them into two pending
   * rows for the same real supplier.
   */
  async pendingFromCatalog(storeId: ID): Promise<IPendingSupplier[]> {
    const rawNames = await fetchPartSupplierNames(storeId);

    const groups = new Map<string, { displayName: string; partCount: number }>();
    for (const raw of rawNames) {
      const displayName = canonicalSupplierName(raw);
      if (!displayName) continue; // placeholder — nothing to queue
      const key = normalizeSupplierName(displayName);
      const group = groups.get(key);
      if (group) group.partCount += 1;
      else groups.set(key, { displayName, partCount: 1 });
    }

    // The store's own supplier list is ~126 rows today, far under the
    // 1000-row PostgREST cap that forces `parts` to paginate above — a
    // plain select is safe here without `fetchLargePage`.
    const { data: supplierRows, error } = await getSupabaseClient()
      .from(TABLE)
      .select("corporate_name")
      .eq("store_id", storeId);
    if (error)
      throw new Error(
        `[supabase] suppliers.pendingFromCatalog registry read failed: ${error.message}`,
      );

    const registeredKeys = new Set(
      ((supplierRows ?? []) as unknown as { corporate_name: string }[]).map((row) => {
        const canonical = canonicalSupplierName(row.corporate_name);
        return normalizeSupplierName(canonical ?? row.corporate_name);
      }),
    );

    const pending: IPendingSupplier[] = [];
    for (const [key, group] of groups) {
      if (registeredKeys.has(key)) continue;
      pending.push({ key, displayName: group.displayName, partCount: group.partCount });
    }
    pending.sort(
      (a, b) => b.partCount - a.partCount || a.displayName.localeCompare(b.displayName, "pt-BR"),
    );
    return pending;
  },
};
