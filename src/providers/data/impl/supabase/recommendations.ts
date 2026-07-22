import type {
  ID,
  IRecommendation,
  RecommendationPriority,
  RecommendationType,
} from "@/shared/types";
import type {
  IListRecommendationsParams,
  IRecommendationsProvider,
} from "../../contracts/recommendations";
import type { IPaginatedResult } from "../../contracts/_shared";
import { getSupabaseClient } from "@/shared/lib/supabase";
import { fetchLargePage } from "./_pagination";

/**
 * Supabase implementation of {@link IRecommendationsProvider} (PRD-053 / PRD-150+).
 *
 * snake_case `recommendations` table ↔ camelCase {@link IRecommendation} via
 * `rowToRecommendation`. A recommendation is a stored, owned record (produced by
 * the analytics/IA layer) addressed to a seller about a subject (typically a
 * customer); it has no nested objects, so every field maps to a flat column.
 * `id`/`storeId`/`createdAt` are immutable and never written.
 *
 * The mock orders by a derived priority score (critical > high > medium > low).
 * PostgREST cannot order by a derived rank, so each fetched page is re-sorted in
 * memory by `PRIORITY_RANK` to mirror the mock's surfacing.
 *
 * Reads work today under the temporary permissive RLS; the `resolve` mutation
 * requires the write policies that land with PRD-103.
 */

interface RecommendationRow {
  id: string;
  store_id: string;
  seller_id: string;
  subject_id: string;
  type: RecommendationType;
  priority: RecommendationPriority;
  title: string;
  description: string;
  action_href: string | null;
  resolved: boolean;
  created_at: string;
  resolved_at: string | null;
}

const TABLE = "recommendations";
const COLUMNS =
  "id, store_id, seller_id, subject_id, type, priority, title, description, action_href, " +
  "resolved, created_at, resolved_at";

/** Mirrors the mock `priorityScore`: higher = surfaced first. */
const PRIORITY_RANK: Record<RecommendationPriority, number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
};

function rowToRecommendation(row: RecommendationRow): IRecommendation {
  return {
    id: row.id,
    storeId: row.store_id,
    sellerId: row.seller_id,
    subjectId: row.subject_id,
    type: row.type,
    priority: row.priority,
    title: row.title,
    description: row.description,
    actionHref: row.action_href ?? undefined,
    resolved: row.resolved,
    createdAt: row.created_at,
    resolvedAt: row.resolved_at ?? undefined,
  };
}

export const supabaseRecommendationsProvider: IRecommendationsProvider = {
  async list(params: IListRecommendationsParams = {}): Promise<IPaginatedResult<IRecommendation>> {
    const buildQuery = () => {
      let query = getSupabaseClient().from(TABLE).select(COLUMNS, { count: "exact" });
      if (params.storeId !== undefined) query = query.eq("store_id", params.storeId);
      if (params.sellerId !== undefined) query = query.eq("seller_id", params.sellerId);
      if (params.subjectId !== undefined) query = query.eq("subject_id", params.subjectId);
      if (typeof params.resolved === "boolean") query = query.eq("resolved", params.resolved);

      if (params.type) {
        const allowed = Array.isArray(params.type) ? params.type : [params.type];
        query = query.in("type", allowed);
      }

      return query;
    };

    const page = Math.max(1, Math.floor(params.page ?? 1));
    const pageSize = Math.max(1, Math.min(50_000, Math.floor(params.pageSize ?? 20)));
    const from = (page - 1) * pageSize;

    const { data, total } = await fetchLargePage<RecommendationRow>(
      async (rangeFrom, rangeTo) => {
        const { data, error, count } = await buildQuery().range(rangeFrom, rangeTo);
        if (error) throw new Error(`[supabase] recommendations.list failed: ${error.message}`);
        return { data: (data ?? []) as unknown as RecommendationRow[], count: count ?? 0 };
      },
      from,
      pageSize,
    );

    // The mock sorts the full set by priority descending before paginating.
    // PostgREST cannot order by a CASE-derived rank, so the concatenated set is
    // sorted in memory ONCE here — sorting must happen after all chunks are
    // gathered (not inside fetchChunk), otherwise each 1000-row chunk would
    // only be internally sorted, not the full requested page.
    const sorted = data
      .slice()
      .sort((a, b) => PRIORITY_RANK[b.priority] - PRIORITY_RANK[a.priority]);

    return {
      data: sorted.map(rowToRecommendation),
      total,
      page,
      pageSize,
    };
  },

  async resolve(id: ID): Promise<IRecommendation> {
    const { data, error } = await getSupabaseClient()
      .from(TABLE)
      .update({ resolved: true, resolved_at: new Date().toISOString() })
      .eq("id", id)
      .select(COLUMNS)
      .single();
    if (error)
      throw new Error(`[supabase] recommendations.resolve(${id}) failed: ${error.message}`);
    return rowToRecommendation(data as unknown as RecommendationRow);
  },
};
