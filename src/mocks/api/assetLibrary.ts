import type {
  ID,
  IAssetCombo,
  IAssetLibraryItem,
  IAssetLibraryListParams,
} from "@/shared/types";
import {
  selectAllAssetCombos,
  selectAllAssetLibraryItems,
  selectAssetLibraryItemById,
} from "../store/selectors";
import { patchById, removeById, upsert } from "../store/mutations";
import { filterAssets } from "@/features/quick-send/engine/assetFiltering";
import { bumpVersion as bumpVersionEngine } from "@/features/quick-send/engine/assetVersioning";
import {
  MockNotFoundError,
  paginate,
  runApi,
  type IPaginatedResult,
  type IPaginationParams,
} from "./utils";

export type IListAssetLibraryApiParams = IAssetLibraryListParams &
  IPaginationParams & { storeId?: ID };

/** Per-seller recents (most-recent-first asset ids) — Fase 1 runtime state. */
const recentsBySeller = new Map<ID, ID[]>();
/** Per-seller favorite asset ids. */
const favoritesBySeller = new Map<ID, Set<ID>>();
/** Usage counters: assetId → count, and `${sellerId}|${assetId}` → count. */
const usageByAsset = new Map<ID, number>();
const usageBySellerAsset = new Map<string, number>();

function matches(item: IAssetLibraryItem, params: IListAssetLibraryApiParams): boolean {
  if (params.storeId && item.storeId !== params.storeId) return false;
  if (params.status && item.status !== params.status) return false;
  // category/brand/productLine/search handled by the shared engine.
  const filtered = filterAssets([item], {
    category: params.category,
    brand: params.brand,
    productLine: params.productLine,
    query: params.search,
  });
  return filtered.length > 0;
}

export const assetLibraryApi = {
  list(params: IListAssetLibraryApiParams = {}): Promise<IPaginatedResult<IAssetLibraryItem>> {
    return runApi(
      "assetLibraryApi",
      "list",
      () => {
        const all = selectAllAssetLibraryItems().filter((a) => matches(a, params));
        const sorted = [...all].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
        return paginate(sorted, params);
      },
      { payload: params },
    );
  },

  get(id: ID): Promise<IAssetLibraryItem | null> {
    return runApi("assetLibraryApi", "get", () => selectAssetLibraryItemById(id), {
      payload: { id },
    });
  },

  search(query: string): Promise<IAssetLibraryItem[]> {
    return runApi(
      "assetLibraryApi",
      "search",
      () => filterAssets(selectAllAssetLibraryItems(), { query }),
      { payload: { query } },
    );
  },

  getRecent(sellerId: ID): Promise<IAssetLibraryItem[]> {
    return runApi(
      "assetLibraryApi",
      "getRecent",
      () => {
        const ids = recentsBySeller.get(sellerId) ?? [];
        return ids
          .map((id) => selectAssetLibraryItemById(id))
          .filter((a): a is IAssetLibraryItem => a !== null);
      },
      { payload: { sellerId } },
    );
  },

  getFavorites(sellerId: ID): Promise<IAssetLibraryItem[]> {
    return runApi(
      "assetLibraryApi",
      "getFavorites",
      () => {
        const set = favoritesBySeller.get(sellerId) ?? new Set<ID>();
        return [...set]
          .map((id) => selectAssetLibraryItemById(id))
          .filter((a): a is IAssetLibraryItem => a !== null);
      },
      { payload: { sellerId } },
    );
  },

  toggleFavorite(sellerId: ID, id: ID): Promise<boolean> {
    return runApi(
      "assetLibraryApi",
      "toggleFavorite",
      () => {
        const set = favoritesBySeller.get(sellerId) ?? new Set<ID>();
        let now: boolean;
        if (set.has(id)) {
          set.delete(id);
          now = false;
        } else {
          set.add(id);
          now = true;
        }
        favoritesBySeller.set(sellerId, set);
        return now;
      },
      { payload: { sellerId, id } },
    );
  },

  create(input: Omit<IAssetLibraryItem, "id" | "createdAt" | "updatedAt">): Promise<IAssetLibraryItem> {
    return runApi(
      "assetLibraryApi",
      "create",
      () => {
        const nowIso = new Date().toISOString();
        const item: IAssetLibraryItem = {
          ...input,
          id: `asset-${crypto.randomUUID()}`,
          createdAt: nowIso,
          updatedAt: nowIso,
        };
        upsert("assetLibraryItems", item);
        return item;
      },
      { payload: input },
    );
  },

  update(id: ID, patch: Partial<IAssetLibraryItem>): Promise<IAssetLibraryItem> {
    return runApi(
      "assetLibraryApi",
      "update",
      () => {
        const updated = patchById("assetLibraryItems", id, {
          ...patch,
          updatedAt: new Date().toISOString(),
        });
        if (!updated) throw new MockNotFoundError("assetLibraryItem", id);
        return updated;
      },
      { payload: { id, patch } },
    );
  },

  publish(id: ID): Promise<IAssetLibraryItem> {
    return runApi(
      "assetLibraryApi",
      "publish",
      () => {
        const updated = patchById("assetLibraryItems", id, {
          status: "published",
          updatedAt: new Date().toISOString(),
        });
        if (!updated) throw new MockNotFoundError("assetLibraryItem", id);
        return updated;
      },
      { payload: { id } },
    );
  },

  unpublish(id: ID): Promise<IAssetLibraryItem> {
    return runApi(
      "assetLibraryApi",
      "unpublish",
      () => {
        const updated = patchById("assetLibraryItems", id, {
          status: "draft",
          updatedAt: new Date().toISOString(),
        });
        if (!updated) throw new MockNotFoundError("assetLibraryItem", id);
        return updated;
      },
      { payload: { id } },
    );
  },

  bumpVersion(
    id: ID,
    patch: Pick<IAssetLibraryItem, "storageRef" | "url">,
  ): Promise<IAssetLibraryItem> {
    return runApi(
      "assetLibraryApi",
      "bumpVersion",
      () => {
        const current = selectAssetLibraryItemById(id);
        if (!current) throw new MockNotFoundError("assetLibraryItem", id);
        const next = bumpVersionEngine(current, patch);
        const updated = patchById("assetLibraryItems", id, {
          version: next.version,
          storageRef: next.storageRef,
          url: next.url,
          previousVersion: next.previousVersion,
          updatedAt: new Date().toISOString(),
        });
        if (!updated) throw new MockNotFoundError("assetLibraryItem", id);
        return updated;
      },
      { payload: { id, patch } },
    );
  },

  delete(id: ID): Promise<IAssetLibraryItem> {
    return runApi(
      "assetLibraryApi",
      "delete",
      () => {
        const before = selectAssetLibraryItemById(id);
        if (!before) throw new MockNotFoundError("assetLibraryItem", id);
        removeById("assetLibraryItems", id);
        return before;
      },
      { payload: { id } },
    );
  },

  listCombos(storeId?: ID): Promise<IAssetCombo[]> {
    return runApi(
      "assetLibraryApi",
      "listCombos",
      () => {
        const all = selectAllAssetCombos();
        return storeId ? all.filter((c) => c.storeId === storeId) : all;
      },
      { payload: { storeId } },
    );
  },

  saveCombo(input: Omit<IAssetCombo, "id" | "createdAt" | "updatedAt">): Promise<IAssetCombo> {
    return runApi(
      "assetLibraryApi",
      "saveCombo",
      () => {
        const nowIso = new Date().toISOString();
        const combo: IAssetCombo = {
          ...input,
          id: `combo-${crypto.randomUUID()}`,
          createdAt: nowIso,
          updatedAt: nowIso,
        };
        upsert("assetCombos", combo);
        return combo;
      },
      { payload: input },
    );
  },

  deleteCombo(id: ID): Promise<IAssetCombo> {
    return runApi(
      "assetLibraryApi",
      "deleteCombo",
      () => {
        const before = selectAllAssetCombos().find((c) => c.id === id) ?? null;
        if (!before) throw new MockNotFoundError("assetCombo", id);
        removeById("assetCombos", id);
        return before;
      },
      { payload: { id } },
    );
  },

  recordSend(sellerId: ID, assetId: ID): Promise<void> {
    return runApi(
      "assetLibraryApi",
      "recordSend",
      () => {
        // Recents: move-to-front, cap at 12.
        const recents = recentsBySeller.get(sellerId) ?? [];
        const next = [assetId, ...recents.filter((id) => id !== assetId)].slice(0, 12);
        recentsBySeller.set(sellerId, next);
        // Usage counters.
        usageByAsset.set(assetId, (usageByAsset.get(assetId) ?? 0) + 1);
        const key = `${sellerId}|${assetId}`;
        usageBySellerAsset.set(key, (usageBySellerAsset.get(key) ?? 0) + 1);
      },
      { payload: { sellerId, assetId } },
    );
  },

  /** Aggregate usage stats for the management dashboard (D-13). */
  getUsageStats(): Promise<{
    topAssets: { assetId: ID; title: string; count: number }[];
    bySeller: { sellerId: ID; count: number }[];
  }> {
    return runApi(
      "assetLibraryApi",
      "getUsageStats",
      () => {
        const topAssets = [...usageByAsset.entries()]
          .map(([assetId, count]) => ({
            assetId,
            title: selectAssetLibraryItemById(assetId)?.title ?? assetId,
            count,
          }))
          .sort((a, b) => b.count - a.count);
        const perSeller = new Map<ID, number>();
        for (const [key, count] of usageBySellerAsset.entries()) {
          const sellerId = key.split("|")[0];
          perSeller.set(sellerId, (perSeller.get(sellerId) ?? 0) + count);
        }
        const bySeller = [...perSeller.entries()]
          .map(([sellerId, count]) => ({ sellerId, count }))
          .sort((a, b) => b.count - a.count);
        return { topAssets, bySeller };
      },
      {},
    );
  },
};
