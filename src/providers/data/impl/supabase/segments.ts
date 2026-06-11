import type { ICustomerSegment, ID, SegmentScope } from "@/shared/types";
import type {
  ICreateSegmentInput,
  IListSegmentsParams,
  ISegmentsProvider,
  IUpdateSegmentInput,
} from "../../contracts/segments";
import type { IPaginatedResult } from "../../contracts/_shared";
import { getSupabaseClient } from "@/shared/lib/supabase";

/**
 * Supabase implementation of {@link ISegmentsProvider} (PRD-110+).
 *
 * snake_case `customer_segments` table ↔ camelCase {@link ICustomerSegment} via
 * `rowToSegment`. The saved-filter DSL is stored as `jsonb` (`filters`) and
 * trusted via cast back into `Record<string, unknown>`. Segments are owner
 * scoped (no `store_id`); `owner_id` references `public.sellers(id)`.
 *
 * Reads work today under the temporary permissive RLS; the mutations
 * (create/update/delete) require the write policies that land with PRD-103.
 */

interface SegmentRow {
  id: string;
  owner_id: string;
  name: string;
  description: string | null;
  scope: SegmentScope;
  filters: Record<string, unknown>;
  estimated_size: number | null;
  created_at: string;
}

const TABLE = "customer_segments";
const COLUMNS = "id, owner_id, name, description, scope, filters, estimated_size, created_at";

function rowToSegment(row: SegmentRow): ICustomerSegment {
  return {
    id: row.id,
    ownerId: row.owner_id,
    name: row.name,
    description: row.description ?? undefined,
    scope: row.scope,
    filters: row.filters,
    estimatedSize: row.estimated_size ?? undefined,
    createdAt: row.created_at,
  };
}

/** Maps a camelCase patch to snake_case columns. `id`/`ownerId`/`createdAt` are
 *  immutable and never written. */
function segmentPatchToRow(patch: IUpdateSegmentInput): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (patch.name !== undefined) row.name = patch.name;
  if (patch.description !== undefined) row.description = patch.description;
  if (patch.scope !== undefined) row.scope = patch.scope;
  if (patch.filters !== undefined) row.filters = patch.filters;
  return row;
}

export const supabaseSegmentsProvider: ISegmentsProvider = {
  async list(params: IListSegmentsParams = {}): Promise<IPaginatedResult<ICustomerSegment>> {
    let query = getSupabaseClient().from(TABLE).select(COLUMNS, { count: "exact" });

    if (params.scope !== undefined) query = query.eq("scope", params.scope);
    if (params.ownerId !== undefined) query = query.eq("owner_id", params.ownerId);

    const page = Math.max(1, Math.floor(params.page ?? 1));
    const pageSize = Math.max(1, Math.min(1000, Math.floor(params.pageSize ?? 20)));
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    const { data, error, count } = await query
      .order("created_at", { ascending: true })
      .range(from, to);

    if (error) throw new Error(`[supabase] segments.list failed: ${error.message}`);

    return {
      data: (data as unknown as SegmentRow[]).map(rowToSegment),
      total: count ?? 0,
      page,
      pageSize,
    };
  },

  async create(input: ICreateSegmentInput): Promise<ICustomerSegment> {
    const id: ID = crypto.randomUUID();
    const row: Record<string, unknown> = {
      id,
      owner_id: input.ownerId,
      name: input.name,
      description: input.description ?? null,
      scope: input.scope,
      filters: input.filters,
    };
    const { data, error } = await getSupabaseClient()
      .from(TABLE)
      .insert(row)
      .select(COLUMNS)
      .single();
    if (error) throw new Error(`[supabase] segments.create failed: ${error.message}`);
    return rowToSegment(data as unknown as SegmentRow);
  },

  async update(id: ID, patch: IUpdateSegmentInput): Promise<ICustomerSegment> {
    const { data, error } = await getSupabaseClient()
      .from(TABLE)
      .update(segmentPatchToRow(patch))
      .eq("id", id)
      .select(COLUMNS)
      .single();
    if (error) throw new Error(`[supabase] segments.update(${id}) failed: ${error.message}`);
    return rowToSegment(data as unknown as SegmentRow);
  },

  async delete(id: ID): Promise<void> {
    const { error } = await getSupabaseClient().from(TABLE).delete().eq("id", id);
    if (error) throw new Error(`[supabase] segments.delete(${id}) failed: ${error.message}`);
  },
};
