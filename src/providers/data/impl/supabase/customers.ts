import type {
  ABCClass,
  ICustomer,
  ICustomerAddress,
  ICustomerB2B,
  ICustomerB2C,
  ICustomerNote,
  ICustomerPurchaseStats,
  ID,
  IPortalContract,
  IPortalSettings,
} from "@/shared/types";
import type { IListCustomersParams, ICustomersProvider } from "../../contracts/customers";
import type { IPaginatedResult } from "../../contracts/_shared";
import { getSupabaseClient } from "@/shared/lib/supabase";

/**
 * Supabase implementation of {@link ICustomersProvider} (PRD-110+).
 *
 * snake_case `customers` table ↔ camelCase {@link ICustomer} via `rowToCustomer`.
 * {@link ICustomer} is a discriminated union over `type` (B2B/B2C); the variant
 * fields live in nullable columns and the row is reassembled into the correct
 * union member based on `type`. Free-text notes live in a dedicated
 * `customer_notes` table (one row per note) mapped by `rowToCustomerNote`.
 *
 * Reads work today under the temporary permissive RLS; the mutations
 * (create/update/delete/addNote) require the write policies that land with
 * PRD-103.
 */

interface CustomerRow {
  id: string;
  store_id: string;
  type: ICustomer["type"];
  email: string | null;
  phone: string;
  whatsapp_status: ICustomer["whatsappStatus"] | null;
  address: ICustomerAddress | null;
  seller_id: string;
  status: ICustomer["status"];
  tags: string[];
  first_purchase_at: string | null;
  last_purchase_at: string | null;
  converted_from_lead_id: string | null;
  converted_from_lead_at: string | null;
  converted_by_seller_id: string | null;
  purchase_stats: ICustomerPurchaseStats | null;
  abc_class: ABCClass | null;
  abc_share: number | null;
  overdue_titles_count: number | null;
  portal: IPortalSettings | null;
  is_guest_checkout: boolean | null;
  has_b2b_portal: boolean | null;
  portal_contract: IPortalContract | null;
  avatar_url: string | null;
  whatsapp_name: string | null;
  // B2B variant fields (null on B2C).
  cnpj: string | null;
  razao_social: string | null;
  nome_fantasia: string | null;
  contact_name: string | null;
  // B2C variant fields (null on B2B).
  cpf: string | null;
  full_name: string | null;
  created_at: string;
}

interface CustomerNoteRow {
  id: string;
  customer_id: string;
  author_id: string;
  content: string;
  created_at: string;
}

const TABLE = "customers";
const NOTES_TABLE = "customer_notes";
const COLUMNS =
  "id, store_id, type, email, phone, whatsapp_status, address, seller_id, status, tags, first_purchase_at, " +
  "last_purchase_at, converted_from_lead_id, converted_from_lead_at, converted_by_seller_id, " +
  "purchase_stats, abc_class, abc_share, overdue_titles_count, portal, is_guest_checkout, " +
  "has_b2b_portal, portal_contract, avatar_url, whatsapp_name, cnpj, razao_social, nome_fantasia, contact_name, cpf, " +
  "full_name, created_at";
const NOTE_COLUMNS = "id, customer_id, author_id, content, created_at";

function rowToCustomerNote(row: CustomerNoteRow): ICustomerNote {
  return {
    id: row.id,
    authorId: row.author_id,
    content: row.content,
    createdAt: row.created_at,
  };
}

/** Maps the shared base columns (present on both variants) onto a partial customer. */
function rowToCustomerBase(row: CustomerRow): Omit<ICustomer, "type" | "id"> {
  return {
    storeId: row.store_id,
    email: row.email ?? undefined,
    phone: row.phone,
    whatsappStatus: row.whatsapp_status ?? undefined,
    address: row.address ?? undefined,
    sellerId: row.seller_id,
    status: row.status,
    tags: row.tags,
    notes: [],
    firstPurchaseAt: row.first_purchase_at ?? undefined,
    lastPurchaseAt: row.last_purchase_at ?? undefined,
    convertedFromLeadId: row.converted_from_lead_id ?? undefined,
    convertedFromLeadAt: row.converted_from_lead_at ?? undefined,
    convertedBySellerId: row.converted_by_seller_id ?? undefined,
    purchaseStats: row.purchase_stats ?? undefined,
    abcClass: row.abc_class ?? undefined,
    abcShare: row.abc_share ?? undefined,
    overdueTitlesCount: row.overdue_titles_count ?? undefined,
    portal: row.portal ?? undefined,
    isGuestCheckout: row.is_guest_checkout ?? undefined,
    hasB2BPortal: row.has_b2b_portal ?? undefined,
    portalContract: row.portal_contract ?? undefined,
    avatarUrl: row.avatar_url ?? undefined,
    whatsappName: row.whatsapp_name ?? undefined,
    createdAt: row.created_at,
  } as Omit<ICustomer, "type" | "id">;
}

function rowToCustomer(row: CustomerRow, notes: ICustomerNote[] = []): ICustomer {
  const base = rowToCustomerBase(row);
  if (row.type === "B2B") {
    const b2b: ICustomerB2B = {
      ...base,
      id: row.id,
      type: "B2B",
      cnpj: row.cnpj ?? "",
      razaoSocial: row.razao_social ?? "",
      nomeFantasia: row.nome_fantasia ?? "",
      contactName: row.contact_name ?? "",
      notes,
    };
    return b2b;
  }
  const b2c: ICustomerB2C = {
    ...base,
    id: row.id,
    type: "B2C",
    cpf: row.cpf ?? "",
    fullName: row.full_name ?? "",
    notes,
  };
  return b2c;
}

/** Maps a camelCase patch to snake_case columns. `id`/`storeId`/`createdAt` and
 *  the embedded `notes` array are never written here. */
function customerPatchToRow(patch: Partial<ICustomer>): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (patch.type !== undefined) row.type = patch.type;
  if (patch.email !== undefined) row.email = patch.email;
  if (patch.phone !== undefined) row.phone = patch.phone;
  if (patch.whatsappStatus !== undefined) row.whatsapp_status = patch.whatsappStatus;
  if (patch.address !== undefined) row.address = patch.address;
  if (patch.sellerId !== undefined) row.seller_id = patch.sellerId;
  if (patch.status !== undefined) row.status = patch.status;
  if (patch.tags !== undefined) row.tags = patch.tags;
  if (patch.firstPurchaseAt !== undefined) row.first_purchase_at = patch.firstPurchaseAt;
  if (patch.lastPurchaseAt !== undefined) row.last_purchase_at = patch.lastPurchaseAt;
  if (patch.convertedFromLeadId !== undefined)
    row.converted_from_lead_id = patch.convertedFromLeadId;
  if (patch.convertedFromLeadAt !== undefined)
    row.converted_from_lead_at = patch.convertedFromLeadAt;
  if (patch.convertedBySellerId !== undefined)
    row.converted_by_seller_id = patch.convertedBySellerId;
  if (patch.purchaseStats !== undefined) row.purchase_stats = patch.purchaseStats;
  if (patch.abcClass !== undefined) row.abc_class = patch.abcClass;
  if (patch.abcShare !== undefined) row.abc_share = patch.abcShare;
  if (patch.overdueTitlesCount !== undefined) row.overdue_titles_count = patch.overdueTitlesCount;
  if (patch.portal !== undefined) row.portal = patch.portal;
  if (patch.isGuestCheckout !== undefined) row.is_guest_checkout = patch.isGuestCheckout;
  if (patch.hasB2BPortal !== undefined) row.has_b2b_portal = patch.hasB2BPortal;
  if (patch.portalContract !== undefined) row.portal_contract = patch.portalContract;
  if (patch.type === "B2B") {
    if (patch.cnpj !== undefined) row.cnpj = patch.cnpj;
    if (patch.razaoSocial !== undefined) row.razao_social = patch.razaoSocial;
    if (patch.nomeFantasia !== undefined) row.nome_fantasia = patch.nomeFantasia;
    if (patch.contactName !== undefined) row.contact_name = patch.contactName;
  }
  if (patch.type === "B2C") {
    if (patch.cpf !== undefined) row.cpf = patch.cpf;
    if (patch.fullName !== undefined) row.full_name = patch.fullName;
  }
  return row;
}

/** Maps a create input onto a full insert row, including the immutable `id`. */
function createInputToRow(
  input: Omit<ICustomer, "id" | "createdAt" | "notes">,
  id: string,
): Record<string, unknown> {
  const row: Record<string, unknown> = {
    id,
    store_id: input.storeId,
    type: input.type,
    email: input.email ?? null,
    phone: input.phone,
    address: input.address ?? null,
    seller_id: input.sellerId,
    status: input.status,
    tags: input.tags,
    first_purchase_at: input.firstPurchaseAt ?? null,
    last_purchase_at: input.lastPurchaseAt ?? null,
    converted_from_lead_id: input.convertedFromLeadId ?? null,
    converted_from_lead_at: input.convertedFromLeadAt ?? null,
    converted_by_seller_id: input.convertedBySellerId ?? null,
    purchase_stats: input.purchaseStats ?? null,
    abc_class: input.abcClass ?? null,
    abc_share: input.abcShare ?? null,
    overdue_titles_count: input.overdueTitlesCount ?? null,
    portal: input.portal ?? null,
    is_guest_checkout: input.isGuestCheckout ?? null,
    has_b2b_portal: input.hasB2BPortal ?? null,
    portal_contract: input.portalContract ?? null,
  };
  if (input.type === "B2B") {
    // Omit<> over a discriminated union collapses to the shared keys, so narrow
    // back to the variant to read its fields.
    const b2b = input as Omit<ICustomerB2B, "id" | "createdAt" | "notes">;
    row.cnpj = b2b.cnpj;
    row.razao_social = b2b.razaoSocial;
    row.nome_fantasia = b2b.nomeFantasia;
    row.contact_name = b2b.contactName;
  } else {
    const b2c = input as Omit<ICustomerB2C, "id" | "createdAt" | "notes">;
    row.cpf = b2c.cpf;
    row.full_name = b2c.fullName;
  }
  return row;
}

/** Columns the free-text customer search scans (paridade com o mock haystack). */
const SEARCH_COLUMNS = [
  "full_name",
  "razao_social",
  "nome_fantasia",
  "contact_name",
  "email",
  "phone",
  "cnpj",
  "cpf",
] as const;

/**
 * Builds the PostgREST `.or()` expression for a free-text customer search, or
 * `null` when the term is blank. `,` `(` `)` are PostgREST or()-delimiters and
 * are neutralized to spaces. `*` is the ilike wildcard in the string filter form.
 */
export function buildCustomerSearchOr(search: string): string | null {
  const term = search.trim();
  if (!term) return null;
  const safe = term.replace(/[,()]/g, " ");
  return SEARCH_COLUMNS.map((c) => `${c}.ilike.*${safe}*`).join(",");
}

export const supabaseCustomersProvider: ICustomersProvider = {
  async list(params: IListCustomersParams = {}): Promise<IPaginatedResult<ICustomer>> {
    let query = getSupabaseClient().from(TABLE).select(COLUMNS, { count: "exact" });

    if (params.storeIds && params.storeIds.length > 0) {
      query = query.in("store_id", params.storeIds);
    } else if (params.storeId !== undefined) {
      query = query.eq("store_id", params.storeId);
    }

    if (params.statuses && params.statuses.length > 0) {
      query = query.in("status", params.statuses);
    } else if (params.status !== undefined) {
      query = query.eq("status", params.status);
    }

    if (params.type !== undefined) query = query.eq("type", params.type);

    if (params.sellerIds && params.sellerIds.length > 0) {
      query = query.in("seller_id", params.sellerIds);
    } else if (params.sellerId !== undefined) {
      query = query.eq("seller_id", params.sellerId);
    }

    if (params.hasB2BPortal) query = query.eq("has_b2b_portal", true);

    const searchOr = params.search ? buildCustomerSearchOr(params.search) : null;
    if (searchOr) query = query.or(searchOr);

    const page = Math.max(1, Math.floor(params.page ?? 1));
    const pageSize = Math.max(1, Math.min(1000, Math.floor(params.pageSize ?? 20)));
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    const { data, error, count } = await query
      .order("created_at", { ascending: true })
      .range(from, to);

    if (error) throw new Error(`[supabase] customers.list failed: ${error.message}`);

    return {
      data: (data as unknown as CustomerRow[]).map((row) => rowToCustomer(row)),
      total: count ?? 0,
      page,
      pageSize,
    };
  },

  async get(id: ID): Promise<ICustomer> {
    const { data, error } = await getSupabaseClient()
      .from(TABLE)
      .select(COLUMNS)
      .eq("id", id)
      .single();
    if (error) throw new Error(`[supabase] customers.get(${id}) failed: ${error.message}`);

    const notes = await this.listNotes(id);
    return rowToCustomer(data as unknown as CustomerRow, notes);
  },

  async create(input: Omit<ICustomer, "id" | "createdAt" | "notes">): Promise<ICustomer> {
    const id: ID = crypto.randomUUID();
    const { data, error } = await getSupabaseClient()
      .from(TABLE)
      .insert(createInputToRow(input, id))
      .select(COLUMNS)
      .single();
    if (error) throw new Error(`[supabase] customers.create failed: ${error.message}`);
    return rowToCustomer(data as unknown as CustomerRow, []);
  },

  async update(id: ID, patch: Partial<ICustomer>): Promise<ICustomer> {
    const { data, error } = await getSupabaseClient()
      .from(TABLE)
      .update(customerPatchToRow(patch))
      .eq("id", id)
      .select(COLUMNS)
      .single();
    if (error) throw new Error(`[supabase] customers.update(${id}) failed: ${error.message}`);

    const notes = await this.listNotes(id);
    return rowToCustomer(data as unknown as CustomerRow, notes);
  },

  async delete(id: ID): Promise<void> {
    const { error } = await getSupabaseClient().from(TABLE).delete().eq("id", id);
    if (error) throw new Error(`[supabase] customers.delete(${id}) failed: ${error.message}`);
  },

  async addNote(customerId: ID, content: string, authorId: ID): Promise<ICustomerNote> {
    const id: ID = crypto.randomUUID();
    const { data, error } = await getSupabaseClient()
      .from(NOTES_TABLE)
      .insert({ id, customer_id: customerId, author_id: authorId, content })
      .select(NOTE_COLUMNS)
      .single();
    if (error)
      throw new Error(`[supabase] customers.addNote(${customerId}) failed: ${error.message}`);
    return rowToCustomerNote(data as CustomerNoteRow);
  },

  async listNotes(customerId: ID): Promise<ICustomerNote[]> {
    const { data, error } = await getSupabaseClient()
      .from(NOTES_TABLE)
      .select(NOTE_COLUMNS)
      .eq("customer_id", customerId)
      .order("created_at", { ascending: false });
    if (error)
      throw new Error(`[supabase] customers.listNotes(${customerId}) failed: ${error.message}`);
    return (data as CustomerNoteRow[]).map(rowToCustomerNote);
  },

  async getViaConversation(conversationId: ID): Promise<ICustomer | null> {
    // SECURITY DEFINER RPC gated by can_access_conversation: returns the
    // conversation's customer (0/1 row) bypassing the per-carteira customers RLS
    // that would 406 a POOL conversation's customer for a non-owner seller —
    // WITHOUT touching the global customers policy. Notes are not embedded here
    // (the pool fiche shows an empty Notes tab); the owner/carteira/staff path
    // still goes through `get` with notes.
    const { data, error } = await getSupabaseClient()
      .rpc("conversation_customer", { conv: conversationId })
      .maybeSingle();
    if (error)
      throw new Error(
        `[supabase] customers.getViaConversation(${conversationId}) failed: ${error.message}`,
      );
    if (!data) return null;
    return rowToCustomer(data as unknown as CustomerRow, []);
  },
};
