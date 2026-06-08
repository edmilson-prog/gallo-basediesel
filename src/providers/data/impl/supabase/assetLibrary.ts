import type {
  AssetCategory,
  AssetSensitivity,
  AssetStatus,
  ID,
  IAssetCombo,
  IAssetLibraryItem,
  IAssetLibraryListParams,
  IAssetVersionSnapshot,
  ISO8601,
} from "@/shared/types";
import type { IAssetLibraryProvider } from "../../contracts/assetLibrary";
import type { IPaginatedResult } from "../../contracts/_shared";
import { getSupabaseClient } from "@/shared/lib/supabase";

/**
 * Supabase implementation of {@link IAssetLibraryProvider} (PRD-027 D-15).
 *
 * Four tables back this domain:
 *  - `asset_library_items` — the catalog itself (snake_case ↔ {@link IAssetLibraryItem}
 *    via `rowToAsset`). The minimal version history (`previousVersion`) and the
 *    per-asset RBAC allow-list live as jsonb / `text[]` columns.
 *  - `asset_combos` — saved asset bundles ({@link IAssetCombo}); `asset_ids` is a
 *    `text[]` that preserves order.
 *  - `asset_favorites` — per-seller favorite pins (composite `(seller_id, asset_id)`),
 *    backing `getFavorites`/`toggleFavorite`.
 *  - `asset_send_log` — one row per recorded send, backing both `getRecent`
 *    (move-to-front, capped client-side) and `getUsageStats` (aggregated here).
 *
 * Reads work today under the temporary permissive RLS; the mutations
 * (create/update/publish/…/recordSend) require the write policies that land
 * with PRD-103.
 *
 * `recordSend`'s sensitivity gate (mock D-12) is intentionally NOT re-enforced
 * here: that check depends on the runtime auth context / RBAC engine, which is
 * a Fase-2 concern handled by RLS + an Edge Function. The table-backed ledger
 * write is implemented; see the inline note on `recordSend`.
 */

interface AssetRow {
  id: string;
  store_id: string;
  division: IAssetLibraryItem["division"];
  title: string;
  category: AssetCategory;
  brand: string | null;
  product_line: string | null;
  kind: IAssetLibraryItem["kind"];
  storage_ref: string | null;
  media_asset_id: string | null;
  url: string | null;
  version: number;
  previous_version: IAssetVersionSnapshot | null;
  status: AssetStatus;
  sensitivity: AssetSensitivity;
  allowed_role_ids: string[] | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

interface ComboRow {
  id: string;
  store_id: string;
  title: string;
  asset_ids: string[];
  owner_id: string;
  created_at: string;
  updated_at: string;
}

interface SendLogRow {
  asset_id: string;
  seller_id: string;
}

const TABLE = "asset_library_items";
const COMBOS_TABLE = "asset_combos";
const FAVORITES_TABLE = "asset_favorites";
const SEND_LOG_TABLE = "asset_send_log";

const COLUMNS =
  "id, store_id, division, title, category, brand, product_line, kind, storage_ref, " +
  "media_asset_id, url, version, previous_version, status, sensitivity, allowed_role_ids, " +
  "created_by, created_at, updated_at";
const COMBO_COLUMNS = "id, store_id, title, asset_ids, owner_id, created_at, updated_at";

function rowToAsset(row: AssetRow): IAssetLibraryItem {
  return {
    id: row.id,
    storeId: row.store_id,
    division: row.division,
    title: row.title,
    category: row.category,
    brand: row.brand ?? undefined,
    productLine: row.product_line ?? undefined,
    kind: row.kind,
    storageRef: row.storage_ref ?? undefined,
    mediaAssetId: row.media_asset_id ?? undefined,
    url: row.url ?? undefined,
    version: row.version,
    previousVersion: row.previous_version ?? undefined,
    status: row.status,
    sensitivity: row.sensitivity,
    allowedRoleIds: row.allowed_role_ids ?? undefined,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowToCombo(row: ComboRow): IAssetCombo {
  return {
    id: row.id,
    storeId: row.store_id,
    title: row.title,
    assetIds: row.asset_ids,
    ownerId: row.owner_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Maps a camelCase patch to snake_case columns. `id`/`storeId`/`createdAt` are
 *  immutable and never written; `updatedAt` is set by the caller. */
function assetPatchToRow(patch: Partial<IAssetLibraryItem>): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (patch.division !== undefined) row.division = patch.division;
  if (patch.title !== undefined) row.title = patch.title;
  if (patch.category !== undefined) row.category = patch.category;
  if (patch.brand !== undefined) row.brand = patch.brand;
  if (patch.productLine !== undefined) row.product_line = patch.productLine;
  if (patch.kind !== undefined) row.kind = patch.kind;
  if (patch.storageRef !== undefined) row.storage_ref = patch.storageRef;
  if (patch.mediaAssetId !== undefined) row.media_asset_id = patch.mediaAssetId;
  if (patch.url !== undefined) row.url = patch.url;
  if (patch.version !== undefined) row.version = patch.version;
  if (patch.previousVersion !== undefined) row.previous_version = patch.previousVersion;
  if (patch.status !== undefined) row.status = patch.status;
  if (patch.sensitivity !== undefined) row.sensitivity = patch.sensitivity;
  if (patch.allowedRoleIds !== undefined) row.allowed_role_ids = patch.allowedRoleIds;
  if (patch.createdBy !== undefined) row.created_by = patch.createdBy;
  return row;
}

/** Maps a create input onto a full insert row, including the server-derived id. */
function createInputToRow(
  input: Omit<IAssetLibraryItem, "id" | "storeId" | "createdAt" | "updatedAt">,
  id: string,
  storeId: string,
): Record<string, unknown> {
  return {
    id,
    store_id: storeId,
    division: input.division,
    title: input.title,
    category: input.category,
    brand: input.brand ?? null,
    product_line: input.productLine ?? null,
    kind: input.kind,
    storage_ref: input.storageRef ?? null,
    media_asset_id: input.mediaAssetId ?? null,
    url: input.url ?? null,
    version: input.version,
    previous_version: input.previousVersion ?? null,
    status: input.status,
    sensitivity: input.sensitivity,
    allowed_role_ids: input.allowedRoleIds ?? null,
    created_by: input.createdBy,
  };
}

/** Fetches a single asset row by id, returning `null` when absent (PGRST116). */
async function fetchAsset(id: ID): Promise<IAssetLibraryItem | null> {
  const { data, error } = await getSupabaseClient()
    .from(TABLE)
    .select(COLUMNS)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`[supabase] assetLibrary.get(${id}) failed: ${error.message}`);
  return data ? rowToAsset(data as unknown as AssetRow) : null;
}

/** Hydrates assets by id preserving the supplied order (used by recents/favorites). */
async function fetchAssetsByIds(ids: ID[]): Promise<IAssetLibraryItem[]> {
  if (ids.length === 0) return [];
  const { data, error } = await getSupabaseClient().from(TABLE).select(COLUMNS).in("id", ids);
  if (error) throw new Error(`[supabase] assetLibrary.fetchAssetsByIds failed: ${error.message}`);
  const byId = new Map<string, IAssetLibraryItem>(
    (data as unknown as AssetRow[]).map((row) => [row.id, rowToAsset(row)]),
  );
  return ids.map((id) => byId.get(id)).filter((a): a is IAssetLibraryItem => a !== undefined);
}

export const supabaseAssetLibraryProvider: IAssetLibraryProvider = {
  async list(filter: IAssetLibraryListParams): Promise<IPaginatedResult<IAssetLibraryItem>> {
    let query = getSupabaseClient().from(TABLE).select(COLUMNS, { count: "exact" });

    if (filter.storeId !== undefined) query = query.eq("store_id", filter.storeId);
    if (filter.category !== undefined) query = query.eq("category", filter.category);
    if (filter.brand !== undefined) query = query.eq("brand", filter.brand);
    if (filter.productLine !== undefined) query = query.eq("product_line", filter.productLine);
    if (filter.status !== undefined) query = query.eq("status", filter.status);
    if (filter.search) query = query.ilike("title", `%${filter.search}%`);

    const page = Math.max(1, Math.floor(filter.page ?? 1));
    const pageSize = Math.max(1, Math.min(200, Math.floor(filter.pageSize ?? 20)));
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    const { data, error, count } = await query
      .order("updated_at", { ascending: false })
      .range(from, to);

    if (error) throw new Error(`[supabase] assetLibrary.list failed: ${error.message}`);

    return {
      data: (data as unknown as AssetRow[]).map(rowToAsset),
      total: count ?? 0,
      page,
      pageSize,
    };
  },

  async get(id: ID): Promise<IAssetLibraryItem | null> {
    return fetchAsset(id);
  },

  async search(query: string): Promise<IAssetLibraryItem[]> {
    const { data, error } = await getSupabaseClient()
      .from(TABLE)
      .select(COLUMNS)
      .ilike("title", `%${query}%`)
      .order("updated_at", { ascending: false });
    if (error) throw new Error(`[supabase] assetLibrary.search failed: ${error.message}`);
    return (data as unknown as AssetRow[]).map(rowToAsset);
  },

  async getRecent(sellerId: ID): Promise<IAssetLibraryItem[]> {
    // Recents derive from the send ledger: most-recent-first, de-duplicated,
    // capped at 12 (mirrors the mock). `sent_at` ordering carries the recency.
    const { data, error } = await getSupabaseClient()
      .from(SEND_LOG_TABLE)
      .select("asset_id")
      .eq("seller_id", sellerId)
      .order("sent_at", { ascending: false })
      .limit(200);
    if (error)
      throw new Error(`[supabase] assetLibrary.getRecent(${sellerId}) failed: ${error.message}`);

    const seen = new Set<string>();
    const orderedIds: ID[] = [];
    for (const row of data as SendLogRow[]) {
      if (seen.has(row.asset_id)) continue;
      seen.add(row.asset_id);
      orderedIds.push(row.asset_id);
      if (orderedIds.length >= 12) break;
    }
    return fetchAssetsByIds(orderedIds);
  },

  async getFavorites(sellerId: ID): Promise<IAssetLibraryItem[]> {
    const { data, error } = await getSupabaseClient()
      .from(FAVORITES_TABLE)
      .select("asset_id")
      .eq("seller_id", sellerId)
      .order("created_at", { ascending: false });
    if (error)
      throw new Error(`[supabase] assetLibrary.getFavorites(${sellerId}) failed: ${error.message}`);
    const ids = (data as { asset_id: string }[]).map((r) => r.asset_id);
    return fetchAssetsByIds(ids);
  },

  async toggleFavorite(sellerId: ID, id: ID): Promise<boolean> {
    const client = getSupabaseClient();
    const { data: existing, error: selectError } = await client
      .from(FAVORITES_TABLE)
      .select("seller_id")
      .eq("seller_id", sellerId)
      .eq("asset_id", id)
      .maybeSingle();
    if (selectError)
      throw new Error(
        `[supabase] assetLibrary.toggleFavorite(${sellerId}, ${id}) failed: ${selectError.message}`,
      );

    if (existing) {
      const { error } = await client
        .from(FAVORITES_TABLE)
        .delete()
        .eq("seller_id", sellerId)
        .eq("asset_id", id);
      if (error)
        throw new Error(
          `[supabase] assetLibrary.toggleFavorite(${sellerId}, ${id}) failed: ${error.message}`,
        );
      return false;
    }

    const { error } = await client
      .from(FAVORITES_TABLE)
      .insert({ seller_id: sellerId, asset_id: id });
    if (error)
      throw new Error(
        `[supabase] assetLibrary.toggleFavorite(${sellerId}, ${id}) failed: ${error.message}`,
      );
    return true;
  },

  async create(
    input: Omit<IAssetLibraryItem, "id" | "storeId" | "createdAt" | "updatedAt">,
  ): Promise<IAssetLibraryItem> {
    // The contract strips `storeId` from the create input; the mock layer injects
    // it from the active multistore context (`withCreateStoreId`). The Supabase
    // path expects the caller to thread the scoped storeId through the input
    // object, so we read it defensively here.
    const scoped = input as typeof input & { storeId?: ID };
    const storeId = scoped.storeId ?? "";
    const id: ID = crypto.randomUUID();
    const { data, error } = await getSupabaseClient()
      .from(TABLE)
      .insert(createInputToRow(input, id, storeId))
      .select(COLUMNS)
      .single();
    if (error) throw new Error(`[supabase] assetLibrary.create failed: ${error.message}`);
    return rowToAsset(data as unknown as AssetRow);
  },

  async update(id: ID, patch: Partial<IAssetLibraryItem>): Promise<IAssetLibraryItem> {
    const { data, error } = await getSupabaseClient()
      .from(TABLE)
      .update({ ...assetPatchToRow(patch), updated_at: new Date().toISOString() })
      .eq("id", id)
      .select(COLUMNS)
      .single();
    if (error) throw new Error(`[supabase] assetLibrary.update(${id}) failed: ${error.message}`);
    return rowToAsset(data as unknown as AssetRow);
  },

  async publish(id: ID): Promise<IAssetLibraryItem> {
    const { data, error } = await getSupabaseClient()
      .from(TABLE)
      .update({ status: "published", updated_at: new Date().toISOString() })
      .eq("id", id)
      .select(COLUMNS)
      .single();
    if (error) throw new Error(`[supabase] assetLibrary.publish(${id}) failed: ${error.message}`);
    return rowToAsset(data as unknown as AssetRow);
  },

  async unpublish(id: ID): Promise<IAssetLibraryItem> {
    const { data, error } = await getSupabaseClient()
      .from(TABLE)
      .update({ status: "draft", updated_at: new Date().toISOString() })
      .eq("id", id)
      .select(COLUMNS)
      .single();
    if (error) throw new Error(`[supabase] assetLibrary.unpublish(${id}) failed: ${error.message}`);
    return rowToAsset(data as unknown as AssetRow);
  },

  async bumpVersion(
    id: ID,
    patch: Pick<IAssetLibraryItem, "storageRef" | "url">,
  ): Promise<IAssetLibraryItem> {
    // Compute the next version from the current row: the prior current becomes
    // the `previousVersion` snapshot and `version` is incremented (mirrors the
    // `assetVersioning` engine). Read-modify-write — concurrent bumps would need
    // an RPC for atomicity (deferred to PRD-103 write hardening).
    const current = await fetchAsset(id);
    if (!current)
      throw new Error(`[supabase] assetLibrary.bumpVersion(${id}) failed: asset not found`);

    const nowIso: ISO8601 = new Date().toISOString();
    const previousVersion: IAssetVersionSnapshot = {
      version: current.version,
      storageRef: current.storageRef,
      url: current.url,
      updatedAt: current.updatedAt,
    };

    const { data, error } = await getSupabaseClient()
      .from(TABLE)
      .update({
        version: current.version + 1,
        storage_ref: patch.storageRef ?? null,
        url: patch.url ?? null,
        previous_version: previousVersion,
        updated_at: nowIso,
      })
      .eq("id", id)
      .select(COLUMNS)
      .single();
    if (error)
      throw new Error(`[supabase] assetLibrary.bumpVersion(${id}) failed: ${error.message}`);
    return rowToAsset(data as unknown as AssetRow);
  },

  async delete(id: ID): Promise<IAssetLibraryItem> {
    const { data, error } = await getSupabaseClient()
      .from(TABLE)
      .delete()
      .eq("id", id)
      .select(COLUMNS)
      .single();
    if (error) throw new Error(`[supabase] assetLibrary.delete(${id}) failed: ${error.message}`);
    return rowToAsset(data as unknown as AssetRow);
  },

  async listCombos(storeId?: ID): Promise<IAssetCombo[]> {
    let query = getSupabaseClient().from(COMBOS_TABLE).select(COMBO_COLUMNS);
    if (storeId !== undefined) query = query.eq("store_id", storeId);
    const { data, error } = await query.order("created_at", { ascending: false });
    if (error) throw new Error(`[supabase] assetLibrary.listCombos failed: ${error.message}`);
    return (data as unknown as ComboRow[]).map(rowToCombo);
  },

  async saveCombo(
    input: Omit<IAssetCombo, "id" | "storeId" | "createdAt" | "updatedAt">,
  ): Promise<IAssetCombo> {
    // As with `create`, the contract strips `storeId`; the mock injects it from
    // context. Read it defensively from the scoped input on the Supabase path.
    const scoped = input as typeof input & { storeId?: ID };
    const storeId = scoped.storeId ?? "";
    const id: ID = crypto.randomUUID();
    const { data, error } = await getSupabaseClient()
      .from(COMBOS_TABLE)
      .insert({
        id,
        store_id: storeId,
        title: input.title,
        asset_ids: input.assetIds,
        owner_id: input.ownerId,
      })
      .select(COMBO_COLUMNS)
      .single();
    if (error) throw new Error(`[supabase] assetLibrary.saveCombo failed: ${error.message}`);
    return rowToCombo(data as unknown as ComboRow);
  },

  async deleteCombo(id: ID): Promise<IAssetCombo> {
    const { data, error } = await getSupabaseClient()
      .from(COMBOS_TABLE)
      .delete()
      .eq("id", id)
      .select(COMBO_COLUMNS)
      .single();
    if (error)
      throw new Error(`[supabase] assetLibrary.deleteCombo(${id}) failed: ${error.message}`);
    return rowToCombo(data as unknown as ComboRow);
  },

  async recordSend(sellerId: ID, assetId: ID): Promise<void> {
    // Append a ledger row; recents + usage stats derive from it. The mock's
    // sensitivity gate (D-12) is NOT replicated here on purpose: enforcing
    // "viewer without permission cannot send sensitive assets" requires the
    // runtime auth/RBAC context, which in Fase 2 is owned by RLS policies and an
    // Edge Function — not this thin table-write provider.
    const id: ID = crypto.randomUUID();
    const { error } = await getSupabaseClient().from(SEND_LOG_TABLE).insert({
      id,
      seller_id: sellerId,
      asset_id: assetId,
      sent_at: new Date().toISOString(),
    });
    if (error)
      throw new Error(
        `[supabase] assetLibrary.recordSend(${sellerId}, ${assetId}) failed: ${error.message}`,
      );
  },

  async getUsageStats(): Promise<{
    topAssets: { assetId: ID; title: string; count: number }[];
    bySeller: { sellerId: ID; count: number }[];
  }> {
    // Fase 1 aggregates ALL recorded sends (from/to are forward-compat/unused).
    // We pull the raw ledger and aggregate client-side; a SQL view / RPC would
    // be the Fase-2 hardening for large volumes (deferred to PRD-103).
    const { data, error } = await getSupabaseClient()
      .from(SEND_LOG_TABLE)
      .select("asset_id, seller_id");
    if (error) throw new Error(`[supabase] assetLibrary.getUsageStats failed: ${error.message}`);

    const rows = data as SendLogRow[];
    const byAsset = new Map<string, number>();
    const bySellerMap = new Map<string, number>();
    for (const row of rows) {
      byAsset.set(row.asset_id, (byAsset.get(row.asset_id) ?? 0) + 1);
      bySellerMap.set(row.seller_id, (bySellerMap.get(row.seller_id) ?? 0) + 1);
    }

    const assets = await fetchAssetsByIds([...byAsset.keys()]);
    const titleById = new Map<string, string>(assets.map((a) => [a.id, a.title]));

    const topAssets = [...byAsset.entries()]
      .map(([assetId, count]) => ({ assetId, title: titleById.get(assetId) ?? assetId, count }))
      .sort((a, b) => b.count - a.count);
    const bySeller = [...bySellerMap.entries()]
      .map(([sellerId, count]) => ({ sellerId, count }))
      .sort((a, b) => b.count - a.count);

    return { topAssets, bySeller };
  },
};
