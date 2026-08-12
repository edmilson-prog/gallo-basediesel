import type {
  INpsFilters,
  INpsListFilters,
  INpsProvider,
  INpsRawMetrics,
  INpsResponsePoint,
  INpsSurvey,
} from "@/shared/types";
import { getSupabaseClient } from "@/shared/lib/supabase";

/**
 * Supabase implementation of {@link INpsProvider} (PRD-148B, design 2026-08-12).
 *
 * Reads only — every write to `nps_surveys` belongs to the `nps-scheduler` and
 * `nps-submit` edge functions under service_role, and the table has no
 * INSERT/UPDATE policy for `authenticated` at all. RLS decides what a caller
 * sees: staff get the store, a seller gets only their own portfolio.
 *
 * This provider deliberately returns raw answers rather than a score. The
 * arithmetic lives in `src/features/nps/engine`, so the data layer never
 * imports a feature and the "no score without N" rule has one implementation.
 */

interface NpsSurveyRow {
  id: string;
  store_id: string;
  conversation_id: string | null;
  customer_id: string | null;
  lead_id: string | null;
  phone_digits: string;
  recipient_name: string | null;
  trigger: INpsSurvey["trigger"];
  order_id: string | null;
  channel: INpsSurvey["channel"];
  status: INpsSurvey["status"];
  score: number | null;
  comment: string | null;
  sent_at: string | null;
  responded_at: string | null;
  expires_at: string;
  created_at: string;
}

const TABLE = "nps_surveys";
const COLUMNS =
  "id, store_id, conversation_id, customer_id, lead_id, phone_digits, recipient_name, " +
  "trigger, order_id, channel, status, score, comment, sent_at, responded_at, expires_at, created_at";

const DEFAULT_PAGE_SIZE = 30;

function rowToNpsSurvey(row: NpsSurveyRow): INpsSurvey {
  return {
    id: row.id,
    storeId: row.store_id,
    conversationId: row.conversation_id,
    customerId: row.customer_id,
    leadId: row.lead_id,
    phoneDigits: row.phone_digits,
    recipientName: row.recipient_name,
    trigger: row.trigger,
    orderId: row.order_id,
    channel: row.channel,
    status: row.status,
    score: row.score,
    comment: row.comment,
    sentAt: row.sent_at,
    respondedAt: row.responded_at,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
  };
}

function windowBounds(windowDays: number): { start: string; previousStart: string } {
  const now = Date.now();
  const span = windowDays * 86_400_000;
  return {
    start: new Date(now - span).toISOString(),
    previousStart: new Date(now - span * 2).toISOString(),
  };
}

/** 0-6 / 7-8 / 9-10 as a server-side range, so class filtering never pages through misses. */
function classRange(npsClass: NonNullable<INpsListFilters["npsClass"]>): [number, number] {
  if (npsClass === "detractor") return [0, 6];
  if (npsClass === "passive") return [7, 8];
  return [9, 10];
}

/**
 * Applies the shared filters to a query.
 *
 * The builder is narrowed to a loose shape first: the Supabase client is not
 * parametrised with a generated `Database` type here, so re-assigning a
 * fully-inferred builder once per conditional filter makes TypeScript walk an
 * ever-deeper type and eventually give up with TS2589. Fixing the type at the
 * boundary keeps the call sites readable and the checker finite.
 */
interface IFilterableQuery {
  eq(column: string, value: unknown): IFilterableQuery;
  is(column: string, value: unknown): IFilterableQuery;
  not(column: string, operator: string, value: unknown): IFilterableQuery;
}

function applySharedFilters<T>(query: T, filters: INpsFilters): T {
  let out = query as unknown as IFilterableQuery;
  if (filters.storeId) out = out.eq("store_id", filters.storeId);
  if (filters.trigger) out = out.eq("trigger", filters.trigger);
  if (filters.audience === "customer") out = out.not("customer_id", "is", null);
  if (filters.audience === "contact") out = out.is("customer_id", null);
  return out as unknown as T;
}

export const supabaseNpsProvider: INpsProvider = {
  async rawMetrics(filters: INpsFilters): Promise<INpsRawMetrics> {
    const supabase = getSupabaseClient();
    const { start, previousStart } = windowBounds(filters.windowDays);

    const answered = applySharedFilters(
      supabase
        .from(TABLE)
        .select("score, responded_at, customer_id, trigger")
        .eq("status", "responded")
        .not("score", "is", null)
        .gte("responded_at", previousStart),
      filters,
    );

    const { data, error } = await answered;
    if (error) throw error;

    const responses: INpsResponsePoint[] = [];
    const previousResponses: INpsResponsePoint[] = [];
    for (const row of (data ?? []) as unknown as Array<{ score: number; responded_at: string }>) {
      const point = { score: row.score, respondedAt: row.responded_at };
      if (row.responded_at >= start) responses.push(point);
      else previousResponses.push(point);
    }

    // Denominator of the response rate: surveys that actually reached someone.
    // `failed` and `suppressed` never did, so counting them would understate
    // engagement by blaming the customer for a delivery problem.
    const reached = ["sent", "responded", "expired"];
    const countSent = async (from: string, to: string | null): Promise<number> => {
      const base = supabase
        .from(TABLE)
        .select("id", { count: "exact", head: true })
        .in("status", reached)
        .gte("sent_at", from);
      const query = applySharedFilters(to ? base.lt("sent_at", to) : base, filters);
      const { count, error: countError } = await query;
      if (countError) throw countError;
      return count ?? 0;
    };

    const [sent, previousSent] = await Promise.all([
      countSent(start, null),
      countSent(previousStart, start),
    ]);

    return { responses, previousResponses, sent, previousSent };
  },

  async list(filters: INpsListFilters): Promise<{ data: INpsSurvey[]; total: number }> {
    const supabase = getSupabaseClient();
    const { start } = windowBounds(filters.windowDays);
    const page = Math.max(1, filters.page ?? 1);
    const pageSize = Math.max(1, filters.pageSize ?? DEFAULT_PAGE_SIZE);
    const from = (page - 1) * pageSize;

    let query = supabase
      .from(TABLE)
      .select(COLUMNS, { count: "exact" })
      .eq("status", "responded")
      .gte("responded_at", start)
      .order("responded_at", { ascending: false })
      // Explicit range plus the exact count: the caller gets the true total, so
      // a full page is never mistaken for the end of the list.
      .range(from, from + pageSize - 1);

    query = applySharedFilters(query, filters);
    if (filters.npsClass) {
      const [min, max] = classRange(filters.npsClass);
      query = query.gte("score", min).lte("score", max);
    }
    if (filters.search?.trim()) {
      query = query.ilike("comment", `%${filters.search.trim()}%`);
    }

    const { data, error, count } = await query;
    if (error) throw error;

    return {
      data: ((data ?? []) as unknown as NpsSurveyRow[]).map(rowToNpsSurvey),
      total: count ?? 0,
    };
  },
};
