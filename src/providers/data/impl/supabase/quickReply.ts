import type { ID, IQuickReply } from "@/shared/types";
import type { IQuickReplyProvider } from "../../contracts/quickReply";
import { getSupabaseClient } from "@/shared/lib/supabase";

/**
 * Supabase implementation of {@link IQuickReplyProvider} (PRD-027 D-15 / RNF-007).
 *
 * snake_case `quick_replies` table ↔ camelCase {@link IQuickReply} via
 * `rowToQuickReply`. Snippets are flat (no child table); `allowed_role_ids` is a
 * `text[]` of RBAC role ids and `body` carries the `{{...}}` placeholder text.
 * `owner_id` references the owning seller. `id`/`storeId`/`createdAt` are
 * immutable and never written by `quickReplyPatchToRow`; `updatedAt` is stamped
 * by the caller on each mutation.
 *
 * `list` mirrors the mock visibility rule: when `sellerId` is supplied a seller
 * sees every `shared` snippet plus their own `private` ones. `findByShortcut`
 * prefers the seller's own private snippet, falling back to any shared snippet.
 *
 * Reads work today under the temporary permissive RLS; the mutations
 * (create/update/delete) require the write policies that land with PRD-103.
 */

interface QuickReplyRow {
  id: string;
  store_id: string;
  shortcut: string;
  title: string;
  body: string;
  scope: IQuickReply["scope"];
  owner_id: string;
  allowed_role_ids: string[] | null;
  created_at: string;
  updated_at: string;
}

const TABLE = "quick_replies";
const COLUMNS =
  "id, store_id, shortcut, title, body, scope, owner_id, allowed_role_ids, created_at, updated_at";

function rowToQuickReply(row: QuickReplyRow): IQuickReply {
  return {
    id: row.id,
    storeId: row.store_id,
    shortcut: row.shortcut,
    title: row.title,
    body: row.body,
    scope: row.scope,
    ownerId: row.owner_id,
    allowedRoleIds: row.allowed_role_ids ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Maps a camelCase patch to snake_case columns. `id`/`storeId`/`createdAt` are
 *  immutable and never written; `updatedAt` is set by the caller. */
function quickReplyPatchToRow(patch: Partial<IQuickReply>): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (patch.shortcut !== undefined) row.shortcut = patch.shortcut;
  if (patch.title !== undefined) row.title = patch.title;
  if (patch.body !== undefined) row.body = patch.body;
  if (patch.scope !== undefined) row.scope = patch.scope;
  if (patch.ownerId !== undefined) row.owner_id = patch.ownerId;
  if (patch.allowedRoleIds !== undefined) row.allowed_role_ids = patch.allowedRoleIds;
  return row;
}

/** Maps a create input onto a full insert row, including the immutable `id`. */
function createInputToRow(
  input: Omit<IQuickReply, "id" | "storeId" | "createdAt" | "updatedAt">,
  id: string,
  storeId: ID,
  nowIso: string,
): Record<string, unknown> {
  return {
    id,
    store_id: storeId,
    shortcut: input.shortcut,
    title: input.title,
    body: input.body,
    scope: input.scope,
    owner_id: input.ownerId,
    allowed_role_ids: input.allowedRoleIds ?? null,
    created_at: nowIso,
    updated_at: nowIso,
  };
}

export const supabaseQuickReplyProvider: IQuickReplyProvider = {
  async list(params: {
    storeId?: ID;
    sellerId?: ID;
    scope?: "private" | "shared";
  }): Promise<IQuickReply[]> {
    let query = getSupabaseClient().from(TABLE).select(COLUMNS);

    if (params.storeId !== undefined) query = query.eq("store_id", params.storeId);
    if (params.scope !== undefined) query = query.eq("scope", params.scope);
    // A seller sees every `shared` snippet plus their own `private` ones.
    if (params.sellerId !== undefined) {
      query = query.or(`scope.eq.shared,owner_id.eq.${params.sellerId}`);
    }

    const { data, error } = await query.order("created_at", { ascending: true });
    if (error) throw new Error(`[supabase] quickReply.list failed: ${error.message}`);
    return (data as unknown as QuickReplyRow[]).map(rowToQuickReply);
  },

  async get(id: ID): Promise<IQuickReply | null> {
    const { data, error } = await getSupabaseClient()
      .from(TABLE)
      .select(COLUMNS)
      .eq("id", id)
      .maybeSingle();
    if (error) throw new Error(`[supabase] quickReply.get(${id}) failed: ${error.message}`);
    return data ? rowToQuickReply(data as unknown as QuickReplyRow) : null;
  },

  async findByShortcut(shortcut: string, sellerId: ID): Promise<IQuickReply | null> {
    const { data, error } = await getSupabaseClient()
      .from(TABLE)
      .select(COLUMNS)
      .eq("shortcut", shortcut);
    if (error)
      throw new Error(`[supabase] quickReply.findByShortcut(${shortcut}) failed: ${error.message}`);

    const candidates = (data as unknown as QuickReplyRow[]).map(rowToQuickReply);
    // Prefer the seller's own private snippet, then any shared one.
    const own = candidates.find((q) => q.scope === "private" && q.ownerId === sellerId);
    if (own) return own;
    return candidates.find((q) => q.scope === "shared") ?? null;
  },

  async create(
    input: Omit<IQuickReply, "id" | "storeId" | "createdAt" | "updatedAt">,
  ): Promise<IQuickReply> {
    // `storeId` is stripped from the create input by the contract; the scoped
    // mock provider injects it. Mirror that here, reading it off the input when
    // the caller passes it through (cast to a permissive shape).
    const withStore = input as typeof input & { storeId?: ID };
    const storeId: ID = withStore.storeId ?? "";
    const id: ID = `qr-${crypto.randomUUID()}`;
    const nowIso = new Date().toISOString();

    const { data, error } = await getSupabaseClient()
      .from(TABLE)
      .insert(createInputToRow(input, id, storeId, nowIso))
      .select(COLUMNS)
      .single();
    if (error) throw new Error(`[supabase] quickReply.create failed: ${error.message}`);
    return rowToQuickReply(data as unknown as QuickReplyRow);
  },

  async update(id: ID, patch: Partial<IQuickReply>): Promise<IQuickReply> {
    const { data, error } = await getSupabaseClient()
      .from(TABLE)
      .update({ ...quickReplyPatchToRow(patch), updated_at: new Date().toISOString() })
      .eq("id", id)
      .select(COLUMNS)
      .single();
    if (error) throw new Error(`[supabase] quickReply.update(${id}) failed: ${error.message}`);
    return rowToQuickReply(data as unknown as QuickReplyRow);
  },

  async delete(id: ID): Promise<IQuickReply> {
    // The contract returns the deleted snippet, so read it back before removing.
    const { data, error } = await getSupabaseClient()
      .from(TABLE)
      .delete()
      .eq("id", id)
      .select(COLUMNS)
      .single();
    if (error) throw new Error(`[supabase] quickReply.delete(${id}) failed: ${error.message}`);
    return rowToQuickReply(data as unknown as QuickReplyRow);
  },
};
