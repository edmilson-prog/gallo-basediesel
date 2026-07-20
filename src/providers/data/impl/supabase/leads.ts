import type { ID, ILead, ILeadStage, LeadOrigin, LeadTemperature, Money } from "@/shared/types";
import type { IListLeadsParams, ILeadsProvider } from "../../contracts/leads";
import type { IPaginatedResult } from "../../contracts/_shared";
import { getSupabaseClient } from "@/shared/lib/supabase";
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
 *  immutable and never written; `updatedAt` is set by the caller. */
function leadPatchToRow(patch: Partial<ILead>): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (patch.sellerId !== undefined) row.seller_id = patch.sellerId;
  if (patch.name !== undefined) row.name = patch.name;
  if (patch.phone !== undefined) row.phone = patch.phone;
  if (patch.email !== undefined) row.email = patch.email;
  if (patch.stage !== undefined) row.stage = patch.stage;
  if (patch.temperature !== undefined) row.temperature = patch.temperature;
  if (patch.origin !== undefined) row.origin = patch.origin;
  if (patch.estimatedValue !== undefined) row.estimated_value = patch.estimatedValue;
  if (patch.nextActionAt !== undefined) row.next_action_at = patch.nextActionAt;
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
    let query = getSupabaseClient().from(TABLE).select(COLUMNS, { count: "exact" });

    if (params.storeId !== undefined) query = query.eq("store_id", params.storeId);
    if (params.sellerId !== undefined) query = query.eq("seller_id", params.sellerId);
    if (params.stageId !== undefined) query = query.eq("stage->>id", params.stageId);
    if (params.temperature !== undefined) query = query.eq("temperature", params.temperature);
    if (params.excludeLost) query = query.is("loss_reason", null);
    if (params.search) {
      const orExpr = buildLeadSearchOr(params.search);
      if (orExpr) query = query.or(orExpr);
    }

    const page = Math.max(1, Math.floor(params.page ?? 1));
    const pageSize = Math.max(1, Math.min(1000, Math.floor(params.pageSize ?? 20)));
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    const { data, error, count } = await query
      .order("updated_at", { ascending: false })
      .range(from, to);

    if (error) throw new Error(`[supabase] leads.list failed: ${error.message}`);

    return {
      data: (data as unknown as LeadRow[]).map(rowToLead),
      total: count ?? 0,
      page,
      pageSize,
    };
  },

  async get(id: ID): Promise<ILead> {
    const { data, error } = await getSupabaseClient()
      .from(TABLE)
      .select(COLUMNS)
      .eq("id", id)
      .single();
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
    const { data, error } = await getSupabaseClient()
      .from(TABLE)
      .update({ ...leadPatchToRow(patch), updated_at: new Date().toISOString() })
      .eq("id", id)
      .select(COLUMNS)
      .single();
    if (error) throw new Error(`[supabase] leads.update(${id}) failed: ${error.message}`);
    return rowToLead(data as unknown as LeadRow);
  },

  async delete(id: ID): Promise<void> {
    const { error } = await getSupabaseClient().from(TABLE).delete().eq("id", id);
    if (error) throw new Error(`[supabase] leads.delete(${id}) failed: ${error.message}`);
  },
};
