import type {
  ContactScope,
  ContactSource,
  Division,
  ID,
  IContact,
  IContactDuplicatePair,
  IContactScopeCounts,
  ITriageContext,
  ITriageSuggestion,
} from "@/shared/types";
import { getSupabaseClient } from "@/shared/lib/supabase";
import { readCurrentUserSync } from "@/features/auth/guards";
import {
  buildTriageSuggestions,
  type ITriageCandidate,
} from "@/features/contacts/engine/triageSuggestions";
import {
  buildDuplicatePairs,
  type IDuplicateInput,
} from "@/features/contacts/engine/duplicatePairs";
import { buildMergePatch, mergeIgnoreReason } from "@/features/contacts/engine/contactMerge";
import {
  companyEmailDomainOf,
  nameTokens,
  normalizeEmail,
} from "@/features/contacts/engine/triageMatch";
import type {
  ContactRecencyBucket,
  ContactsOrderBy,
  IContactsProvider,
  IListContactsParams,
} from "../../contracts/contacts";
import { FETCH_ALL_PAGE_SIZE, type IPaginatedResult } from "../../contracts/_shared";
import { fetchLargePage } from "./_pagination";

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
  ignored_at: string | null;
  ignore_reason: string | null;
  ignored_by: string | null;
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
  "next_contact_note, last_contact_at, has_whatsapp, ignored_at, ignore_reason, ignored_by, " +
  "division, created_at, updated_at, " +
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
    ignoredAt: row.ignored_at,
    ignoreReason: row.ignore_reason,
    ignoredBy: row.ignored_by,
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

/**
 * Resolves the free-text search term against customer display names
 * (`nome_fantasia → razao_social → full_name`), so a company name finds its
 * linked contacts — the mock's `matchesSearch` haystack includes
 * `contact.customerName`, so this provider must too. A no-op (empty array,
 * no query) when the term is blank.
 *
 * Capped at `SEARCH_CUSTOMER_MATCH_LIMIT` (200) matches: those ids get folded
 * into the contacts query as `customer_id.in.(...)`, and a longer list risks
 * the same `.in()` URL-length blowup already known in this codebase (see the
 * carteira-transfer chunking) — raising the cap is not the fix, 200 UUIDs is
 * already ~7.4 kB of URL. When a term matches MORE than the cap, the extra
 * companies' contacts are silently dropped from the result today — that part
 * is unchanged — but the overflow itself is now detectable (queries for
 * `LIMIT + 1` and only truncates if it actually got the extra row) and logged
 * to the dev console instead of being invisible. Task 18 (Agenda search box)
 * should read this before wiring the search: a "refine sua busca" affordance
 * belongs there, not in this data layer.
 */
async function resolveSearchCustomerIds(search: string | undefined): Promise<string[]> {
  const term = search?.trim();
  if (!term) return [];
  const safe = term.replace(/[,()]/g, " ");
  const { data, error } = await getSupabaseClient()
    .from("customers")
    .select("id")
    .or(`nome_fantasia.ilike.*${safe}*,razao_social.ilike.*${safe}*,full_name.ilike.*${safe}*`)
    // +1 so an overflow (more matches than the cap) is distinguishable from
    // "exactly at the cap" instead of being truncated in silence.
    .limit(SEARCH_CUSTOMER_MATCH_LIMIT + 1);
  if (error) throw new Error(`contacts.list (customer name search): ${error.message}`);
  const rows = (data ?? []) as { id: string }[];
  if (rows.length > SEARCH_CUSTOMER_MATCH_LIMIT) {
    if (import.meta.env.DEV) {
      console.warn(
        `[contacts] search term "${term}" matched more than ` +
          `${SEARCH_CUSTOMER_MATCH_LIMIT} customers by name — only the first ` +
          `${SEARCH_CUSTOMER_MATCH_LIMIT} are folded into the contacts search. ` +
          "Some matching contacts may be missing from the results.",
      );
    }
    return rows.slice(0, SEARCH_CUSTOMER_MATCH_LIMIT).map((row) => row.id);
  }
  return rows.map((row) => row.id);
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

  // Triaged-away contacts never show in the Agenda — `ignorados` is the one
  // scope that asks for them, and it is not a filters-bar chip: the triage
  // screen's "Ignorados" tab is its only caller. Every other scope (including
  // the `undefined` one `counts()` uses for "todos") excludes them.
  query =
    params.scope === "ignorados"
      ? query.not("ignored_at", "is", null)
      : query.is("ignored_at", null);

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

/**
 * `buildFilteredQuery` plus the scope branch and the ordering switch —
 * everything `list()` needs except `.range()`, which `fetchLargePage`
 * applies itself on every chunk. Kept as one function (not composed from two
 * smaller ones) because factoring the scope/order steps out would need an
 * explicit type annotation for the intermediate query, same reasoning as
 * `countScope` below.
 */
function buildOrderedQuery(params: IListContactsParams, now: Date, searchCustomerIds: string[]) {
  let query = buildFilteredQuery(COLUMNS, { count: "exact" }, params, now, searchCustomerIds);
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

  // Unique tie-breaker, applied once here rather than inside every branch
  // above so it can never be forgotten on a future one. Postgres does not
  // guarantee a stable relative order for rows tied on the primary sort
  // column across SEPARATE queries — and `list()` (via `fetchLargePage`)
  // issues multiple `.range()` queries for any read past 1000 rows (Task
  // 16's "select all N filtered" reads the whole filtered set this way).
  // Without a unique secondary key, tied rows can be duplicated into two
  // chunks or skipped entirely at a chunk boundary. Worst case here:
  // orderBy "status" sorts primarily by `opt_out`, a boolean — nearly every
  // row ties. Matches the precedent in `customers.ts` (`.order("id")` as the
  // final key). Do not remove this as "redundant" — it only looks that way
  // on a single, un-paginated query.
  query = query.order("id", { ascending });

  return query;
}

async function countScope(
  params: IListContactsParams,
  now: Date,
  scope: ContactScope | undefined,
  searchCustomerIds: string[],
): Promise<number> {
  // `scope` is passed separately below, so it is stripped from the params the
  // base query sees. Leaving it in would let a caller sitting on the
  // `ignorados` scope flip the base filter and count triaged-away contacts
  // into every chip.
  let query = buildFilteredQuery(
    "id",
    { count: "exact", head: true },
    { ...params, scope: undefined },
    now,
    searchCustomerIds,
  );
  // Mirrors the scope branch in `buildOrderedQuery` above — keep the two in
  // sync if the scope semantics ever change. Not factored into a shared
  // helper: the query's inferred generic type would need an explicit (and
  // awkward) annotation to cross a function boundary here, for no real gain.
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

// ── Triage helpers ────────────────────────────────────────────────────────

/**
 * How many rows each candidate lookup may return.
 *
 * Triage shows ONE contact at a time and offers at most three suggestions, so
 * these queries exist to find a handful of plausible customers, not to
 * enumerate them. A common surname would otherwise pull hundreds of rows to
 * rank three.
 */
const TRIAGE_CANDIDATE_LIMIT = 20;

/** A name token shorter than this matches too much to be worth a query. */
const MIN_SEARCHABLE_TOKEN = 4;

interface ICustomerCandidateRow {
  id: string;
  nome_fantasia: string | null;
  razao_social: string | null;
  full_name: string | null;
  phone: string | null;
  email: string | null;
  address: { city?: string; state?: string } | null;
}

const CUSTOMER_CANDIDATE_COLUMNS =
  "id, nome_fantasia, razao_social, full_name, phone, email, address";

/** Linked contacts carry reach data their customer's own record may lack. */
interface ILinkedContactRow {
  id: string;
  phone: string | null;
  email: string | null;
  customer_id: string;
  customer: ICustomerNameRow | null;
}

const LINKED_CONTACT_COLUMNS =
  "id, phone, email, customer_id, customer:customers(id, nome_fantasia, razao_social, full_name)";

/**
 * Last 8 digits — the part of a Brazilian number that survives the 9th-digit
 * variation, and therefore the only safe substring to match a stored number
 * against. Returns `null` when there is no usable phone.
 */
function lastEightDigits(contact: IContact): string | null {
  const digits = (contact.phoneDigits ?? contact.phone ?? "").replace(/\D/g, "");
  return digits.length >= 8 ? digits.slice(-8) : null;
}

/**
 * Accumulates everything known about one candidate customer across the
 * several lookups below, so the scoring engine sees a single record per
 * customer instead of one per query that happened to find it.
 */
function upsertCandidate(
  index: Map<string, ITriageCandidate>,
  customerId: string,
  customerName: string | null,
  extra: { phone?: string | null; email?: string | null; city?: string | null; uf?: string | null },
): void {
  const existing = index.get(customerId);
  const candidate: ITriageCandidate = existing ?? {
    customerId,
    customerName: customerName ?? "Cliente sem nome",
    phones: [],
    emails: [],
    city: null,
    uf: null,
  };
  if (!existing) index.set(customerId, candidate);
  // A later lookup may carry the name when the first one did not.
  if (customerName && candidate.customerName === "Cliente sem nome") {
    candidate.customerName = customerName;
  }
  if (extra.phone && !candidate.phones.includes(extra.phone)) candidate.phones.push(extra.phone);
  if (extra.email && !candidate.emails.includes(extra.email)) candidate.emails.push(extra.email);
  if (!candidate.city && extra.city) candidate.city = extra.city;
  if (!candidate.uf && extra.uf) candidate.uf = extra.uf;
}

/** Escapes the `.or()` delimiters, same rule as `buildContactSearchOr`. */
function safeOrTerm(value: string): string {
  return value.replace(/[,()]/g, " ");
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

    // PostgREST caps a single response at `db-max-rows` (1000) regardless of
    // `.range()`. `pageSize` is usually well under that, but callers CAN ask
    // for the full filtered set (`FETCH_ALL_PAGE_SIZE` = 10 000 — e.g. the
    // bulk-actions "select all N filtered" flow), and a plain `.range()`
    // would silently return only the first 1000 while `total` kept reporting
    // the real count. `fetchLargePage` issues the extra chunks transparently,
    // rebuilding the query fresh for each one (query builders aren't safe to
    // reuse across executions) — same pattern as every other provider here.
    const { data, total } = await fetchLargePage<IRow>(
      async (rangeFrom, rangeTo) => {
        const { data, error, count } = await buildOrderedQuery(
          params,
          now,
          searchCustomerIds,
        ).range(rangeFrom, rangeTo);
        if (error) throw new Error(`contacts.list: ${error.message}`);
        return { data: (data ?? []) as unknown as IRow[], count: count ?? 0 };
      },
      from,
      pageSize,
    );

    return {
      data: data.map(rowToContact),
      total,
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

  async ignore(id: ID, reason: string): Promise<IContact> {
    const { data, error } = await getSupabaseClient()
      .from(TABLE)
      .update({
        ignored_at: new Date().toISOString(),
        ignore_reason: reason,
        ignored_by: currentSellerId(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select(COLUMNS)
      .single();
    if (error) throw new Error(`contacts.ignore(${id}): ${error.message}`);
    return rowToContact(data as unknown as IRow);
  },

  async unignore(id: ID): Promise<IContact> {
    const { data, error } = await getSupabaseClient()
      .from(TABLE)
      .update({
        ignored_at: null,
        ignore_reason: null,
        ignored_by: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select(COLUMNS)
      .single();
    if (error) throw new Error(`contacts.unignore(${id}): ${error.message}`);
    return rowToContact(data as unknown as IRow);
  },

  async triageContext(contact: IContact): Promise<ITriageContext> {
    const empty: ITriageContext = {
      conversationId: null,
      firstInboundText: null,
      messageCount: 0,
    };
    if (!contact.leadId) return empty;

    const client = getSupabaseClient();

    // `conversations.lead_id` is TEXT while `contacts.lead_id` is UUID. The
    // comparison is made on the TEXT side by sending the id as a string —
    // casting the indexed column instead (`lead_id::uuid = …`) is what turned
    // a search into a sequential scan and a statement timeout once already.
    const { data: conversations, error: conversationError } = await client
      .from("conversations")
      .select("id")
      .eq("lead_id", contact.leadId)
      .order("last_message_at", { ascending: false, nullsFirst: false })
      .limit(1);
    if (conversationError) {
      throw new Error(`contacts.triageContext(${contact.id}): ${conversationError.message}`);
    }
    const conversationId = (conversations ?? [])[0]?.id as string | undefined;
    if (!conversationId) return empty;

    const [countResult, firstResult] = await Promise.all([
      client
        .from("messages")
        .select("id", { count: "exact", head: true })
        .eq("conversation_id", conversationId),
      client
        .from("messages")
        .select("text")
        .eq("conversation_id", conversationId)
        // `in` / `out`, not `inbound` / `outbound` — the column's real domain.
        .eq("direction", "in")
        .not("text", "is", null)
        .order("sent_at", { ascending: true })
        .limit(5),
    ]);
    if (countResult.error) {
      throw new Error(`contacts.triageContext(${contact.id}): ${countResult.error.message}`);
    }
    if (firstResult.error) {
      throw new Error(`contacts.triageContext(${contact.id}): ${firstResult.error.message}`);
    }

    // Reads a few and picks the first non-blank: an empty `text` is common on
    // media-only messages, and `.not(is null)` alone lets those through.
    const firstInboundText =
      ((firstResult.data ?? []) as { text: string | null }[])
        .map((row) => row.text?.trim() ?? "")
        .find((text) => text !== "") ?? null;

    return {
      conversationId,
      firstInboundText,
      messageCount: countResult.count ?? 0,
    };
  },

  async triageSuggestions(contact: IContact): Promise<ITriageSuggestion[]> {
    const client = getSupabaseClient();
    const index = new Map<string, ITriageCandidate>();

    const last8 = lastEightDigits(contact);
    const email = normalizeEmail(contact.email);
    const domain = companyEmailDomainOf(email);
    // Longest distinctive word: the more specific the token, the fewer
    // useless rows the name lookup drags in.
    const token = nameTokens(contact.name)
      .filter((value) => value.length >= MIN_SEARCHABLE_TOKEN)
      .sort((a, b) => b.length - a.length)[0];

    const lookups: PromiseLike<unknown>[] = [];

    /** Customers whose OWN record carries the number. */
    if (last8) {
      lookups.push(
        client
          .from("customers")
          .select(CUSTOMER_CANDIDATE_COLUMNS)
          .ilike("phone_digits", `%${last8}%`)
          .limit(TRIAGE_CANDIDATE_LIMIT)
          .then(({ data, error }) => {
            if (error) throw new Error(`contacts.triageSuggestions (phone): ${error.message}`);
            for (const row of (data ?? []) as unknown as ICustomerCandidateRow[]) {
              upsertCandidate(index, row.id, resolveCustomerName(row), {
                phone: row.phone,
                email: row.email,
                city: row.address?.city ?? null,
                uf: row.address?.state ?? null,
              });
            }
          }),
      );

      /** Already-linked contacts on the same line — the 9th-digit twin case. */
      lookups.push(
        client
          .from(TABLE)
          .select(LINKED_CONTACT_COLUMNS)
          .not("customer_id", "is", null)
          .is("ignored_at", null)
          .neq("id", contact.id)
          .ilike("phone_digits", `%${last8}%`)
          .limit(TRIAGE_CANDIDATE_LIMIT)
          .then(({ data, error }) => {
            if (error) {
              throw new Error(`contacts.triageSuggestions (linked phone): ${error.message}`);
            }
            for (const row of (data ?? []) as unknown as ILinkedContactRow[]) {
              upsertCandidate(index, row.customer_id, resolveCustomerName(row.customer), {
                phone: row.phone,
                email: row.email,
              });
            }
          }),
      );
    }

    if (email) {
      lookups.push(
        client
          .from("customers")
          .select(CUSTOMER_CANDIDATE_COLUMNS)
          .ilike("email", domain ? `%${safeOrTerm(domain)}` : safeOrTerm(email))
          .limit(TRIAGE_CANDIDATE_LIMIT)
          .then(({ data, error }) => {
            if (error) throw new Error(`contacts.triageSuggestions (email): ${error.message}`);
            for (const row of (data ?? []) as unknown as ICustomerCandidateRow[]) {
              upsertCandidate(index, row.id, resolveCustomerName(row), {
                phone: row.phone,
                email: row.email,
                city: row.address?.city ?? null,
                uf: row.address?.state ?? null,
              });
            }
          }),
      );

      lookups.push(
        client
          .from(TABLE)
          .select(LINKED_CONTACT_COLUMNS)
          .not("customer_id", "is", null)
          .is("ignored_at", null)
          .neq("id", contact.id)
          .ilike("email", domain ? `%${safeOrTerm(domain)}` : safeOrTerm(email))
          .limit(TRIAGE_CANDIDATE_LIMIT)
          .then(({ data, error }) => {
            if (error) {
              throw new Error(`contacts.triageSuggestions (linked email): ${error.message}`);
            }
            for (const row of (data ?? []) as unknown as ILinkedContactRow[]) {
              upsertCandidate(index, row.customer_id, resolveCustomerName(row.customer), {
                phone: row.phone,
                email: row.email,
              });
            }
          }),
      );
    }

    if (token) {
      const safe = safeOrTerm(token);
      lookups.push(
        client
          .from("customers")
          .select(CUSTOMER_CANDIDATE_COLUMNS)
          .or(
            `nome_fantasia.ilike.*${safe}*,razao_social.ilike.*${safe}*,full_name.ilike.*${safe}*`,
          )
          .limit(TRIAGE_CANDIDATE_LIMIT)
          .then(({ data, error }) => {
            if (error) throw new Error(`contacts.triageSuggestions (name): ${error.message}`);
            for (const row of (data ?? []) as unknown as ICustomerCandidateRow[]) {
              upsertCandidate(index, row.id, resolveCustomerName(row), {
                phone: row.phone,
                email: row.email,
                city: row.address?.city ?? null,
                uf: row.address?.state ?? null,
              });
            }
          }),
      );
    }

    if (lookups.length === 0) return [];
    await Promise.all(lookups);

    // Scoring lives in the engine so mock and Supabase rank identically.
    return buildTriageSuggestions(contact, [...index.values()]);
  },

  async duplicatePairs(params: { storeId?: ID } = {}): Promise<IContactDuplicatePair[]> {
    const client = getSupabaseClient();

    // Sweeps the visible base with the narrow column set the detector needs —
    // no customer/owner embeds — so the whole table costs a few cheap chunks
    // instead of a wide join. Only the contacts that end up in a pair (~95 on
    // the production base) are hydrated afterwards.
    const { data } = await fetchLargePage<IDuplicateInput>(
      async (rangeFrom, rangeTo) => {
        let query = client
          .from(TABLE)
          .select("id, name, phone, email, role, city, customer_id, last_contact_at, created_at", {
            count: "exact",
          })
          .is("ignored_at", null);
        if (params.storeId) query = query.eq("store_id", params.storeId);
        const { data, error, count } = await query
          .order("id", { ascending: true })
          .range(rangeFrom, rangeTo);
        if (error) throw new Error(`contacts.duplicatePairs: ${error.message}`);
        const rows = (data ?? []) as unknown as {
          id: string;
          name: string;
          phone: string | null;
          email: string | null;
          role: string | null;
          city: string | null;
          customer_id: string | null;
          last_contact_at: string | null;
          created_at: string;
        }[];
        return {
          data: rows.map((row) => ({
            id: row.id,
            name: row.name,
            phone: row.phone,
            email: row.email,
            role: row.role,
            city: row.city,
            customerId: row.customer_id,
            lastContactAt: row.last_contact_at,
            createdAt: row.created_at,
          })),
          count: count ?? 0,
        };
      },
      0,
      FETCH_ALL_PAGE_SIZE,
    );

    const pairs = buildDuplicatePairs(data);
    if (pairs.length === 0) return [];

    const ids = [...new Set(pairs.flatMap((pair) => [pair.primaryId, pair.duplicateId]))];
    const { data: rows, error } = await client.from(TABLE).select(COLUMNS).in("id", ids);
    if (error) throw new Error(`contacts.duplicatePairs (hydrate): ${error.message}`);

    const byId = new Map<string, IContact>();
    for (const row of (rows ?? []) as unknown as IRow[]) {
      byId.set(row.id, rowToContact(row));
    }

    return pairs.flatMap((pair) => {
      const primary = byId.get(pair.primaryId);
      const duplicate = byId.get(pair.duplicateId);
      // A row the caller can see in the sweep but not in the hydrate (RLS on
      // a wider column set) is dropped rather than half-rendered.
      if (!primary || !duplicate) return [];
      return [{ id: pair.id, reason: pair.reason, primary, duplicate }];
    });
  },

  async merge(primaryId: ID, duplicateId: ID): Promise<IContact> {
    if (primaryId === duplicateId) {
      throw new Error("contacts.merge: um contato não pode ser mesclado nele mesmo");
    }
    const [primary, duplicate] = await Promise.all([
      supabaseContactsProvider.get(primaryId),
      supabaseContactsProvider.get(duplicateId),
    ]);

    const patch = buildMergePatch(primary, duplicate);
    const merged =
      Object.keys(patch).length > 0
        ? await supabaseContactsProvider.update(primaryId, patch)
        : primary;

    // Ignored, never deleted: the absorbed record stays auditable, and the
    // reason names the survivor so the decision reads back plainly.
    await supabaseContactsProvider.ignore(duplicateId, mergeIgnoreReason(primary.name));

    return merged;
  },
};
