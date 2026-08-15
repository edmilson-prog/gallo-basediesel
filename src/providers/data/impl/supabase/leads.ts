import type {
  ID,
  ILead,
  ILeadNote,
  ILeadStage,
  LeadNextActionKind,
  LeadOrigin,
  LeadTemperature,
  Money,
} from "@/shared/types";
import type { IListLeadsParams, ILeadsProvider } from "../../contracts/leads";
import type { IPaginatedResult } from "../../contracts/_shared";
import { getSupabaseClient } from "@/shared/lib/supabase";
import { fetchLargePage } from "./_pagination";
import { buildDigitSearchCandidates } from "@/shared/utils/digitSearch";

/**
 * Supabase implementation of {@link ILeadsProvider} (PRD-115+).
 *
 * snake_case `leads` table ↔ camelCase {@link ILead} via `rowToLead`. The
 * pipeline `stage` is an embedded {@link ILeadStage} object stored as jsonb
 * (stages are configurable per store and snapshotted on the lead), while
 * `conversations` and `tags` are `text[]`. `id`/`storeId`/`createdAt` are
 * immutable and never written by `leadPatchToRow`.
 *
 * Reads work today under the temporary permissive RLS; the mutations
 * (create/update/delete) require the write policies that land with PRD-103.
 */

interface LeadRow {
  id: string;
  store_id: string;
  seller_id: string | null;
  name: string;
  phone: string;
  email: string | null;
  avatar_url: string | null;
  stage: ILeadStage;
  temperature: LeadTemperature;
  origin: LeadOrigin;
  estimated_value: number | null;
  next_action_at: string | null;
  /** Absent from the row until migration 20260808120000 is applied. */
  next_action_kind?: LeadNextActionKind | null;
  loss_reason: string | null;
  loss_notes: string | null;
  converted_to_customer_id: string | null;
  conversations: string[];
  tags: string[];
  created_at: string;
  updated_at: string;
}

const TABLE = "leads";
const COLUMNS =
  "id, store_id, seller_id, name, phone, email, avatar_url, stage, temperature, origin, " +
  "estimated_value, next_action_at, loss_reason, loss_notes, converted_to_customer_id, " +
  "conversations, tags, created_at, updated_at";

/**
 * `next_action_kind` arrives with migration 20260808120000, and in this project
 * merging the PR does NOT apply the migration. Naming the column in a `select`
 * before it exists answers 42703 and takes the whole screen down with it, so it
 * is requested separately and the module demotes itself on the first refusal —
 * for the rest of the session, and only for the two call sites that need it.
 *
 * The list and the board never read it, which is why they stay on the fixed set
 * above: the one query that must not break is the one loading a thousand rows.
 */
let kindColumnAvailable = true;

/** Column list for the lead DETAIL, which is the only reader of the kind. */
function detailColumns(): string {
  return kindColumnAvailable ? `${COLUMNS}, next_action_kind` : COLUMNS;
}

/**
 * True — and demotes the module — only for "column does not exist". Every other
 * failure has to surface: swallowing them here would turn a permission error
 * into a silently kind-less lead.
 */
function isMissingKindColumn(error: { code?: string; message?: string } | null): boolean {
  if (!error || !kindColumnAvailable) return false;
  if (error.code !== "42703" || !(error.message ?? "").includes("next_action_kind")) return false;
  kindColumnAvailable = false;
  return true;
}

function rowToLead(row: LeadRow): ILead {
  return {
    id: row.id,
    storeId: row.store_id,
    sellerId: row.seller_id,
    name: row.name,
    phone: row.phone,
    email: row.email ?? undefined,
    // avatar_url is written server-side (webhook / Frente B migration) and
    // read-only in the app: leadPatchToRow/createInputToRow never send it.
    avatarUrl: row.avatar_url ?? undefined,
    stage: row.stage,
    temperature: row.temperature,
    origin: row.origin,
    estimatedValue: row.estimated_value ?? undefined,
    nextActionAt: row.next_action_at ?? undefined,
    nextActionKind: row.next_action_kind ?? undefined,
    lossReason: row.loss_reason ?? undefined,
    lossNotes: row.loss_notes ?? undefined,
    convertedToCustomerId: row.converted_to_customer_id ?? undefined,
    conversations: row.conversations,
    tags: row.tags,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Maps a camelCase patch to snake_case columns. `id`/`storeId`/`createdAt` are
 *  immutable and never written; `updatedAt` is set by the caller.
 *
 *  `email`/`estimatedValue`/`nextActionAt` are the inline-editable optional
 *  fields (see `buildLeadPatch`, which emits `{ field: undefined }` to mean
 *  "clear this field"). For those three, presence of the key in the patch —
 *  not just a defined value — decides whether the column is written, and an
 *  `undefined` value coalesces to `null` so a clear actually clears the row
 *  instead of silently no-oping. The other optional columns below are never
 *  cleared via this flow, so they keep the plain `!== undefined` guard.
 */
export function leadPatchToRow(patch: Partial<ILead>): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (patch.sellerId !== undefined) row.seller_id = patch.sellerId;
  if (patch.name !== undefined) row.name = patch.name;
  if (patch.phone !== undefined) row.phone = patch.phone;
  if ("email" in patch) row.email = patch.email ?? null;
  if (patch.stage !== undefined) row.stage = patch.stage;
  if (patch.temperature !== undefined) row.temperature = patch.temperature;
  if (patch.origin !== undefined) row.origin = patch.origin;
  if ("estimatedValue" in patch) row.estimated_value = patch.estimatedValue ?? null;
  if ("nextActionAt" in patch) row.next_action_at = patch.nextActionAt ?? null;
  // Dropped entirely while the column is missing, so a write that carries the
  // kind still applies its date instead of failing whole.
  if ("nextActionKind" in patch && kindColumnAvailable)
    row.next_action_kind = patch.nextActionKind ?? null;
  if (patch.lossReason !== undefined) row.loss_reason = patch.lossReason;
  if (patch.lossNotes !== undefined) row.loss_notes = patch.lossNotes;
  if (patch.convertedToCustomerId !== undefined)
    row.converted_to_customer_id = patch.convertedToCustomerId;
  if (patch.conversations !== undefined) row.conversations = patch.conversations;
  if (patch.tags !== undefined) row.tags = patch.tags;
  return row;
}

/** Maps a create input onto a full insert row, including the immutable `id`. */
function createInputToRow(
  input: Omit<ILead, "id" | "createdAt" | "updatedAt" | "conversations">,
  id: string,
): Record<string, unknown> {
  const estimatedValue: Money | undefined = input.estimatedValue;
  return {
    id,
    store_id: input.storeId,
    seller_id: input.sellerId,
    name: input.name,
    phone: input.phone,
    email: input.email ?? null,
    stage: input.stage,
    temperature: input.temperature,
    origin: input.origin,
    estimated_value: estimatedValue ?? null,
    next_action_at: input.nextActionAt ?? null,
    loss_reason: input.lossReason ?? null,
    loss_notes: input.lossNotes ?? null,
    converted_to_customer_id: input.convertedToCustomerId ?? null,
    conversations: [],
    tags: input.tags,
  };
}

interface LeadNoteRow {
  id: string;
  lead_id: string;
  author_id: string;
  content: string;
  created_at: string;
}
const NOTES_TABLE = "lead_notes";
const NOTE_COLUMNS = "id, lead_id, author_id, content, created_at";
function rowToLeadNote(row: LeadNoteRow): ILeadNote {
  return { id: row.id, authorId: row.author_id, content: row.content, createdAt: row.created_at };
}

/**
 * Builds the PostgREST `.or()` expression for the free-text lead search, or
 * `null` when the term is blank — same mechanics as buildCustomerSearchOr
 * (delimiters neutralized, digit candidates tolerate the BR 9th digit).
 */
export function buildLeadSearchOr(search: string): string | null {
  const term = search.trim();
  if (!term) return null;
  const safe = term.replace(/[,()]/g, " ");
  const filters = [`name.ilike.*${safe}*`, `phone.ilike.*${safe}*`, `email.ilike.*${safe}*`];
  for (const candidate of buildDigitSearchCandidates(term)) {
    filters.push(`phone_digits.ilike.*${candidate}*`);
  }
  return filters.join(",");
}

export const supabaseLeadsProvider: ILeadsProvider = {
  async list(params: IListLeadsParams = {}): Promise<IPaginatedResult<ILead>> {
    const buildQuery = () => {
      // Funnel scope is expressed as an INNER join on the membership table —
      // only leads that HAVE an entry in that funnel survive. `lead_id, funnel_id`
      // carries a unique index (see 20260723120000_lead_funnels_schema.sql), so
      // this never fans a lead out into duplicate rows or corrupts `count: "exact"`.
      const hasFunnelScope = params.funnelId !== undefined;
      let query = getSupabaseClient()
        .from(TABLE)
        .select(
          hasFunnelScope ? `${COLUMNS}, lead_funnel_entries!inner(funnel_id, stage_id)` : COLUMNS,
          { count: "exact" },
        );
      if (params.storeId !== undefined) query = query.eq("store_id", params.storeId);
      if (params.sellerId !== undefined) query = query.eq("seller_id", params.sellerId);
      // The legacy embedded pipeline stage (`stage->>id`) — independent of
      // `funnelId`/`funnelStageId` below, which address a different id
      // namespace (`lead_funnel_entries.stage_id`). Both can apply at once.
      if (params.stageId !== undefined) query = query.eq("stage->>id", params.stageId);
      if (params.temperature !== undefined) query = query.eq("temperature", params.temperature);
      if (params.excludeLost) query = query.is("loss_reason", null);
      if (params.search) {
        const orExpr = buildLeadSearchOr(params.search);
        if (orExpr) query = query.or(orExpr);
      }
      if (params.funnelId !== undefined) {
        query = query.eq("lead_funnel_entries.funnel_id", params.funnelId);
        if (params.funnelStageId !== undefined)
          query = query.eq("lead_funnel_entries.stage_id", params.funnelStageId);
      }
      return query;
    };

    const page = Math.max(1, Math.floor(params.page ?? 1));
    const pageSize = Math.max(1, Math.min(50_000, Math.floor(params.pageSize ?? 20)));
    const from = (page - 1) * pageSize;

    const { data, total } = await fetchLargePage<LeadRow>(
      async (rangeFrom, rangeTo) => {
        const { data, error, count } = await buildQuery()
          .order("updated_at", { ascending: false })
          .order("id", { ascending: true })
          .range(rangeFrom, rangeTo);
        if (error) throw new Error(`[supabase] leads.list failed: ${error.message}`);
        return { data: (data ?? []) as unknown as LeadRow[], count: count ?? 0 };
      },
      from,
      pageSize,
    );

    return {
      data: data.map(rowToLead),
      total,
      page,
      pageSize,
    };
  },

  async get(id: ID): Promise<ILead> {
    const read = () =>
      getSupabaseClient().from(TABLE).select(detailColumns()).eq("id", id).single();
    // The session's first detail read is what discovers whether the migration
    // has run. `detailColumns()` is re-evaluated inside the closure, so the
    // retry goes out already demoted.
    let { data, error } = await read();
    if (isMissingKindColumn(error)) ({ data, error } = await read());
    if (error) throw new Error(`[supabase] leads.get(${id}) failed: ${error.message}`);
    return rowToLead(data as unknown as LeadRow);
  },

  async getViaConversation(conversationId: ID): Promise<ILead | null> {
    // SECURITY DEFINER RPC gated by can_access_conversation: returns the
    // conversation's lead (0/1 row) bypassing the per-owner leads RLS that
    // hides an OWNERLESS lead from non-staff — WITHOUT touching the global
    // leads policy. Mirror of customers.getViaConversation.
    const { data, error } = await getSupabaseClient()
      .rpc("lead_via_conversation", { conv: conversationId })
      .maybeSingle();
    if (error)
      throw new Error(
        `[supabase] leads.getViaConversation(${conversationId}) failed: ${error.message}`,
      );
    if (!data) return null;
    return rowToLead(data as unknown as LeadRow);
  },

  async listNotes(leadId: ID): Promise<ILeadNote[]> {
    const { data, error } = await getSupabaseClient()
      .from(NOTES_TABLE)
      .select(NOTE_COLUMNS)
      .eq("lead_id", leadId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(`[supabase] leads.listNotes(${leadId}) failed: ${error.message}`);
    return (data as LeadNoteRow[]).map(rowToLeadNote);
  },

  async addNote(leadId: ID, content: string, authorId: ID): Promise<ILeadNote> {
    const id: ID = crypto.randomUUID();
    const { data, error } = await getSupabaseClient()
      .from(NOTES_TABLE)
      .insert({ id, lead_id: leadId, author_id: authorId, content })
      .select(NOTE_COLUMNS)
      .single();
    if (error) throw new Error(`[supabase] leads.addNote(${leadId}) failed: ${error.message}`);
    return rowToLeadNote(data as LeadNoteRow);
  },

  async create(
    input: Omit<ILead, "id" | "createdAt" | "updatedAt" | "conversations">,
  ): Promise<ILead> {
    const id: ID = crypto.randomUUID();
    const { data, error } = await getSupabaseClient()
      .from(TABLE)
      .insert(createInputToRow(input, id))
      .select(COLUMNS)
      .single();
    if (error) throw new Error(`[supabase] leads.create failed: ${error.message}`);
    return rowToLead(data as unknown as LeadRow);
  },

  async update(id: ID, patch: Partial<ILead>): Promise<ILead> {
    const write = () =>
      getSupabaseClient()
        .from(TABLE)
        .update({ ...leadPatchToRow(patch), updated_at: new Date().toISOString() })
        .eq("id", id)
        .select(detailColumns())
        .single();
    // Same demotion as `get`: both the patch and the returning column list are
    // rebuilt by the closure, so the retry writes the date without the kind
    // rather than losing the whole edit.
    let { data, error } = await write();
    if (isMissingKindColumn(error)) ({ data, error } = await write());
    if (error) throw new Error(`[supabase] leads.update(${id}) failed: ${error.message}`);
    return rowToLead(data as unknown as LeadRow);
  },

  async markConverted(
    leadId: ID,
    args: { stage: ILeadStage; customerId: ID },
  ): Promise<void> {
    const { error } = await getSupabaseClient().rpc("convert_lead_mark", {
      p_lead_id: leadId,
      p_customer_id: args.customerId,
      p_stage: args.stage,
    });
    if (error)
      throw new Error(`[supabase] leads.markConverted(${leadId}) failed: ${error.message}`);
  },

  async delete(id: ID): Promise<void> {
    const { error } = await getSupabaseClient().from(TABLE).delete().eq("id", id);
    if (error) throw new Error(`[supabase] leads.delete(${id}) failed: ${error.message}`);
  },
};
