import type {
  DistributionMatchedCriterion,
  DistributionMode,
  ID,
  IDistributionCandidate,
  IDistributionTrace,
} from "@/shared/types";
import type {
  IDistributionTracesProvider,
  IListDistributionTracesParams,
} from "../../contracts/distributionTraces";
import type { IPaginatedResult } from "../../contracts/_shared";
import { getSupabaseClient } from "@/shared/lib/supabase";
import { fetchLargePage } from "./_pagination";

/**
 * Supabase implementation of {@link IDistributionTracesProvider} (PRD-013).
 *
 * snake_case `distribution_traces` table ↔ camelCase {@link IDistributionTrace}
 * via `rowToTrace`. Each row is an immutable audit record of a single routing
 * decision: the winning seller plus every candidate the engine evaluated.
 * `candidates_evaluated` is stored as jsonb (an ordered list of
 * {@link IDistributionCandidate}) and rehydrated verbatim so the painel
 * administrativo can replay "why" a conversation landed on a given seller.
 *
 * Traces are append-only — there is no update/delete in the contract — so the
 * only mutation is `create`, which inserts the verbatim trace (id included).
 * Reads work today under the temporary permissive RLS; the insert requires the
 * write policies that land with PRD-103.
 */

interface DistributionTraceRow {
  id: string;
  conversation_id: string;
  customer_id: string | null;
  lead_id: string | null;
  store_id: string;
  timestamp: string;
  selected_seller_id: string | null;
  criterion_matched: DistributionMatchedCriterion;
  candidates_evaluated: IDistributionCandidate[];
  mode: DistributionMode;
}

const TABLE = "distribution_traces";
const COLUMNS =
  "id, conversation_id, customer_id, lead_id, store_id, timestamp, selected_seller_id, " +
  "criterion_matched, candidates_evaluated, mode";

function rowToTrace(row: DistributionTraceRow): IDistributionTrace {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    customerId: row.customer_id ?? undefined,
    leadId: row.lead_id ?? undefined,
    storeId: row.store_id,
    timestamp: row.timestamp,
    selectedSellerId: row.selected_seller_id,
    criterionMatched: row.criterion_matched,
    candidatesEvaluated: row.candidates_evaluated,
    mode: row.mode,
  };
}

/** Maps a verbatim trace onto a full insert row, including the immutable `id`. */
function traceToRow(trace: IDistributionTrace): Record<string, unknown> {
  return {
    id: trace.id,
    conversation_id: trace.conversationId,
    customer_id: trace.customerId ?? null,
    lead_id: trace.leadId ?? null,
    store_id: trace.storeId,
    timestamp: trace.timestamp,
    selected_seller_id: trace.selectedSellerId,
    criterion_matched: trace.criterionMatched,
    candidates_evaluated: trace.candidatesEvaluated,
    mode: trace.mode,
  };
}

export const supabaseDistributionTracesProvider: IDistributionTracesProvider = {
  async list(
    params: IListDistributionTracesParams = {},
  ): Promise<IPaginatedResult<IDistributionTrace>> {
    const buildQuery = () => {
      let query = getSupabaseClient().from(TABLE).select(COLUMNS, { count: "exact" });
      if (params.storeId !== undefined) query = query.eq("store_id", params.storeId);
      if (params.selectedSellerId !== undefined)
        query = query.eq("selected_seller_id", params.selectedSellerId);
      if (params.criterionMatched !== undefined)
        query = query.eq("criterion_matched", params.criterionMatched);
      if (params.since !== undefined) query = query.gte("timestamp", params.since);
      if (params.until !== undefined) query = query.lte("timestamp", params.until);
      return query;
    };

    const page = Math.max(1, Math.floor(params.page ?? 1));
    const pageSize = Math.max(1, Math.min(50_000, Math.floor(params.pageSize ?? 20)));
    const from = (page - 1) * pageSize;

    const { data, total } = await fetchLargePage<DistributionTraceRow>(
      async (rangeFrom, rangeTo) => {
        const { data, error, count } = await buildQuery()
          .order("timestamp", { ascending: false })
          .range(rangeFrom, rangeTo);
        if (error) throw new Error(`[supabase] distributionTraces.list failed: ${error.message}`);
        return { data: (data ?? []) as unknown as DistributionTraceRow[], count: count ?? 0 };
      },
      from,
      pageSize,
    );

    return {
      data: data.map(rowToTrace),
      total,
      page,
      pageSize,
    };
  },

  async get(id: ID): Promise<IDistributionTrace> {
    const { data, error } = await getSupabaseClient()
      .from(TABLE)
      .select(COLUMNS)
      .eq("id", id)
      .single();
    if (error) throw new Error(`[supabase] distributionTraces.get(${id}) failed: ${error.message}`);
    return rowToTrace(data as unknown as DistributionTraceRow);
  },

  async create(trace: IDistributionTrace): Promise<IDistributionTrace> {
    const { data, error } = await getSupabaseClient()
      .from(TABLE)
      .insert(traceToRow(trace))
      .select(COLUMNS)
      .single();
    if (error) throw new Error(`[supabase] distributionTraces.create failed: ${error.message}`);
    return rowToTrace(data as unknown as DistributionTraceRow);
  },
};
