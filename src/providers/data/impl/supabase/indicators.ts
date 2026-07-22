import type {
  ID,
  IIndicatorPeriod,
  IndicatorMetric,
  IndicatorScopeLevel,
  IndicatorStatus,
  IProductIndicator,
  ProductSelector,
} from "@/shared/types";
import type { IIndicatorsProvider, IListIndicatorsParams } from "../../contracts/indicators";
import type { IPaginatedResult } from "../../contracts/_shared";
import { getSupabaseClient } from "@/shared/lib/supabase";
import { fetchLargePage } from "./_pagination";

/**
 * Supabase implementation of {@link IIndicatorsProvider} (PRD-046 / PRD-120+).
 *
 * snake_case `product_indicators` table ↔ camelCase {@link IProductIndicator}
 * via `rowToIndicator`. The discriminated `selector` and the nested `period`
 * are stored as jsonb columns and rehydrated verbatim. `id`/`storeId`/
 * `createdAt` are immutable and never written by `indicatorPatchToRow`.
 *
 * The derived {@link import("@/shared/types").IIndicatorProgress} is computed
 * at runtime and never persisted, so it has no column here.
 *
 * Reads work today under the temporary permissive RLS; the mutations
 * (upsert/update) require the write policies that land with PRD-103.
 */

interface IndicatorRow {
  id: string;
  store_id: string;
  name: string;
  selector: ProductSelector;
  metric: IndicatorMetric;
  scope_level: IndicatorScopeLevel;
  seller_id: string | null;
  period: IIndicatorPeriod;
  target_value: number;
  status: IndicatorStatus;
  division: IProductIndicator["division"] | null;
  reward_description: string | null;
  created_by: string;
  cancel_reason: string | null;
  created_at: string;
  updated_at: string;
}

const TABLE = "product_indicators";
const COLUMNS =
  "id, store_id, name, selector, metric, scope_level, seller_id, period, target_value, status, " +
  "division, reward_description, created_by, cancel_reason, created_at, updated_at";

function rowToIndicator(row: IndicatorRow): IProductIndicator {
  return {
    id: row.id,
    storeId: row.store_id,
    name: row.name,
    selector: row.selector,
    metric: row.metric,
    scopeLevel: row.scope_level,
    sellerId: row.seller_id ?? undefined,
    period: row.period,
    targetValue: row.target_value,
    status: row.status,
    division: row.division ?? undefined,
    rewardDescription: row.reward_description ?? undefined,
    createdBy: row.created_by,
    cancelReason: row.cancel_reason ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Maps a camelCase patch to snake_case columns. `id`/`storeId`/`createdAt` are
 *  immutable and never written; `updatedAt` is set by the caller. */
function indicatorPatchToRow(patch: Partial<IProductIndicator>): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (patch.name !== undefined) row.name = patch.name;
  if (patch.selector !== undefined) row.selector = patch.selector;
  if (patch.metric !== undefined) row.metric = patch.metric;
  if (patch.scopeLevel !== undefined) row.scope_level = patch.scopeLevel;
  if (patch.sellerId !== undefined) row.seller_id = patch.sellerId;
  if (patch.period !== undefined) row.period = patch.period;
  if (patch.targetValue !== undefined) row.target_value = patch.targetValue;
  if (patch.status !== undefined) row.status = patch.status;
  if (patch.division !== undefined) row.division = patch.division;
  if (patch.rewardDescription !== undefined) row.reward_description = patch.rewardDescription;
  if (patch.createdBy !== undefined) row.created_by = patch.createdBy;
  if (patch.cancelReason !== undefined) row.cancel_reason = patch.cancelReason;
  return row;
}

/** Maps a full indicator onto an insert/upsert row, including the immutable `id`. */
function indicatorToRow(indicator: IProductIndicator): Record<string, unknown> {
  return {
    id: indicator.id,
    store_id: indicator.storeId,
    name: indicator.name,
    selector: indicator.selector,
    metric: indicator.metric,
    scope_level: indicator.scopeLevel,
    seller_id: indicator.sellerId ?? null,
    period: indicator.period,
    target_value: indicator.targetValue,
    status: indicator.status,
    division: indicator.division ?? null,
    reward_description: indicator.rewardDescription ?? null,
    created_by: indicator.createdBy,
    cancel_reason: indicator.cancelReason ?? null,
    created_at: indicator.createdAt,
    updated_at: indicator.updatedAt,
  };
}

export const supabaseIndicatorsProvider: IIndicatorsProvider = {
  async list(params: IListIndicatorsParams = {}): Promise<IPaginatedResult<IProductIndicator>> {
    const buildQuery = () => {
      let query = getSupabaseClient().from(TABLE).select(COLUMNS, { count: "exact" });
      if (params.storeId !== undefined) query = query.eq("store_id", params.storeId);
      if (params.scopeLevel !== undefined) query = query.eq("scope_level", params.scopeLevel);
      if (params.sellerId !== undefined) query = query.eq("seller_id", params.sellerId);
      if (params.metric !== undefined) query = query.eq("metric", params.metric);
      if (params.status !== undefined) query = query.eq("status", params.status);
      return query;
    };

    const page = Math.max(1, Math.floor(params.page ?? 1));
    const pageSize = Math.max(1, Math.min(50_000, Math.floor(params.pageSize ?? 20)));
    const from = (page - 1) * pageSize;

    // The mock sorts desc by `period.end`; mirror it on the jsonb path.
    const { data, total } = await fetchLargePage<IndicatorRow>(
      async (rangeFrom, rangeTo) => {
        const { data, error, count } = await buildQuery()
          .order("period->>end", { ascending: false })
          .range(rangeFrom, rangeTo);
        if (error) throw new Error(`[supabase] indicators.list failed: ${error.message}`);
        return { data: (data ?? []) as unknown as IndicatorRow[], count: count ?? 0 };
      },
      from,
      pageSize,
    );

    return {
      data: data.map(rowToIndicator),
      total,
      page,
      pageSize,
    };
  },

  async upsert(indicator: IProductIndicator): Promise<IProductIndicator> {
    const { data, error } = await getSupabaseClient()
      .from(TABLE)
      .upsert({ ...indicatorToRow(indicator), updated_at: new Date().toISOString() })
      .select(COLUMNS)
      .single();
    if (error) throw new Error(`[supabase] indicators.upsert failed: ${error.message}`);
    return rowToIndicator(data as unknown as IndicatorRow);
  },

  async update(id: ID, patch: Partial<IProductIndicator>): Promise<IProductIndicator> {
    const { data, error } = await getSupabaseClient()
      .from(TABLE)
      .update({ ...indicatorPatchToRow(patch), updated_at: new Date().toISOString() })
      .eq("id", id)
      .select(COLUMNS)
      .single();
    if (error) throw new Error(`[supabase] indicators.update(${id}) failed: ${error.message}`);
    return rowToIndicator(data as unknown as IndicatorRow);
  },
};
