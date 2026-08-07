import type {
  ContactSource,
  ICustomer,
  ID,
  ILead,
  ISeller,
  IContact,
  IContactScopeCounts,
} from "@/shared/types";
import type {
  ContactRecencyBucket,
  IListContactsParams,
} from "@/providers/data/contracts/contacts";
import { SEED_STORE_ID, SEED_VENDEDOR_SELLER_IDS } from "../data";
import { DEFAULT_SEED } from "../config";
import {
  createSeededContext,
  daysAgo,
  pickWeighted,
  randomISO,
  randomPhone,
  type ISeededContext,
} from "../generators/utils";
import {
  selectAllCustomers,
  selectAllLeads,
  selectAllSellers,
  selectCustomerById,
  selectSellerById,
} from "../store/selectors";
import { MockNotFoundError, paginate, runApi, type IPaginatedResult } from "./utils";

/**
 * Contacts mock API (Agenda). Unlike every other entity in `src/mocks/api/`,
 * this dataset is NOT part of the shared bootstrap dataset — the ~120 rows are
 * generated lazily, once, on first access, from `DEFAULT_SEED` plus whichever
 * customers/sellers/leads already exist in the main mock store. This keeps
 * Task 7 scoped to two files: wiring `contacts` into `IBootstrappedDataset` /
 * `CollectionKey` / `VOLUMES` would touch `mockStore.ts`, `mutations.ts`,
 * `bootstrap.ts` and `config.ts` for a feature still mid-rollout.
 *
 * Consequence: resetting the mock seed (Configurações → Avançado) regenerates
 * customers/sellers/leads but NOT contacts. Acceptable for now — flagged for
 * whoever eventually promotes contacts into the shared bootstrap.
 */

const TOTAL_CONTACTS = 120;

const CONTACT_TAGS = [
  "Decisor",
  "Compras",
  "Frota",
  "Oficina",
  "Técnico",
  "Financeiro",
  "Agro",
  "Industrial",
  "B2B",
  "Balcão",
  "Novo",
] as const;

const CONTACT_ROLES = [
  "Comprador",
  "Gerente de frota",
  "Financeiro",
  "Sócio-diretor",
  "Motorista",
  "Encarregado de oficina",
  "Assistente administrativo",
];

/** Real operating region (PRD briefing): FW + satellite cities across RS/SC. */
const REGION_CITIES: { city: string; uf: string }[] = [
  { city: "Frederico Westphalen", uf: "RS" },
  { city: "Palmitinho", uf: "RS" },
  { city: "Seberi", uf: "RS" },
  { city: "Iraí", uf: "RS" },
  { city: "Erechim", uf: "RS" },
  { city: "Chapecó", uf: "SC" },
  { city: "Barra Velha", uf: "SC" },
];

const NEXT_CONTACT_NOTES = [
  "Retornar sobre orçamento em aberto.",
  "Confirmar entrega da peça.",
  "Follow-up de proposta comercial.",
  "Agendar visita técnica na frota.",
  "Cobrar retorno sobre disponibilidade de estoque.",
];

interface IContactPools {
  customers: ICustomer[];
  sellers: ISeller[];
  leads: ILead[];
}

function pickContactTags(ctx: ISeededContext): string[] {
  const n = ctx.int(0, 3);
  const chosen = new Set<string>();
  while (chosen.size < n) chosen.add(ctx.pick(CONTACT_TAGS));
  return Array.from(chosen);
}

/** Weighted toward `whatsapp` — it dominates the real base (progress ledger, 2026-08-06). */
function pickSource(ctx: ISeededContext): ContactSource {
  return pickWeighted(ctx, [
    { value: "whatsapp", weight: 58 },
    { value: "dintec", weight: 16 },
    { value: "manual", weight: 10 },
    { value: "csv", weight: 6 },
    { value: "balcao", weight: 5 },
    { value: "portal_b2b", weight: 3 },
    { value: "storefront", weight: 2 },
  ]);
}

/** Date `days` in the future from `from`. Mirror of {@link daysAgo} for follow-ups. */
function daysAhead(days: number, from: Date): Date {
  return daysAgo(-days, from);
}

/**
 * A boolean array of `total` items with EXACTLY `trueCount` trues, shuffled
 * deterministically (Fisher–Yates over the seeded RNG).
 *
 * Used for the three proportions the brief calls out by name (linked/loose
 * split, opt-out rate, phone-as-name rate) instead of an independent
 * `ctx.bool(p)` per row — at n=120, a per-row coin flip can land far from the
 * target (this seed's first draft landed linked contacts at 30%, not "roughly
 * 40%", and opt-out at 0 instead of "~1%"). An exact shuffle guarantees the
 * stated proportion regardless of seed.
 */
function shuffledFlags(ctx: ISeededContext, total: number, trueCount: number): boolean[] {
  const flags = Array.from({ length: total }, (_, i) => i < trueCount);
  for (let i = flags.length - 1; i > 0; i -= 1) {
    const j = ctx.int(0, i);
    [flags[i], flags[j]] = [flags[j]!, flags[i]!];
  }
  return flags;
}

function buildRawContact(
  ctx: ISeededContext,
  sequence: number,
  pools: IContactPools,
  now: Date,
  linked: boolean,
  phoneAsName: boolean,
  forceOptOut: boolean,
): IContact {
  const id: ID = `ct-${String(sequence + 1).padStart(4, "0")}`;
  const loc = ctx.pick(REGION_CITIES);
  const phone = randomPhone(ctx);
  const phoneDigits = phone.replace(/\D/g, "");

  let customerId: ID | null = null;
  let leadId: ID | null = null;
  let name: string;
  let role: string | null;
  let email: string | null;

  if (linked) {
    customerId = ctx.pick(pools.customers).id;
    name = ctx.faker.person.fullName();
    role = ctx.bool(0.7) ? ctx.pick(CONTACT_ROLES) : null;
    email = ctx.bool(0.6) ? ctx.faker.internet.email().toLowerCase() : null;
  } else {
    leadId = ctx.pick(pools.leads).id;
    // Loose contacts that never had a WhatsApp profile name set — the raw
    // phone number IS the name (production: 1.437/3.411 loose contacts, 42%).
    name = phoneAsName ? phone : ctx.faker.person.fullName();
    role = ctx.bool(0.25) ? ctx.pick(CONTACT_ROLES) : null;
    email = ctx.bool(0.15) ? ctx.faker.internet.email().toLowerCase() : null;
  }

  const ownerSellerId = ctx.bool(0.85) ? ctx.pick(pools.sellers).id : null;

  const source = pickSource(ctx);
  const optOut = forceOptOut;
  const optOutAt = optOut ? randomISO(ctx, daysAgo(90, now), now) : null;
  const optOutBy = optOut ? ctx.pick(pools.sellers).id : null;

  const hasFollowUp = ctx.bool(0.15);
  const nextContactAt = hasFollowUp ? randomISO(ctx, now, daysAhead(21, now)) : null;
  const nextContactNote = hasFollowUp ? ctx.pick(NEXT_CONTACT_NOTES) : null;

  // Spread across every "Último contato" bucket so the filter has real rows to match.
  const recencyBucket = pickWeighted(ctx, [
    { value: "never" as const, weight: 8 },
    { value: "today" as const, weight: 10 },
    { value: "7d" as const, weight: 22 },
    { value: "30d" as const, weight: 27 },
    { value: "90d" as const, weight: 20 },
    { value: "old" as const, weight: 13 },
  ]);
  let lastContactAt: string | null;
  switch (recencyBucket) {
    case "never":
      lastContactAt = null;
      break;
    case "today":
      lastContactAt = now.toISOString();
      break;
    case "7d":
      lastContactAt = randomISO(ctx, daysAgo(7, now), daysAgo(1, now));
      break;
    case "30d":
      lastContactAt = randomISO(ctx, daysAgo(30, now), daysAgo(8, now));
      break;
    case "90d":
      lastContactAt = randomISO(ctx, daysAgo(90, now), daysAgo(31, now));
      break;
    case "old":
      lastContactAt = randomISO(ctx, daysAgo(540, now), daysAgo(91, now));
      break;
  }

  const hasWhatsapp = source === "whatsapp" ? true : ctx.bool(0.35);
  const createdAt = randomISO(ctx, daysAgo(540, now), daysAgo(1, now));
  const updatedAt = lastContactAt && lastContactAt > createdAt ? lastContactAt : createdAt;

  return {
    id,
    storeId: SEED_STORE_ID,
    name,
    role,
    phone,
    phoneDigits,
    email,
    city: loc.city,
    uf: loc.uf,
    customerId,
    customerName: null, // resolved at read time — see hydrate()
    leadId,
    ownerSellerId,
    ownerName: null, // resolved at read time — see hydrate()
    tags: pickContactTags(ctx),
    source,
    optOut,
    optOutAt,
    optOutBy,
    nextContactAt,
    nextContactNote,
    lastContactAt,
    hasWhatsapp,
    division: "parts",
    createdAt,
    updatedAt,
  };
}

function generateContacts(): IContact[] {
  const ctx = createSeededContext(DEFAULT_SEED);
  // Truncate to the minute so rapid successive calls agree (mirrors bootstrap()).
  const now = new Date(Math.floor(Date.now() / 60_000) * 60_000);

  const customers = selectAllCustomers();
  const vendedores = selectAllSellers().filter((s) => SEED_VENDEDOR_SELLER_IDS.includes(s.id));
  const leads = selectAllLeads();
  const pools: IContactPools = {
    customers,
    sellers: vendedores.length > 0 ? vendedores : selectAllSellers(),
    leads,
  };

  // Roughly 40% linked to a customer, ~1% opted out (see shuffledFlags doc).
  const linkedFlags = shuffledFlags(ctx, TOTAL_CONTACTS, Math.round(TOTAL_CONTACTS * 0.4));
  const optOutFlags = shuffledFlags(
    ctx,
    TOTAL_CONTACTS,
    Math.max(1, Math.round(TOTAL_CONTACTS * 0.01)),
  );
  const looseCount = linkedFlags.filter((f) => !f).length;
  // About 40% of the LOOSE contacts have a phone number as their name.
  const loosePhoneAsNameFlags = shuffledFlags(ctx, looseCount, Math.round(looseCount * 0.4));

  const contacts: IContact[] = [];
  let looseIndex = 0;
  for (let i = 0; i < TOTAL_CONTACTS; i += 1) {
    const linked = linkedFlags[i]!;
    const phoneAsName = linked ? false : loosePhoneAsNameFlags[looseIndex++]!;
    contacts.push(buildRawContact(ctx, i, pools, now, linked, phoneAsName, optOutFlags[i]!));
  }
  return contacts;
}

let contactsStore: IContact[] | null = null;

/** Lazy singleton — generated once per module lifetime (see file header). */
function ensureContacts(): IContact[] {
  if (contactsStore === null) contactsStore = generateContacts();
  return contactsStore;
}

function displayCustomerName(customerId: ID | null): string | null {
  if (!customerId) return null;
  const customer = selectCustomerById(customerId);
  if (!customer) return null;
  return customer.type === "B2B" ? customer.nomeFantasia : customer.fullName;
}

function displayOwnerName(ownerSellerId: ID | null): string | null {
  if (!ownerSellerId) return null;
  return selectSellerById(ownerSellerId)?.fullName ?? null;
}

/**
 * `customerName`/`ownerName` are denormalised on read and never written (see
 * `IContact`'s doc comment) — always recompute them from the live
 * customer/seller records rather than trusting whatever sits in storage.
 */
function hydrate(contact: IContact): IContact {
  return {
    ...contact,
    customerName: displayCustomerName(contact.customerId),
    ownerName: displayOwnerName(contact.ownerSellerId),
  };
}

function matchesRecencyBucket(
  lastContactAt: string | null,
  bucket: ContactRecencyBucket,
  nowMs: number,
): boolean {
  if (bucket === "nunca") return lastContactAt === null;
  if (lastContactAt === null) return false;
  const days = Math.floor((nowMs - Date.parse(lastContactAt)) / (1000 * 60 * 60 * 24));
  switch (bucket) {
    case "hoje":
      return days <= 0;
    case "7d":
      return days >= 0 && days <= 7;
    case "30d":
      return days >= 0 && days <= 30;
    case "90d+":
      return days > 90;
  }
}

/**
 * Fields this mock-API layer filters by directly: `storeId` (trivial
 * equality) and `lastContactBucket` (not covered by the contacts engine).
 * Everything else — scope, search, owners, tags, city/uf, sources — is the
 * caller's responsibility. See `impl/mock/contacts.ts` for why: the tested
 * filter engine (`applyContactFilters`/`countScopes`) lives under
 * `src/features/contacts/engine/`, and this task keeps feature code out of
 * `src/mocks/api/**` by convention (ESLint doesn't enforce this specific
 * boundary — it ignores `src/mocks/**` entirely) so only the provider layer
 * imports it.
 */
function matchesBaseParams(contact: IContact, params: IListContactsParams, nowMs: number): boolean {
  if (params.storeId !== undefined && contact.storeId !== params.storeId) return false;
  if (
    params.lastContactBucket &&
    !matchesRecencyBucket(contact.lastContactAt, params.lastContactBucket, nowMs)
  ) {
    return false;
  }
  return true;
}

function contactStatusKey(contact: IContact): string {
  if (contact.optOut) return "3-optout";
  return contact.customerId !== null ? "1-vinculado" : "2-solto";
}

function compareContacts(a: IContact, b: IContact, params: IListContactsParams): number {
  const dir = params.orderDir === "desc" ? -1 : 1;
  const key = params.orderBy ?? "name";
  const compareStr = (x: string, y: string) => x.localeCompare(y, "pt-BR") * dir;
  switch (key) {
    case "name":
      return compareStr(a.name, b.name);
    case "phone":
      return compareStr(a.phoneDigits ?? "", b.phoneDigits ?? "");
    case "customer":
      return compareStr(a.customerName ?? "", b.customerName ?? "");
    case "role":
      return compareStr(a.role ?? "", b.role ?? "");
    case "email":
      return compareStr(a.email ?? "", b.email ?? "");
    case "city":
      return compareStr(a.city ?? "", b.city ?? "");
    case "owner":
      return compareStr(a.ownerName ?? "", b.ownerName ?? "");
    case "lastContactAt":
      return (a.lastContactAt ?? "").localeCompare(b.lastContactAt ?? "") * dir;
    case "status":
      return compareStr(contactStatusKey(a), contactStatusKey(b));
    case "source":
      return compareStr(a.source, b.source);
  }
}

export function listContacts(
  params: IListContactsParams = {},
): Promise<IPaginatedResult<IContact>> {
  return runApi(
    "contactsApi",
    "list",
    () => {
      const nowMs = Date.now();
      const matched = ensureContacts().filter((c) => matchesBaseParams(c, params, nowMs));
      const hydrated = matched.map(hydrate);
      const sorted = [...hydrated].sort((a, b) => compareContacts(a, b, params));
      return paginate(sorted, params);
    },
    { payload: params },
  );
}

export function getContact(id: ID): Promise<IContact> {
  return runApi(
    "contactsApi",
    "get",
    () => {
      const found = ensureContacts().find((c) => c.id === id);
      if (!found) throw new MockNotFoundError("contact", id);
      return hydrate(found);
    },
    { payload: { id } },
  );
}

export function createContact(
  input: Omit<IContact, "id" | "createdAt" | "updatedAt" | "customerName" | "ownerName">,
): Promise<IContact> {
  return runApi(
    "contactsApi",
    "create",
    () => {
      const now = new Date().toISOString();
      const created: IContact = {
        ...input,
        id: `ct-${crypto.randomUUID()}`,
        customerName: null,
        ownerName: null,
        createdAt: now,
        updatedAt: now,
      };
      ensureContacts().push(created);
      return hydrate(created);
    },
    { payload: input },
  );
}

export function updateContact(id: ID, patch: Partial<IContact>): Promise<IContact> {
  return runApi(
    "contactsApi",
    "update",
    () => {
      // customerName/ownerName are denormalised on read and never written.
      const { customerName: _customerName, ownerName: _ownerName, ...writablePatch } = patch;
      const contacts = ensureContacts();
      const index = contacts.findIndex((c) => c.id === id);
      if (index === -1) throw new MockNotFoundError("contact", id);
      const merged = {
        ...contacts[index],
        ...writablePatch,
        updatedAt: new Date().toISOString(),
      } as IContact;
      contacts[index] = merged;
      return hydrate(merged);
    },
    { payload: { id, patch } },
  );
}

export function deleteContact(id: ID): Promise<void> {
  return runApi(
    "contactsApi",
    "delete",
    () => {
      const contacts = ensureContacts();
      const index = contacts.findIndex((c) => c.id === id);
      if (index === -1) throw new MockNotFoundError("contact", id);
      contacts.splice(index, 1);
    },
    { payload: { id } },
  );
}

/**
 * Scope counts honoring only what this layer can filter (`storeId` +
 * `lastContactBucket` — see {@link matchesBaseParams}). The full per-request
 * counts, honoring search/owner/tag/source too, are computed by the provider
 * layer via the engine's `countScopes` over an `applyContactFilters`-filtered
 * set; this entry point exists for API-surface parity and any caller that
 * only needs the coarse count.
 */
export function countContactScopes(params: IListContactsParams = {}): Promise<IContactScopeCounts> {
  return runApi(
    "contactsApi",
    "countScopes",
    () => {
      const nowMs = Date.now();
      const matched = ensureContacts().filter((c) => matchesBaseParams(c, params, nowMs));
      const counts: IContactScopeCounts = { todos: 0, vinculados: 0, soltos: 0, optout: 0 };
      for (const c of matched) {
        counts.todos += 1;
        if (c.customerId !== null) counts.vinculados += 1;
        else counts.soltos += 1;
        if (c.optOut) counts.optout += 1;
      }
      return counts;
    },
    { payload: params },
  );
}

/**
 * Grouped surface, shaped like every sibling (`customersApi`, `leadsApi`, …)
 * so `contacts` has an entry in the `@/mocks` barrel — the standalone
 * functions above stay exported too, since `impl/mock/contacts.ts` destructures
 * them off this same object and other call sites may still want them directly.
 */
export const contactsApi = {
  list: listContacts,
  get: getContact,
  create: createContact,
  update: updateContact,
  delete: deleteContact,
  countScopes: countContactScopes,
};
