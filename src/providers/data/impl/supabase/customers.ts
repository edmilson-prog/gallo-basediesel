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
import type {
  IListCustomersParams,
  ICustomersProvider,
  IConvertPendingContactInput,
  ICustomerDocumentMatch,
} from "../../contracts/customers";
import type { IPaginatedResult } from "../../contracts/_shared";
import { getSupabaseClient } from "@/shared/lib/supabase";
import { buildDigitSearchCandidates } from "@/shared/utils/digitSearch";
import { fetchLargePage } from "./_pagination";

/** Row shape returned by the `find_customers_by_document` RPC. */
interface DocumentMatchRow {
  id: string;
  type: ICustomer["type"];
  display_name: string;
  seller_id: string | null;
  seller_name: string | null;
}

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
  seller_id: string | null;
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
  dintec_ticket_medio: number | null;
  dintec_ltv: number | null;
  dintec_frequencia: number | null;
  dintec_primeira_compra: string | null;
  dintec_ultima_compra: string | null;
  dintec_abc_class: ABCClass | null;
  dintec_pct_receita: number | null;
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
  "full_name, created_at, dintec_ticket_medio, dintec_ltv, dintec_frequencia, dintec_primeira_compra, " +
  "dintec_ultima_compra, dintec_abc_class, dintec_pct_receita";
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
    dintecTicketMedio: row.dintec_ticket_medio ?? undefined,
    dintecLtv: row.dintec_ltv ?? undefined,
    dintecFrequencia: row.dintec_frequencia ?? undefined,
    dintecFirstPurchaseAt: row.dintec_primeira_compra ?? undefined,
    dintecLastPurchaseAt: row.dintec_ultima_compra ?? undefined,
    dintecAbcClass: row.dintec_abc_class ?? undefined,
    dintecPctReceita: row.dintec_pct_receita ?? undefined,
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
 *  the embedded `notes` array are never written here.
 *
 *  `email`/`address` are the inline-editable nullable fields (see
 *  `buildCustomerPatch`, which emits `{ field: undefined }` to mean "clear this
 *  field"). For those two, presence of the key in the patch — not just a defined
 *  value — decides whether the column is written, and an `undefined` value
 *  coalesces to `null` so a clear actually clears the row instead of silently
 *  no-oping (same fix as `leadPatchToRow`). The other optional columns below are
 *  never cleared via this flow, so they keep the plain `!== undefined` guard.
 *
 *  Exported for unit testing; the production call site is `update` below. */
export function customerPatchToRow(patch: Partial<ICustomer>): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (patch.type !== undefined) row.type = patch.type;
  if ("email" in patch) row.email = patch.email ?? null;
  if (patch.phone !== undefined) row.phone = patch.phone;
  if (patch.whatsappStatus !== undefined) row.whatsapp_status = patch.whatsappStatus;
  if ("address" in patch) row.address = patch.address ?? null;
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

/** Digit-normalized columns matched when the term contains digits — finds
 *  phones typed with/without the BR 9th digit and documents typed with any
 *  mask (columns from migration 20260716210000). */
const DIGIT_SEARCH_COLUMNS = ["phone_digits", "cnpj_digits", "cpf_digits"] as const;

/**
 * Builds the PostgREST `.or()` expression for a free-text customer search, or
 * `null` when the term is blank. `,` `(` `)` are PostgREST or()-delimiters and
 * are neutralized to spaces. `*` is the ilike wildcard in the string filter form.
 */
export function buildCustomerSearchOr(search: string): string | null {
  const term = search.trim();
  if (!term) return null;
  const safe = term.replace(/[,()]/g, " ");
  const filters = SEARCH_COLUMNS.map((c) => `${c}.ilike.*${safe}*`);
  for (const candidate of buildDigitSearchCandidates(term)) {
    for (const col of DIGIT_SEARCH_COLUMNS) {
      filters.push(`${col}.ilike.*${candidate}*`);
    }
  }
  return filters.join(",");
}

export const supabaseCustomersProvider: ICustomersProvider = {
  async list(params: IListCustomersParams = {}): Promise<IPaginatedResult<ICustomer>> {
    const buildQuery = () => {
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

      // Hide imported `pending_review` contacts (array overlap, negated): drop any
      // row whose tags intersect excludeTags. Server-side so count/pagination match.
      if (params.excludeTags && params.excludeTags.length > 0) {
        query = query.not("tags", "ov", `{${params.excludeTags.join(",")}}`);
      }

      // Include filters: OR semantics — customer must carry ANY of the selected tags.
      if (params.tag) {
        query = query.overlaps("tags", [params.tag]);
      }
      if (params.tags && params.tags.length > 0) {
        query = query.overlaps("tags", params.tags);
      }

      const searchOr = params.search ? buildCustomerSearchOr(params.search) : null;
      if (searchOr) query = query.or(searchOr);

      return query;
    };

    const page = Math.max(1, Math.floor(params.page ?? 1));
    const pageSize = Math.max(1, Math.min(50_000, Math.floor(params.pageSize ?? 20)));
    const from = (page - 1) * pageSize;

    const { data, total } = await fetchLargePage<CustomerRow>(
      async (rangeFrom, rangeTo) => {
        const { data, error, count } = await buildQuery()
          .order("created_at", { ascending: true })
          .order("id", { ascending: true })
          .range(rangeFrom, rangeTo);
        if (error) throw new Error(`[supabase] customers.list failed: ${error.message}`);
        return { data: (data ?? []) as unknown as CustomerRow[], count: count ?? 0 };
      },
      from,
      pageSize,
    );

    return {
      data: data.map((row) => rowToCustomer(row)),
      total,
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

  async findByDocument(document: string): Promise<ICustomerDocumentMatch[]> {
    const digits = document.replace(/\D/g, "");
    if (!digits) return [];
    const { data, error } = await getSupabaseClient().rpc("find_customers_by_document", {
      p_document: digits,
    });
    if (error) throw new Error(`[supabase] customers.findByDocument failed: ${error.message}`);
    return ((data ?? []) as DocumentMatchRow[]).map((row) => ({
      id: row.id,
      type: row.type,
      displayName: row.display_name,
      sellerId: row.seller_id ?? null,
      sellerName: row.seller_name ?? null,
    }));
  },

  async convertPendingContact(input: IConvertPendingContactInput): Promise<ICustomer> {
    const { data, error } = await getSupabaseClient()
      .rpc("convert_pending_contact", {
        p_customer_id: input.customerId,
        p_type: input.type,
        p_full_name: input.fullName ?? null,
        p_cpf: input.cpf ?? null,
        p_razao_social: input.razaoSocial ?? null,
        p_nome_fantasia: input.nomeFantasia ?? null,
        p_cnpj: input.cnpj ?? null,
        p_contact_name: input.contactName ?? null,
        p_seller_id: input.sellerId ?? null,
      })
      .maybeSingle();
    if (error)
      throw new Error(`[supabase] customers.convertPendingContact failed: ${error.message}`);
    if (!data) throw new Error("[supabase] customers.convertPendingContact returned no row");
    return rowToCustomer(data as unknown as CustomerRow, []);
  },

  async markContactNotCustomer(customerId: ID): Promise<ICustomer> {
    const { data, error } = await getSupabaseClient()
      .rpc("mark_contact_not_customer", { p_customer_id: customerId })
      .maybeSingle();
    if (error)
      throw new Error(`[supabase] customers.markContactNotCustomer(${customerId}) failed: ${error.message}`);
    if (!data) throw new Error("[supabase] customers.markContactNotCustomer returned no row");
    return rowToCustomer(data as unknown as CustomerRow, []);
  },

  async restorePendingContact(customerId: ID): Promise<ICustomer> {
    const { data, error } = await getSupabaseClient()
      .rpc("restore_pending_contact", { p_customer_id: customerId })
      .maybeSingle();
    if (error)
      throw new Error(`[supabase] customers.restorePendingContact(${customerId}) failed: ${error.message}`);
    if (!data) throw new Error("[supabase] customers.restorePendingContact returned no row");
    return rowToCustomer(data as unknown as CustomerRow, []);
  },

  async renameContact(customerId: ID, name: string): Promise<ICustomer> {
    // SECURITY DEFINER RPC gated by can_access_conversation: renames the display
    // name for a contact the caller can ACT on (staff, carteira owner, or a
    // conversation they attend — pool/instance included), bypassing the
    // `customers_update` policy that lacks the `seller_handles_customer` branch.
    // The RPC picks full_name/nome_fantasia from the row's own `type`.
    const { data, error } = await getSupabaseClient()
      .rpc("rename_customer_contact", { p_customer_id: customerId, p_name: name })
      .maybeSingle();
    if (error)
      throw new Error(`[supabase] customers.renameContact(${customerId}) failed: ${error.message}`);
    if (!data) throw new Error("[supabase] customers.renameContact returned no row");
    return rowToCustomer(data as unknown as CustomerRow, []);
  },
};
