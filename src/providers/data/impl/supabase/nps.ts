import type {
  INpsFilters,
  INpsSettings,
  INpsListFilters,
  INpsProvider,
  INpsRawMetrics,
  INpsBreakdown,
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

const SETTINGS_TABLE = "nps_settings";
const SETTINGS_COLUMNS =
  "store_id, enabled, trigger_conversation_enabled, trigger_conversation_delay_hours, " +
  "trigger_order_enabled, trigger_order_delay_hours, cooldown_days, token_expiry_days, " +
  "window_days, sampling_rate, send_window_start_hour, send_window_end_hour, " +
  "min_responses_for_score, max_backfill_days, daily_cap, whatsapp_account_id";

interface NpsSettingsRow {
  store_id: string;
  enabled: boolean;
  trigger_conversation_enabled: boolean;
  trigger_conversation_delay_hours: number;
  trigger_order_enabled: boolean;
  trigger_order_delay_hours: number;
  cooldown_days: number;
  token_expiry_days: number;
  window_days: number;
  sampling_rate: number;
  send_window_start_hour: number;
  send_window_end_hour: number;
  min_responses_for_score: number;
  max_backfill_days: number;
  daily_cap: number;
  whatsapp_account_id: string | null;
}

function rowToSettings(row: NpsSettingsRow): INpsSettings {
  return {
    storeId: row.store_id,
    enabled: row.enabled,
    triggerConversationEnabled: row.trigger_conversation_enabled,
    triggerConversationDelayHours: row.trigger_conversation_delay_hours,
    triggerOrderEnabled: row.trigger_order_enabled,
    triggerOrderDelayHours: row.trigger_order_delay_hours,
    cooldownDays: row.cooldown_days,
    tokenExpiryDays: row.token_expiry_days,
    windowDays: row.window_days,
    samplingRate: Number(row.sampling_rate),
    sendWindowStartHour: row.send_window_start_hour,
    sendWindowEndHour: row.send_window_end_hour,
    minResponsesForScore: row.min_responses_for_score,
    maxBackfillDays: row.max_backfill_days,
    dailyCap: row.daily_cap,
    whatsappAccountId: row.whatsapp_account_id,
  };
}

/** Only the columns the settings screen may write — storeId stays immutable. */
function settingsPatchToRow(patch: Partial<INpsSettings>): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (patch.enabled !== undefined) row.enabled = patch.enabled;
  if (patch.triggerConversationEnabled !== undefined)
    row.trigger_conversation_enabled = patch.triggerConversationEnabled;
  if (patch.triggerConversationDelayHours !== undefined)
    row.trigger_conversation_delay_hours = patch.triggerConversationDelayHours;
  if (patch.triggerOrderEnabled !== undefined)
    row.trigger_order_enabled = patch.triggerOrderEnabled;
  if (patch.triggerOrderDelayHours !== undefined)
    row.trigger_order_delay_hours = patch.triggerOrderDelayHours;
  if (patch.cooldownDays !== undefined) row.cooldown_days = patch.cooldownDays;
  if (patch.tokenExpiryDays !== undefined) row.token_expiry_days = patch.tokenExpiryDays;
  if (patch.windowDays !== undefined) row.window_days = patch.windowDays;
  if (patch.samplingRate !== undefined) row.sampling_rate = patch.samplingRate;
  if (patch.sendWindowStartHour !== undefined)
    row.send_window_start_hour = patch.sendWindowStartHour;
  if (patch.sendWindowEndHour !== undefined) row.send_window_end_hour = patch.sendWindowEndHour;
  if (patch.minResponsesForScore !== undefined)
    row.min_responses_for_score = patch.minResponsesForScore;
  if (patch.maxBackfillDays !== undefined) row.max_backfill_days = patch.maxBackfillDays;
  if (patch.dailyCap !== undefined) row.daily_cap = patch.dailyCap;
  if (patch.whatsappAccountId !== undefined) row.whatsapp_account_id = patch.whatsappAccountId;
  row.updated_at = new Date().toISOString();
  return row;
}

interface IAnsweredRow {
  score: number;
  responded_at: string;
  store_id: string;
  conversations: { assigned_seller_id: string | null } | null;
}

/**
 * Buckets answered rows by a key and resolves each key's display name in one
 * extra round-trip.
 *
 * Rows whose key is null — a conversation with no attendant, say — are dropped
 * rather than collected into an "unknown" bucket, which would sit on the panel
 * looking like a real person with a real score.
 */
async function groupBy(
  rows: IAnsweredRow[],
  keyOf: (row: IAnsweredRow) => string | null,
  table: string,
  nameColumn: string,
): Promise<INpsBreakdown[]> {
  const buckets = new Map<string, { promoters: number; passives: number; detractors: number }>();

  for (const row of rows) {
    const key = keyOf(row);
    if (!key) continue;
    const bucket = buckets.get(key) ?? { promoters: 0, passives: 0, detractors: 0 };
    if (row.score >= 9) bucket.promoters += 1;
    else if (row.score >= 7) bucket.passives += 1;
    else bucket.detractors += 1;
    buckets.set(key, bucket);
  }

  if (buckets.size === 0) return [];

  const { data } = await getSupabaseClient()
    .from(table)
    .select("id, " + nameColumn)
    .in("id", [...buckets.keys()]);

  const names = new Map(
    ((data ?? []) as unknown as Array<Record<string, string>>).map((row) => [
      row.id,
      row[nameColumn] ?? "\u2014",
    ]),
  );

  return [...buckets.entries()].map(([key, counts]) => ({
    key,
    label: names.get(key) ?? "\u2014",
    ...counts,
  }));
}

export const supabaseNpsProvider: INpsProvider = {
  async rawMetrics(filters: INpsFilters): Promise<INpsRawMetrics> {
    const supabase = getSupabaseClient();
    const { start, previousStart } = windowBounds(filters.windowDays);

    // The attendant comes from the conversation, not from a column on the
    // survey: nps_surveys has no seller of its own, and the FK to conversations
    // lets PostgREST embed it without a migration.
    const answered = applySharedFilters(
      supabase
        .from(TABLE)
        .select(
          "score, responded_at, customer_id, trigger, store_id, conversations(assigned_seller_id)",
        )
        .eq("status", "responded")
        .not("score", "is", null)
        .gte("responded_at", previousStart),
      filters,
    );

    const { data, error } = await answered;
    if (error) throw error;

    const rows = (data ?? []) as unknown as IAnsweredRow[];
    const responses: INpsResponsePoint[] = [];
    const previousResponses: INpsResponsePoint[] = [];
    const current: IAnsweredRow[] = [];

    for (const row of rows) {
      const point = { score: row.score, respondedAt: row.responded_at };
      if (row.responded_at >= start) {
        responses.push(point);
        current.push(row);
      } else {
        previousResponses.push(point);
      }
    }

    const [byStore, bySeller] = await Promise.all([
      groupBy(current, (row) => row.store_id, "stores", "name"),
      groupBy(
        current,
        (row) => row.conversations?.assigned_seller_id ?? null,
        "sellers",
        "full_name",
      ),
    ]);

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

    return { responses, previousResponses, sent, previousSent, byStore, bySeller };
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

  async latestForCustomer(customerId: string): Promise<INpsSurvey | null> {
    const { data, error } = await getSupabaseClient()
      .from(TABLE)
      .select(COLUMNS)
      .eq("customer_id", customerId)
      .eq("status", "responded")
      .order("responded_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;
    return rowToNpsSurvey(data as unknown as NpsSurveyRow);
  },

  async getSettings(storeId: string): Promise<INpsSettings | null> {
    const { data, error } = await getSupabaseClient()
      .from(SETTINGS_TABLE)
      .select(SETTINGS_COLUMNS)
      .eq("store_id", storeId)
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;
    return rowToSettings(data as unknown as NpsSettingsRow);
  },

  async updateSettings(storeId: string, patch: Partial<INpsSettings>): Promise<INpsSettings> {
    // Upsert, not update: a store with no row yet is the normal starting state,
    // and the defaults live in the table definition rather than here.
    const { data, error } = await getSupabaseClient()
      .from(SETTINGS_TABLE)
      .upsert({ store_id: storeId, ...settingsPatchToRow(patch) }, { onConflict: "store_id" })
      .select(SETTINGS_COLUMNS)
      .single();
    if (error) throw error;
    return rowToSettings(data as unknown as NpsSettingsRow);
  },
};
