import type { ID, ISupplier } from "@/shared/types";
import type { IListSuppliersParams, ISuppliersProvider } from "../../contracts/suppliers";
import type { IPaginatedResult } from "../../contracts/_shared";
import { getSupabaseClient } from "@/shared/lib/supabase";

/**
 * Implementação Supabase de {@link ISuppliersProvider} (PRD-216).
 *
 * `suppliers` snake_case ↔ {@link ISupplier} camelCase via `rowToSupplier`.
 * O unique index `(store_id, cnpj)` é a barreira real do vínculo por CNPJ —
 * `findByCnpj` usa `maybeSingle`, então CNPJ novo devolve `null` em vez de
 * erro, que é o caminho normal da importação, não uma exceção.
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
  active: boolean;
  created_from_xml: boolean;
  created_at: string;
  updated_at: string;
}

const TABLE = "suppliers";
const COLUMNS =
  "id, store_id, cnpj, corporate_name, trade_name, state_registration, address, payment_terms, contact_name, contact_email, contact_phone, category, active, created_from_xml, created_at, updated_at";

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
  if (patch.active !== undefined) row.active = patch.active;
  return row;
}

export const supabaseSuppliersProvider: ISuppliersProvider = {
  async list(params: IListSuppliersParams = {}): Promise<IPaginatedResult<ISupplier>> {
    const page = params.page ?? 1;
    const pageSize = params.pageSize ?? 20;

    let query = getSupabaseClient().from(TABLE).select(COLUMNS, { count: "exact" });
    if (params.storeId) query = query.eq("store_id", params.storeId);
    if (params.active !== undefined) query = query.eq("active", params.active);
    if (params.search) {
      const digits = params.search.replace(/\D/g, "");
      query = digits
        ? query.or(`corporate_name.ilike.%${params.search}%,cnpj.ilike.%${digits}%`)
        : query.ilike("corporate_name", `%${params.search}%`);
    }

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
};
