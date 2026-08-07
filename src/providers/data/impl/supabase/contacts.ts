import type {
  ContactScope,
  ContactSource,
  Division,
  ID,
  IContact,
  IContactScopeCounts,
} from "@/shared/types";
import { getSupabaseClient } from "@/shared/lib/supabase";
import { readCurrentUserSync } from "@/features/auth/guards";
import type {
  ContactRecencyBucket,
  ContactsOrderBy,
  IContactsProvider,
  IListContactsParams,
} from "../../contracts/contacts";
import type { IPaginatedResult } from "../../contracts/_shared";

/**
 * Supabase implementation of {@link IContactsProvider} (Agenda, phase 1).
 *
 * The RLS `using` clause on `contacts_update`/`contacts_delete` silently
 * excludes rows the caller may see but not write (a seller who only has pool
 * access via the linked customer's carteira) — an affected UPDATE/DELETE on
 * such a row returns ZERO rows and NO error. Every single-row mutation below
 * therefore chains `.select(COLUMNS).single()` (or `.select("id")` for
 * delete) and treats "no row back" as a real failure, never as success. Bulk
 * mutations instead report the count actually affected so the caller can
 * compare it against the ids requested.
 */

interface ICustomerNameRow {
  id: string;
  nome_fantasia: string | null;
  razao_social: string | null;
  full_name: string | null;
}

interface IOwnerNameRow {
  id: string;
  full_name: string;
}

interface IRow {
  id: string;
  store_id: string;
  name: string;
  role: string | null;
  phone: string | null;
  phone_digits: string | null;
  email: string | null;
  city: string | null;
  uf: string | null;
  customer_id: string | null;
  lead_id: string | null;
  owner_seller_id: string | null;
  tags: string[];
  source: ContactSource;
  opt_out: boolean;
  opt_out_at: string | null;
  opt_out_by: string | null;
  next_contact_at: string | null;
  next_contact_note: string | null;
  last_contact_at: string | null;
  has_whatsapp: boolean;
  division: Division;
  created_at: string;
  updated_at: string;
  customer: ICustomerNameRow | null;
  owner: IOwnerNameRow | null;
}

const TABLE = "contacts";

// `contacts` carries THREE foreign keys into `sellers` (owner_seller_id,
// opt_out_by, ignored_by), so the embed needs the `!owner_seller_id` hint —
// without it PostgREST refuses to guess which relationship to embed.
const COLUMNS =
  "id, store_id, name, role, phone, phone_digits, email, city, uf, customer_id, lead_id, " +
  "owner_seller_id, tags, source, opt_out, opt_out_at, opt_out_by, next_contact_at, " +
  "next_contact_note, last_contact_at, has_whatsapp, division, created_at, updated_at, " +
  "customer:customers(id, nome_fantasia, razao_social, full_name), " +
  "owner:sellers!owner_seller_id(id, full_name)";

/** Cap on how many customers a name search is allowed to match before their
 *  ids get folded into the contacts `.or()` as `customer_id.in.(...)`. Guards
 *  against the same `.in()` URL-length blowup already known in this codebase
 *  (see carteira transfer chunking) — the Agenda search is a type-ahead, so a
 *  few dozen fresh company matches are enough in practice. */
const SEARCH_CUSTOMER_MATCH_LIMIT = 200;

function resolveCustomerName(customer: ICustomerNameRow | null): string | null {
  if (!customer) return null;
  return customer.nome_fantasia ?? customer.razao_social ?? customer.full_name ?? null;
}

function rowToContact(row: IRow): IContact {
  return {
    id: row.id,
    storeId: row.store_id,
    name: row.name,
    role: row.role,
    phone: row.phone,
    phoneDigits: row.phone_digits,
    email: row.email,
    city: row.city,
    uf: row.uf,
    customerId: row.customer_id,
    customerName: resolveCustomerName(row.customer),
    leadId: row.lead_id,
    ownerSellerId: row.owner_seller_id,
    ownerName: row.owner?.full_name ?? null,
    tags: row.tags,
    source: row.source,
    optOut: row.opt_out,
    optOutAt: row.opt_out_at,
    optOutBy: row.opt_out_by,
    nextContactAt: row.next_contact_at,
    nextContactNote: row.next_contact_note,
    lastContactAt: row.last_contact_at,
    hasWhatsapp: row.has_whatsapp,
    division: row.division,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Maps a create input onto an insert row. `phone_digits` is GENERATED —
 *  Postgres computes it from `phone`; including it in the payload errors. */
function contactInputToRow(
  input: Omit<IContact, "id" | "createdAt" | "updatedAt" | "customerName" | "ownerName">,
): Record<string, unknown> {
  return {
    store_id: input.storeId,
    name: input.name,
    role: input.role,
    phone: input.phone,
    email: input.email,
    city: input.city,
    uf: input.uf,
    customer_id: input.customerId,
    lead_id: input.leadId,
    owner_seller_id: input.ownerSellerId,
    tags: input.tags,
    source: input.source,
    opt_out: input.optOut,
    opt_out_at: input.optOutAt,
    opt_out_by: input.optOutBy,
    next_contact_at: input.nextContactAt,
    next_contact_note: input.nextContactNote,
    last_contact_at: input.lastContactAt,
    has_whatsapp: input.hasWhatsapp,
    division: input.division,
  };
}

/** Maps a camelCase patch to snake_case columns. `id`/`storeId`/`createdAt`
 *  and the GENERATED `phone_digits` are never written; every other field is
 *  writable only when the key is present (`!== undefined`), so an explicit
 *  `null` clears the column and an omitted key leaves it untouched.
 *  Exported for unit testing; the production call site is `update` below. */
export function contactPatchToRow(patch: Partial<IContact>): Record<string, unknown> {
  const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.name !== undefined) row.name = patch.name;
  if (patch.role !== undefined) row.role = patch.role;
  if (patch.phone !== undefined) row.phone = patch.phone;
  if (patch.email !== undefined) row.email = patch.email;
  if (patch.city !== undefined) row.city = patch.city;
  if (patch.uf !== undefined) row.uf = patch.uf;
  if (patch.customerId !== undefined) row.customer_id = patch.customerId;
  if (patch.leadId !== undefined) row.lead_id = patch.leadId;
  if (patch.ownerSellerId !== undefined) row.owner_seller_id = patch.ownerSellerId;
  if (patch.tags !== undefined) row.tags = patch.tags;
  if (patch.source !== undefined) row.source = patch.source;
  if (patch.optOut !== undefined) row.opt_out = patch.optOut;
  if (patch.optOutAt !== undefined) row.opt_out_at = patch.optOutAt;
  if (patch.optOutBy !== undefined) row.opt_out_by = patch.optOutBy;
  if (patch.nextContactAt !== undefined) row.next_contact_at = patch.nextContactAt;
  if (patch.nextContactNote !== undefined) row.next_contact_note = patch.nextContactNote;
  if (patch.lastContactAt !== undefined) row.last_contact_at = patch.lastContactAt;
  if (patch.hasWhatsapp !== undefined) row.has_whatsapp = patch.hasWhatsapp;
  if (patch.division !== undefined) row.division = patch.division;
  return row;
}

/** Builds the PostgREST `.or()` expression matching the contact's OWN columns
 *  (name/phone/e-mail/role/city, plus digits-only phone), or `null` when the
 *  term is blank. Mirrors `buildCustomerSearchOr` in `customers.ts`: `,`/`()`
 *  are `.or()` delimiters and are neutralized, and `*` — not `%` — is the
 *  ilike wildcard inside this compound-filter string form. Company-name
 *  matching (the mock's `matchesSearch` also searches `customerName`) is
 *  folded in separately by the caller via `customer_id.in.(...)` — see
 *  `resolveSearchCustomerIds`. Exported for unit testing. */
export function buildContactSearchOr(search: string): string | null {
  const term = search.trim();
  if (!term) return null;
  const safe = term.replace(/[,()]/g, " ");
  const filters = [
    `name.ilike.*${safe}*`,
    `email.ilike.*${safe}*`,
    `role.ilike.*${safe}*`,
    `city.ilike.*${safe}*`,
    `phone.ilike.*${safe}*`,
  ];
  const digits = term.replace(/\D/g, "");
  if (digits) filters.push(`phone_digits.ilike.*${digits}*`);
  return filters.join(",");
}

interface IRecencyBucketRange {
  /** Exclusive lower bound (ISO timestamp) — `last_contact_at` must be greater. */
  gt?: string;
  /** Inclusive upper bound (ISO timestamp) — `last_contact_at` must be at most this. */
  lte?: string;
  /** `true` when the bucket means `last_contact_at IS NULL`. */
  isNull?: true;
}

/**
 * Translates a {@link ContactRecencyBucket} into the `last_contact_at` bounds
 * the SQL filter must apply, given `now`. Derived from the contract's
 * `days = floor((nowMs - lastContactAt) / 86_400_000)` definition:
 *   - "hoje" (`days <= 0`)   → `t > now - 1d`
 *   - "7d"   (`0<=days<=7`)  → `now - 8d < t <= now`
 *   - "30d"  (`0<=days<=30`) → `now - 31d < t <= now`
 *   - "90d+" (`days > 90`)   → `t <= now - 91d`
 * "30d" and "90d+" deliberately leave a gap (31–90 days ago matches neither),
 * matching `matchesRecencyBucket` in `src/mocks/api/contacts.ts` exactly.
 * Exported for unit testing — this is the one piece of SQL translation in
 * this file with no live-data way to double-check it.
 */
export function contactRecencyBucketRange(
  bucket: ContactRecencyBucket,
  now: Date,
): IRecencyBucketRange {
  const DAY_MS = 24 * 60 * 60 * 1000;
  const nowMs = now.getTime();
  const daysAgo = (days: number) => new Date(nowMs - days * DAY_MS).toISOString();
  switch (bucket) {
    case "nunca":
      return { isNull: true };
    case "hoje":
      return { gt: daysAgo(1) };
    case "7d":
      return { gt: daysAgo(8), lte: now.toISOString() };
    case "30d":
      return { gt: daysAgo(31), lte: now.toISOString() };
    case "90d+":
      return { lte: daysAgo(91) };
  }
}

/** Resolves the free-text search term against customer display names
 *  (`nome_fantasia → razao_social → full_name`), so a company name finds its
 *  linked contacts — the mock's `matchesSearch` haystack includes
 *  `contact.customerName`, so this provider must too. A no-op (empty array,
 *  no query) when the term is blank. */
async function resolveSearchCustomerIds(search: string | undefined): Promise<string[]> {
  const term = search?.trim();
  if (!term) return [];
  const safe = term.replace(/[,()]/g, " ");
  const { data, error } = await getSupabaseClient()
    .from("customers")
    .select("id")
    .or(`nome_fantasia.ilike.*${safe}*,razao_social.ilike.*${safe}*,full_name.ilike.*${safe}*`)
    .limit(SEARCH_CUSTOMER_MATCH_LIMIT);
  if (error) throw new Error(`contacts.list (customer name search): ${error.message}`);
  return ((data ?? []) as { id: string }[]).map((row) => row.id);
}

/**
 * Builds a fresh, fully-filtered query for the CURRENT filter set, minus
 * `scope` — `list()` applies scope itself, and `counts()` applies each of the
 * four scope branches on top of this same base so the chips reflect every
 * OTHER active filter while ignoring which chip is selected. Never reuse the
 * returned query across two executions (Supabase query builders are not safe
 * to re-run); call this fresh for every request.
 */
function buildFilteredQuery(
  select: string,
  options: { count?: "exact"; head?: boolean },
  params: IListContactsParams,
  now: Date,
  searchCustomerIds: string[],
) {
  let query = getSupabaseClient().from(TABLE).select(select, options);

  // Triaged-away contacts never show in the Agenda. The columns exist from
  // the first migration but phase 1 has no writer for them, so this filter is
  // inert today — it is here so the future triage screen cannot leak ignored
  // contacts through a listing path nobody updated.
  query = query.is("ignored_at", null);

  if (params.storeId) query = query.eq("store_id", params.storeId);
  if (params.tags?.length) query = query.overlaps("tags", params.tags);
  if (params.sources?.length) query = query.in("source", params.sources);
  if (params.city) query = query.eq("city", params.city);
  if (params.uf) query = query.eq("uf", params.uf);

  // Owner filter: ids and/or the unassigned bucket. ownerSellerIds is bounded
  // by the number of sellers in the store, so the `.in()`/`.or()` URL is safe.
  if (params.unassignedOwner && params.ownerSellerIds?.length) {
    query = query.or(
      `owner_seller_id.is.null,owner_seller_id.in.(${params.ownerSellerIds.join(",")})`,
    );
  } else if (params.unassignedOwner) {
    query = query.is("owner_seller_id", null);
  } else if (params.ownerSellerIds?.length) {
    query = query.in("owner_seller_id", params.ownerSellerIds);
  }

  const term = params.search?.trim();
  if (term) {
    const baseOr = buildContactSearchOr(term) ?? "";
    const clauses =
      searchCustomerIds.length > 0
        ? `${baseOr},customer_id.in.(${searchCustomerIds.join(",")})`
        : baseOr;
    query = query.or(clauses);
  }

  if (params.lastContactBucket) {
    const range = contactRecencyBucketRange(params.lastContactBucket, now);
    if (range.isNull) {
      query = query.is("last_contact_at", null);
    } else {
      if (range.gt) query = query.gt("last_contact_at", range.gt);
      if (range.lte) query = query.lte("last_contact_at", range.lte);
    }
  }

  return query;
}

async function countScope(
  params: IListContactsParams,
  now: Date,
  scope: ContactScope | undefined,
  searchCustomerIds: string[],
): Promise<number> {
  let query = buildFilteredQuery(
    "id",
    { count: "exact", head: true },
    params,
    now,
    searchCustomerIds,
  );
  // Mirrors the scope branch in `list()` below — keep the two in sync if the
  // scope semantics ever change. Not factored into a shared helper: the
  // query's inferred generic type would need an explicit (and awkward)
  // annotation to cross a function boundary here, for no real gain.
  if (scope === "vinculados") query = query.not("customer_id", "is", null);
  else if (scope === "soltos") query = query.is("customer_id", null);
  else if (scope === "optout") query = query.eq("opt_out", true);
  const { count, error } = await query;
  if (error) throw new Error(`contacts.counts(${scope ?? "todos"}): ${error.message}`);
  return count ?? 0;
}

/** Seller id of the current caller, for FK columns that reference
 *  `sellers(id)` (never the auth/profile id — a mismatch here is exactly the
 *  bug family that caused the carteira-transfer 409, see PR #368). Falls back
 *  to `null` rather than the auth id, since a wrong non-null value would
 *  violate the FK instead of leaving an honest "unknown actor" blank. */
function currentSellerId(): ID | null {
  return readCurrentUserSync()?.sellerId ?? null;
}

export const supabaseContactsProvider: IContactsProvider = {
  async list(params: IListContactsParams = {}): Promise<IPaginatedResult<IContact>> {
    const now = new Date();
    const page = params.page ?? 1;
    // Matches the mock's default (the generic `paginate()` helper in
    // `src/mocks/api/utils/paginate.ts` defaults to 20, not 15).
    const pageSize = params.pageSize ?? 20;
    const from = (page - 1) * pageSize;

    const searchCustomerIds = await resolveSearchCustomerIds(params.search);
    let query = buildFilteredQuery(COLUMNS, { count: "exact" }, params, now, searchCustomerIds);
    // Mirrors the scope branch in `countScope()` above — keep the two in sync.
    if (params.scope === "vinculados") query = query.not("customer_id", "is", null);
    else if (params.scope === "soltos") query = query.is("customer_id", null);
    else if (params.scope === "optout") query = query.eq("opt_out", true);

    const orderBy: ContactsOrderBy = params.orderBy ?? "name";
    const ascending = params.orderDir !== "desc";
    switch (orderBy) {
      case "owner":
        // Single real column, no fallback chain needed.
        query = query.order("full_name", {
          ascending,
          nullsFirst: ascending,
          referencedTable: "owner",
        });
        break;
      case "customer":
        // Best-effort proxy: no physical column reproduces the mock's
        // nome_fantasia → razao_social → full_name fallback chain, so this
        // orders by nome_fantasia alone (accurate for B2B-linked contacts,
        // imprecise for B2C-linked ones, which typically lack it). Flagged
        // for the product owner — a true match needs a computed column/view.
        query = query.order("nome_fantasia", {
          ascending,
          nullsFirst: ascending,
          referencedTable: "customer",
        });
        break;
      case "status":
        // No physical column holds the mock's derived "1-vinculado" /
        // "2-solto" / "3-optout" key. Two real columns reproduce it exactly:
        // opt_out groups the optout bucket last (first when desc), and
        // customer_id explicitly ordered NULLS LAST/FIRST puts "solto" right
        // after "vinculado" in the same direction as the string key would.
        query = query
          .order("opt_out", { ascending })
          .order("customer_id", { ascending, nullsFirst: !ascending });
        break;
      case "phone":
        query = query.order("phone_digits", { ascending, nullsFirst: ascending });
        break;
      case "lastContactAt":
        query = query.order("last_contact_at", { ascending, nullsFirst: ascending });
        break;
      default:
        // "name" | "role" | "email" | "city" | "source" — camelCase key
        // equals the column name.
        query = query.order(orderBy, { ascending, nullsFirst: ascending });
        break;
    }

    const { data, error, count } = await query.range(from, from + pageSize - 1);
    if (error) throw new Error(`contacts.list: ${error.message}`);
    return {
      data: ((data ?? []) as unknown as IRow[]).map(rowToContact),
      total: count ?? 0,
      page,
      pageSize,
    };
  },

  async get(id: ID): Promise<IContact> {
    // No `ignored_at` filter here on purpose — a triaged-away contact stays
    // reachable by direct id (fiche/detail), it only disappears from list().
    const { data, error } = await getSupabaseClient()
      .from(TABLE)
      .select(COLUMNS)
      .eq("id", id)
      .single();
    if (error) throw new Error(`contacts.get(${id}): ${error.message}`);
    return rowToContact(data as unknown as IRow);
  },

  async create(
    input: Omit<IContact, "id" | "createdAt" | "updatedAt" | "customerName" | "ownerName">,
  ): Promise<IContact> {
    const { data, error } = await getSupabaseClient()
      .from(TABLE)
      .insert(contactInputToRow(input))
      .select(COLUMNS)
      .single();
    if (error) throw new Error(`contacts.create: ${error.message}`);
    return rowToContact(data as unknown as IRow);
  },

  async update(id: ID, patch: Partial<IContact>): Promise<IContact> {
    const { data, error } = await getSupabaseClient()
      .from(TABLE)
      .update(contactPatchToRow(patch))
      .eq("id", id)
      .select(COLUMNS)
      .single();
    // `.single()` is the guard: an UPDATE blocked by the `using` clause
    // affects 0 rows and raises NO error — `.single()` turns that silent
    // no-op into a thrown error instead of a false "success".
    if (error) throw new Error(`contacts.update(${id}): ${error.message}`);
    return rowToContact(data as unknown as IRow);
  },

  async delete(id: ID): Promise<void> {
    const { data, error } = await getSupabaseClient()
      .from(TABLE)
      .delete()
      .eq("id", id)
      .select("id");
    if (error) throw new Error(`contacts.delete(${id}): ${error.message}`);
    if (!data || data.length === 0) {
      throw new Error(
        `contacts.delete(${id}): no row was deleted — blocked by RLS or the contact no longer exists`,
      );
    }
  },

  async linkToCustomer(id: ID, customerId: ID | null): Promise<IContact> {
    const { data, error } = await getSupabaseClient()
      .from(TABLE)
      .update({ customer_id: customerId, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select(COLUMNS)
      .single();
    if (error) throw new Error(`contacts.linkToCustomer(${id}): ${error.message}`);
    return rowToContact(data as unknown as IRow);
  },

  async setOptOut(id: ID, optOut: boolean): Promise<IContact> {
    const patch = optOut
      ? {
          opt_out: true,
          opt_out_at: new Date().toISOString(),
          opt_out_by: currentSellerId(),
        }
      : { opt_out: false, opt_out_at: null, opt_out_by: null };
    const { data, error } = await getSupabaseClient()
      .from(TABLE)
      .update(patch)
      .eq("id", id)
      .select(COLUMNS)
      .single();
    if (error) throw new Error(`contacts.setOptOut(${id}): ${error.message}`);
    return rowToContact(data as unknown as IRow);
  },

  async scheduleFollowUp(id: ID, at: string, note?: string): Promise<IContact> {
    const { data, error } = await getSupabaseClient()
      .from(TABLE)
      .update({
        next_contact_at: at,
        next_contact_note: note ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select(COLUMNS)
      .single();
    if (error) throw new Error(`contacts.scheduleFollowUp(${id}): ${error.message}`);
    return rowToContact(data as unknown as IRow);
  },

  async bulkAddTag(ids: ID[], tag: string): Promise<number> {
    if (ids.length === 0) return 0;
    const { data, error } = await getSupabaseClient().from(TABLE).select("id, tags").in("id", ids);
    if (error) throw new Error(`contacts.bulkAddTag: ${error.message}`);
    const targets = ((data ?? []) as unknown as { id: string; tags: string[] }[]).filter(
      (row) => !row.tags.includes(tag),
    );
    if (targets.length === 0) return 0;

    const now = new Date().toISOString();
    const results = await Promise.all(
      targets.map((row) =>
        getSupabaseClient()
          .from(TABLE)
          .update({ tags: [...row.tags, tag], updated_at: now })
          .eq("id", row.id)
          .select("id"),
      ),
    );
    let affected = 0;
    for (const result of results) {
      if (result.error) throw new Error(`contacts.bulkAddTag: ${result.error.message}`);
      // Blocked-by-RLS rows come back with 0 rows here, silently excluded —
      // exactly the count we want to report.
      affected += result.data?.length ?? 0;
    }
    return affected;
  },

  async bulkRemoveTag(ids: ID[], tag: string): Promise<number> {
    if (ids.length === 0) return 0;
    const { data, error } = await getSupabaseClient().from(TABLE).select("id, tags").in("id", ids);
    if (error) throw new Error(`contacts.bulkRemoveTag: ${error.message}`);
    const targets = ((data ?? []) as unknown as { id: string; tags: string[] }[]).filter((row) =>
      row.tags.includes(tag),
    );
    if (targets.length === 0) return 0;

    const now = new Date().toISOString();
    const results = await Promise.all(
      targets.map((row) =>
        getSupabaseClient()
          .from(TABLE)
          .update({ tags: row.tags.filter((t) => t !== tag), updated_at: now })
          .eq("id", row.id)
          .select("id"),
      ),
    );
    let affected = 0;
    for (const result of results) {
      if (result.error) throw new Error(`contacts.bulkRemoveTag: ${result.error.message}`);
      affected += result.data?.length ?? 0;
    }
    return affected;
  },

  async bulkTransferOwner(ids: ID[], ownerSellerId: ID | null): Promise<number> {
    if (ids.length === 0) return 0;
    let query = getSupabaseClient()
      .from(TABLE)
      .update(
        { owner_seller_id: ownerSellerId, updated_at: new Date().toISOString() },
        { count: "exact" },
      )
      .in("id", ids);
    // Only rows whose current owner actually differs count as "affected" —
    // mirrors the mock's `current.ownerSellerId === ownerSellerId` skip.
    query = ownerSellerId
      ? query.or(`owner_seller_id.is.null,owner_seller_id.neq.${ownerSellerId}`)
      : query.not("owner_seller_id", "is", null);
    const { count, error } = await query;
    if (error) throw new Error(`contacts.bulkTransferOwner: ${error.message}`);
    return count ?? 0;
  },

  async bulkSetOptOut(ids: ID[], optOut: boolean): Promise<number> {
    if (ids.length === 0) return 0;
    const patch = optOut
      ? { opt_out: true, opt_out_at: new Date().toISOString(), opt_out_by: currentSellerId() }
      : { opt_out: false, opt_out_at: null, opt_out_by: null };
    const { count, error } = await getSupabaseClient()
      .from(TABLE)
      .update(patch, { count: "exact" })
      .in("id", ids)
      // Only rows whose current opt_out actually differs count as "affected".
      .eq("opt_out", !optOut);
    if (error) throw new Error(`contacts.bulkSetOptOut: ${error.message}`);
    return count ?? 0;
  },

  async counts(params: IListContactsParams = {}): Promise<IContactScopeCounts> {
    const now = new Date();
    const searchCustomerIds = await resolveSearchCustomerIds(params.search);
    const [todos, vinculados, soltos, optout] = await Promise.all([
      countScope(params, now, undefined, searchCustomerIds),
      countScope(params, now, "vinculados", searchCustomerIds),
      countScope(params, now, "soltos", searchCustomerIds),
      countScope(params, now, "optout", searchCustomerIds),
    ]);
    return { todos, vinculados, soltos, optout };
  },
};
