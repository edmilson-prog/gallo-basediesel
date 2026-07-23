import type {
  CashFlowDirection,
  CashFlowSource,
  CashFlowStatus,
  ICashFlowEntry,
  ID,
} from "@/shared/types";
import type {
  ICashFlowProvider,
  ICreateCashFlowEntryInput,
  IListCashFlowEntriesParams,
} from "../../contracts/cashflow";
import type { IPaginatedResult } from "../../contracts/_shared";
import { getSupabaseClient } from "@/shared/lib/supabase";
import { fetchLargePage } from "./_pagination";

/**
 * Supabase implementation of {@link ICashFlowProvider} (PRD-055 / PRD-104+).
 *
 * Only the MANUAL cash movements (aporte / retirada) are persisted in the
 * snake_case `cash_flow_entries` table; derived movements (from orders,
 * expenses, commissions) and the accumulated-balance projections are computed
 * by the engine at read time and never stored. `rowToCashFlowEntry` maps each
 * row back to the camelCase {@link ICashFlowEntry} the UI consumes.
 *
 * On create the `source` is derived from `type` exactly like the mock layer:
 * an `entrada` is an `aporte`, otherwise a `retirada`. The stored amount is
 * always positive (the `type` carries the sign) and the status is always
 * `realizado` for a manual entry.
 *
 * Reads work today under the temporary permissive RLS; the `create` mutation
 * requires the write policies that land with PRD-103.
 */

interface CashFlowEntryRow {
  id: string;
  type: CashFlowDirection;
  source: CashFlowSource;
  source_id: string | null;
  description: string;
  amount: number;
  date: string;
  status: CashFlowStatus;
  store_id: string;
  created_by: string | null;
  created_at: string;
}

const TABLE = "cash_flow_entries";
const COLUMNS =
  "id, type, source, source_id, description, amount, date, status, store_id, created_by, created_at";

function rowToCashFlowEntry(row: CashFlowEntryRow): ICashFlowEntry {
  return {
    id: row.id,
    type: row.type,
    source: row.source,
    sourceId: row.source_id ?? undefined,
    description: row.description,
    amount: row.amount,
    date: row.date,
    status: row.status,
    storeId: row.store_id,
    createdBy: row.created_by ?? undefined,
    createdAt: row.created_at,
  };
}

export const supabaseCashFlowProvider: ICashFlowProvider = {
  async list(params: IListCashFlowEntriesParams = {}): Promise<IPaginatedResult<ICashFlowEntry>> {
    const page = Math.max(1, Math.floor(params.page ?? 1));
    const pageSize = Math.max(1, Math.min(50_000, Math.floor(params.pageSize ?? 1000)));
    const from = (page - 1) * pageSize;

    const buildQuery = () => {
      let query = getSupabaseClient().from(TABLE).select(COLUMNS, { count: "exact" });

      if (params.storeId !== undefined) query = query.eq("store_id", params.storeId);
      if (params.start !== undefined) query = query.gte("date", params.start);
      if (params.end !== undefined) query = query.lte("date", params.end);
      return query;
    };

    const { data, total } = await fetchLargePage<CashFlowEntryRow>(
      async (rangeFrom, rangeTo) => {
        const { data, error, count } = await buildQuery()
          .order("date", { ascending: false })
          .order("id", { ascending: true })
          .range(rangeFrom, rangeTo);
        if (error) throw new Error(`[supabase] cashflow.list failed: ${error.message}`);
        return { data: (data ?? []) as unknown as CashFlowEntryRow[], count: count ?? 0 };
      },
      from,
      pageSize,
    );

    return {
      data: data.map(rowToCashFlowEntry),
      total,
      page,
      pageSize,
    };
  },

  async create(input: ICreateCashFlowEntryInput): Promise<ICashFlowEntry> {
    // Mirror the mock: manual entries are always realized, the amount is stored
    // positive, and the source is derived from the direction.
    const source: CashFlowSource = input.type === "entrada" ? "aporte" : "retirada";
    const id: ID = crypto.randomUUID();
    const { data, error } = await getSupabaseClient()
      .from(TABLE)
      .insert({
        id,
        type: input.type,
        source,
        source_id: null,
        description: input.description,
        amount: Math.abs(input.amount),
        date: input.date,
        status: "realizado" as CashFlowStatus,
        store_id: input.storeId,
        created_by: input.createdBy,
      })
      .select(COLUMNS)
      .single();
    if (error) throw new Error(`[supabase] cashflow.create failed: ${error.message}`);
    return rowToCashFlowEntry(data as unknown as CashFlowEntryRow);
  },
};
