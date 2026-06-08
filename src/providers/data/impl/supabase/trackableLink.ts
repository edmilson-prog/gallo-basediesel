import type { ID, ITrackableLink } from "@/shared/types";
import type { ITrackableLinkProvider } from "../../contracts/trackableLink";
import { getSupabaseClient } from "@/shared/lib/supabase";

/**
 * Supabase implementation of {@link ITrackableLinkProvider} (PRD-027 D-15).
 *
 * snake_case `trackable_links` table ↔ camelCase {@link ITrackableLink} via
 * `rowToTrackableLink`. The `utm` object is stored as jsonb; `opens` is an
 * integer counter incremented by `registerOpen`. Optional FKs:
 * `store_id`->stores, `conversation_id`->conversations, `lead_id`->leads.
 * `asset_id` is plain text (no FK) because the `asset_library_items` table
 * (PRD-027 D-13) is not yet materialized. `created_by` is plain text (no FK):
 * it is a user/seller id whose authoritative target depends on auth wiring
 * (PRD-103) and is intentionally left polymorphic for now.
 *
 * Mock parity note: the mock layer derives `shortRef`/`utm` defaults via the
 * quick-send engine on `create`. The Supabase write path assumes the caller
 * (the quick-send feature) supplies a fully-built input, so it persists the
 * provided values verbatim. The engine-driven defaulting is orchestration that
 * lives above the provider and is out of scope here.
 *
 * Reads work today under the temporary permissive RLS; the mutations
 * (create/registerOpen) require the write policies that land with PRD-103.
 */

interface TrackableLinkRow {
  id: string;
  store_id: string;
  asset_id: string | null;
  conversation_id: string | null;
  lead_id: string | null;
  target_url: string;
  short_ref: string;
  utm: ITrackableLink["utm"] | null;
  created_by: string;
  opens: number;
  last_opened_at: string | null;
  created_at: string;
}

const TABLE = "trackable_links";
const COLUMNS =
  "id, store_id, asset_id, conversation_id, lead_id, target_url, short_ref, utm, created_by, " +
  "opens, last_opened_at, created_at";

function rowToTrackableLink(row: TrackableLinkRow): ITrackableLink {
  return {
    id: row.id,
    storeId: row.store_id,
    assetId: row.asset_id ?? undefined,
    conversationId: row.conversation_id ?? undefined,
    leadId: row.lead_id ?? undefined,
    targetUrl: row.target_url,
    shortRef: row.short_ref,
    utm: row.utm ?? undefined,
    createdBy: row.created_by,
    opens: row.opens,
    lastOpenedAt: row.last_opened_at ?? undefined,
    createdAt: row.created_at,
  };
}

/** Maps a create input onto a full insert row, including the immutable `id`.
 *  `storeId`/`createdAt`/`opens` are set here; `opens` always starts at 0. */
function createInputToRow(
  input: Omit<ITrackableLink, "id" | "storeId" | "createdAt" | "opens">,
  id: string,
  storeId: string,
): Record<string, unknown> {
  return {
    id,
    store_id: storeId,
    asset_id: input.assetId ?? null,
    conversation_id: input.conversationId ?? null,
    lead_id: input.leadId ?? null,
    target_url: input.targetUrl,
    short_ref: input.shortRef,
    utm: input.utm ?? null,
    created_by: input.createdBy,
    opens: 0,
    last_opened_at: input.lastOpenedAt ?? null,
  };
}

export const supabaseTrackableLinkProvider: ITrackableLinkProvider = {
  async create(
    input: Omit<ITrackableLink, "id" | "storeId" | "createdAt" | "opens">,
  ): Promise<ITrackableLink> {
    const id: ID = `tl-${crypto.randomUUID()}`;
    // `storeId` is stripped from the public input type but supplied by the
    // store-scope wrapper at the call site; read it defensively off the input.
    const storeId = (input as typeof input & { storeId?: ID }).storeId ?? "";
    const { data, error } = await getSupabaseClient()
      .from(TABLE)
      .insert(createInputToRow(input, id, storeId))
      .select(COLUMNS)
      .single();
    if (error) throw new Error(`[supabase] trackableLink.create failed: ${error.message}`);
    return rowToTrackableLink(data as unknown as TrackableLinkRow);
  },

  async get(id: ID): Promise<ITrackableLink | null> {
    const { data, error } = await getSupabaseClient()
      .from(TABLE)
      .select(COLUMNS)
      .eq("id", id)
      .maybeSingle();
    if (error) throw new Error(`[supabase] trackableLink.get(${id}) failed: ${error.message}`);
    return data ? rowToTrackableLink(data as unknown as TrackableLinkRow) : null;
  },

  async listByConversation(conversationId: ID): Promise<ITrackableLink[]> {
    const { data, error } = await getSupabaseClient()
      .from(TABLE)
      .select(COLUMNS)
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true });
    if (error)
      throw new Error(
        `[supabase] trackableLink.listByConversation(${conversationId}) failed: ${error.message}`,
      );
    return (data as unknown as TrackableLinkRow[]).map(rowToTrackableLink);
  },

  async registerOpen(id: ID): Promise<ITrackableLink> {
    const client = getSupabaseClient();
    // Read-modify-write the counter. A race-free path would use a Postgres RPC
    // (`opens = opens + 1`); that atomic increment lands with the write policies
    // in PRD-103. For the POC the read-then-update is acceptable.
    const { data: current, error: readError } = await client
      .from(TABLE)
      .select(COLUMNS)
      .eq("id", id)
      .single();
    if (readError)
      throw new Error(`[supabase] trackableLink.registerOpen(${id}) failed: ${readError.message}`);

    const currentRow = current as unknown as TrackableLinkRow;
    const { data, error } = await client
      .from(TABLE)
      .update({ opens: currentRow.opens + 1, last_opened_at: new Date().toISOString() })
      .eq("id", id)
      .select(COLUMNS)
      .single();
    if (error)
      throw new Error(`[supabase] trackableLink.registerOpen(${id}) failed: ${error.message}`);
    return rowToTrackableLink(data as unknown as TrackableLinkRow);
  },
};
