import type { Division, ID, IGoal, IGoalPeriod } from "@/shared/types";
import type { GoalLevel, GoalMetric, GoalStatus } from "@/shared/types";
import type { IGoalsProvider, IListGoalsParams } from "../../contracts/goals";
import type { IPaginatedResult } from "../../contracts/_shared";
import { getSupabaseClient } from "@/shared/lib/supabase";
import { fetchLargePage } from "./_pagination";

/**
 * Supabase implementation of {@link IGoalsProvider} (PRD-042 / PRD-120+).
 *
 * snake_case `goals` table ↔ camelCase {@link IGoal} via `rowToGoal`. The
 * time-bounded `period` is a small nested object stored as a `jsonb` column and
 * rehydrated verbatim. Live progress (`IGoalProgress`) is never persisted — it
 * is derived in runtime by `calculateGoalProgress`; only the snapshot scalars
 * (`currentValue`, `progressPercent`) are stored here.
 *
 * `target_id` is polymorphic (store / team / seller depending on `level`), so it
 * carries NO foreign key. `seller_id` and `created_by` reference `sellers`.
 *
 * Reads work today under the temporary permissive RLS; the mutations
 * (upsert/update) require the write policies that land with PRD-103.
 */

interface GoalRow {
  id: string;
  store_id: string;
  level: GoalLevel;
  target_id: string;
  seller_id: string | null;
  period: IGoalPeriod;
  metric: GoalMetric;
  target_value: number;
  current_value: number;
  progress_percent: number;
  division: Division | null;
  name: string | null;
  status: GoalStatus | null;
  reward_description: string | null;
  created_by: string | null;
  cancel_reason: string | null;
  created_at: string;
  updated_at: string;
}

const TABLE = "goals";
const COLUMNS =
  "id, store_id, level, target_id, seller_id, period, metric, target_value, current_value, " +
  "progress_percent, division, name, status, reward_description, created_by, cancel_reason, " +
  "created_at, updated_at";

function rowToGoal(row: GoalRow): IGoal {
  return {
    id: row.id,
    storeId: row.store_id,
    level: row.level,
    targetId: row.target_id,
    sellerId: row.seller_id ?? undefined,
    period: row.period,
    metric: row.metric,
    targetValue: row.target_value,
    currentValue: row.current_value,
    progressPercent: row.progress_percent,
    division: row.division ?? undefined,
    name: row.name ?? undefined,
    status: row.status ?? undefined,
    rewardDescription: row.reward_description ?? undefined,
    createdBy: row.created_by ?? undefined,
    cancelReason: row.cancel_reason ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Maps a full {@link IGoal} onto an insert row (used by `upsert`). */
function goalToRow(goal: IGoal): Record<string, unknown> {
  return {
    id: goal.id,
    store_id: goal.storeId,
    level: goal.level,
    target_id: goal.targetId,
    seller_id: goal.sellerId ?? null,
    period: goal.period,
    metric: goal.metric,
    target_value: goal.targetValue,
    current_value: goal.currentValue,
    progress_percent: goal.progressPercent,
    division: goal.division ?? null,
    name: goal.name ?? null,
    status: goal.status ?? null,
    reward_description: goal.rewardDescription ?? null,
    created_by: goal.createdBy ?? null,
    cancel_reason: goal.cancelReason ?? null,
    created_at: goal.createdAt,
    updated_at: goal.updatedAt,
  };
}

/** Maps a camelCase patch to snake_case columns. `id`/`storeId`/`createdAt` are
 *  immutable and never written. */
function goalPatchToRow(patch: Partial<IGoal>): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (patch.level !== undefined) row.level = patch.level;
  if (patch.targetId !== undefined) row.target_id = patch.targetId;
  if (patch.sellerId !== undefined) row.seller_id = patch.sellerId;
  if (patch.period !== undefined) row.period = patch.period;
  if (patch.metric !== undefined) row.metric = patch.metric;
  if (patch.targetValue !== undefined) row.target_value = patch.targetValue;
  if (patch.currentValue !== undefined) row.current_value = patch.currentValue;
  if (patch.progressPercent !== undefined) row.progress_percent = patch.progressPercent;
  if (patch.division !== undefined) row.division = patch.division;
  if (patch.name !== undefined) row.name = patch.name;
  if (patch.status !== undefined) row.status = patch.status;
  if (patch.rewardDescription !== undefined) row.reward_description = patch.rewardDescription;
  if (patch.createdBy !== undefined) row.created_by = patch.createdBy;
  if (patch.cancelReason !== undefined) row.cancel_reason = patch.cancelReason;
  return row;
}

export const supabaseGoalsProvider: IGoalsProvider = {
  async list(params: IListGoalsParams = {}): Promise<IPaginatedResult<IGoal>> {
    const buildQuery = () => {
      let query = getSupabaseClient().from(TABLE).select(COLUMNS, { count: "exact" });
      if (params.storeId !== undefined) query = query.eq("store_id", params.storeId);
      if (params.level !== undefined) query = query.eq("level", params.level);
      if (params.targetId !== undefined) query = query.eq("target_id", params.targetId);
      if (params.metric !== undefined) query = query.eq("metric", params.metric);
      return query;
    };

    const page = Math.max(1, Math.floor(params.page ?? 1));
    const pageSize = Math.max(1, Math.min(50_000, Math.floor(params.pageSize ?? 20)));
    const from = (page - 1) * pageSize;

    // Mirror the mock's sort: most recent period.end first. `period` is jsonb,
    // so order on the extracted `end` text key.
    const { data, total } = await fetchLargePage<GoalRow>(
      async (rangeFrom, rangeTo) => {
        const { data, error, count } = await buildQuery()
          .order("period->>end", { ascending: false })
          .order("id", { ascending: true })
          .range(rangeFrom, rangeTo);
        if (error) throw new Error(`[supabase] goals.list failed: ${error.message}`);
        return { data: (data ?? []) as unknown as GoalRow[], count: count ?? 0 };
      },
      from,
      pageSize,
    );

    return {
      data: data.map(rowToGoal),
      total,
      page,
      pageSize,
    };
  },

  async upsert(goal: IGoal): Promise<IGoal> {
    // The mock stamps `updatedAt` server-side on every upsert; replicate it so
    // the caller's value never wins over the persistence timestamp.
    const row = { ...goalToRow(goal), updated_at: new Date().toISOString() };
    const { data, error } = await getSupabaseClient()
      .from(TABLE)
      .upsert(row, { onConflict: "id" })
      .select(COLUMNS)
      .single();
    if (error) throw new Error(`[supabase] goals.upsert(${goal.id}) failed: ${error.message}`);
    return rowToGoal(data as unknown as GoalRow);
  },

  async update(id: ID, patch: Partial<IGoal>): Promise<IGoal> {
    const { data, error } = await getSupabaseClient()
      .from(TABLE)
      .update({ ...goalPatchToRow(patch), updated_at: new Date().toISOString() })
      .eq("id", id)
      .select(COLUMNS)
      .single();
    if (error) throw new Error(`[supabase] goals.update(${id}) failed: ${error.message}`);
    return rowToGoal(data as unknown as GoalRow);
  },
};
