import type {
  INpsFilters,
  INpsSettings,
  INpsListFilters,
  INpsProvider,
  INpsRawMetrics,
  INpsRecovery,
  INpsBreakdown,
  INpsReasonSplit,
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
  reasons: string[] | null;
  stores?: { name: string | null } | null;
  conversations?: { assigned_seller_id: string | null } | null;
}

const TABLE = "nps_surveys";
const COLUMNS =
  "id, store_id, conversation_id, customer_id, lead_id, phone_digits, recipient_name, " +
  "trigger, order_id, channel, status, score, comment, sent_at, responded_at, expires_at, " +
  "created_at, reasons";

/**
 * Store name and attendant, without a migration.
 *
 * The survey stores ids; the panel shows names. `stores(name)` rides the FK
 * that already exists, and the attendant comes from the conversation because
 * nps_surveys has no seller column of its own. Seller names then need one more
 * round-trip — the nested embed would depend on a FK alias that is not
 * guaranteed here.
 */
const COLUMNS_WITH_CONTEXT = COLUMNS + ", stores(name), conversations(assigned_seller_id)";

/**
 * Adds the treatment columns of
 * `20260813160000_nps_recovery_and_parameters.sql`.
 *
 * Kept in its own constant, used by its own provider method: before that
 * migration is applied this select is the one thing that fails, and the rest of
 * the panel — which shares neither the constant nor the call — keeps working.
 */
const RECOVERY_COLUMNS =
  COLUMNS_WITH_CONTEXT +
  ", recovery_status, recovery_owner_id, recovery_note, recovery_contacted_at, recovery_resolved_at";

interface NpsRecoveryRow extends NpsSurveyRow {
  recovery_status: string | null;
  recovery_owner_id: string | null;
  recovery_note: string | null;
  recovery_contacted_at: string | null;
  recovery_resolved_at: string | null;
}

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
    reasons: row.reasons ?? [],
    storeName: row.stores?.name ?? null,
    sellerName: null,
  };
}

/**
 * Fills in `sellerName` for a page of surveys in one extra query.
 *
 * Names are resolved after the fact rather than per row: a page of thirty
 * answers usually comes from a handful of attendants, so one `in()` beats
 * thirty embeds — and a survey whose conversation has no attendant simply keeps
 * a null name instead of inventing one.
 */
async function attachSellerNames(rows: NpsSurveyRow[], surveys: INpsSurvey[]): Promise<void> {
  const ids = [
    ...new Set(
      rows.map((row) => row.conversations?.assigned_seller_id).filter((id): id is string => !!id),
    ),
  ];
  if (ids.length === 0) return;

  const { data } = await getSupabaseClient().from("sellers").select("id, full_name").in("id", ids);
  const names = new Map(
    ((data ?? []) as unknown as Array<{ id: string; full_name: string | null }>).map((row) => [
      row.id,
      row.full_name,
    ]),
  );

  rows.forEach((row, index) => {
    const sellerId = row.conversations?.assigned_seller_id;
    const survey = surveys[index];
    if (sellerId && survey) survey.sellerName = names.get(sellerId) ?? null;
  });
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
  "min_responses_for_score, max_backfill_days, daily_cap, whatsapp_account_id, " +
  "target_score, band_excellence, band_quality, band_improvement, recovery_threshold, " +
  "recovery_sla_hours, recovery_owner, recovery_escalate, show_widget, show_on_fiche, " +
  "include_in_ranking, anonymous_for_team";

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
  target_score: number;
  band_excellence: number;
  band_quality: number;
  band_improvement: number;
  recovery_threshold: number;
  recovery_sla_hours: number;
  recovery_owner: string;
  recovery_escalate: boolean;
  show_widget: boolean;
  show_on_fiche: boolean;
  include_in_ranking: boolean;
  anonymous_for_team: boolean;
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
    targetScore: row.target_score,
    bandExcellence: row.band_excellence,
    bandQuality: row.band_quality,
    bandImprovement: row.band_improvement,
    recoveryThreshold: row.recovery_threshold === 8 ? 8 : 6,
    recoverySlaHours: row.recovery_sla_hours,
    recoveryOwner: row.recovery_owner === "manager" ? "manager" : "attendant",
    recoveryEscalate: row.recovery_escalate,
    showWidget: row.show_widget,
    showOnFiche: row.show_on_fiche,
    includeInRanking: row.include_in_ranking,
    anonymousForTeam: row.anonymous_for_team,
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
  if (patch.targetScore !== undefined) row.target_score = patch.targetScore;
  if (patch.bandExcellence !== undefined) row.band_excellence = patch.bandExcellence;
  if (patch.bandQuality !== undefined) row.band_quality = patch.bandQuality;
  if (patch.bandImprovement !== undefined) row.band_improvement = patch.bandImprovement;
  if (patch.recoveryThreshold !== undefined) row.recovery_threshold = patch.recoveryThreshold;
  if (patch.recoverySlaHours !== undefined) row.recovery_sla_hours = patch.recoverySlaHours;
  if (patch.recoveryOwner !== undefined) row.recovery_owner = patch.recoveryOwner;
  if (patch.recoveryEscalate !== undefined) row.recovery_escalate = patch.recoveryEscalate;
  if (patch.showWidget !== undefined) row.show_widget = patch.showWidget;
  if (patch.showOnFiche !== undefined) row.show_on_fiche = patch.showOnFiche;
  if (patch.includeInRanking !== undefined) row.include_in_ranking = patch.includeInRanking;
  if (patch.anonymousForTeam !== undefined) row.anonymous_for_team = patch.anonymousForTeam;
  row.updated_at = new Date().toISOString();
  return row;
}

interface IAnsweredRow {
  score: number;
  responded_at: string;
  store_id: string;
  reasons: string[] | null;
  conversations: { assigned_seller_id: string | null } | null;
}

/**
 * Tallies the chips cited by promoters and by detractors.
 *
 * Passives are left out on purpose: the panel asks what pulls the score up and
 * what pulls it down, and a passive does neither — including them would blur
 * the two lists that the card exists to contrast.
 */
function splitReasons(rows: IAnsweredRow[]): INpsReasonSplit {
  const up = new Map<string, number>();
  const down = new Map<string, number>();

  for (const row of rows) {
    if (row.score >= 7 && row.score <= 8) continue;
    const target = row.score >= 9 ? up : down;
    for (const reason of row.reasons ?? []) {
      target.set(reason, (target.get(reason) ?? 0) + 1);
    }
  }

  const toSorted = (map: Map<string, number>) =>
    [...map.entries()]
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

  return { promoter: toSorted(up), detractor: toSorted(down) };
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
          "score, responded_at, customer_id, trigger, store_id, reasons, conversations(assigned_seller_id)",
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

    return {
      responses,
      previousResponses,
      sent,
      previousSent,
      byStore,
      bySeller,
      reasons: splitReasons(current),
    };
  },

  async list(filters: INpsListFilters): Promise<{ data: INpsSurvey[]; total: number }> {
    const supabase = getSupabaseClient();
    const { start } = windowBounds(filters.windowDays);
    const page = Math.max(1, filters.page ?? 1);
    const pageSize = Math.max(1, filters.pageSize ?? DEFAULT_PAGE_SIZE);
    const from = (page - 1) * pageSize;

    let query = supabase
      .from(TABLE)
      .select(COLUMNS_WITH_CONTEXT, { count: "exact" })
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
    if (filters.hasComment) {
      // An empty string is also "no comment": the submit endpoint stores null,
      // but a row that predates that rule would otherwise slip through as one.
      query = query.not("comment", "is", null).neq("comment", "");
    }
    if (filters.reason) {
      // Array containment, not equality — an answer usually marks several
      // chips, and the GIN index on `reasons` serves exactly this operator.
      query = query.contains("reasons", [filters.reason]);
    }

    const { data, error, count } = await query;
    if (error) throw error;

    const rows = (data ?? []) as unknown as NpsSurveyRow[];
    const surveys = rows.map(rowToNpsSurvey);
    await attachSellerNames(rows, surveys);

    return { data: surveys, total: count ?? 0 };
  },

  async listRecoveries(filters: INpsFilters): Promise<INpsRecovery[]> {
    const supabase = getSupabaseClient();
    const { start } = windowBounds(filters.windowDays);

    // Ordered oldest first: the board is a queue, and the card that has been
    // waiting longest is the one whose SLA is closest to burning.
    const query = applySharedFilters(
      supabase
        .from(TABLE)
        .select(RECOVERY_COLUMNS)
        .eq("status", "responded")
        .lte("score", 6)
        .gte("responded_at", start)
        .order("responded_at", { ascending: true }),
      filters,
    );

    const { data, error } = await query;
    if (error) throw error;

    const rows = (data ?? []) as unknown as NpsRecoveryRow[];
    const surveys = rows.map(rowToNpsSurvey);
    await attachSellerNames(rows, surveys);

    const ownerIds = [
      ...new Set(rows.map((row) => row.recovery_owner_id).filter((id): id is string => !!id)),
    ];
    const owners = new Map<string, string | null>();
    if (ownerIds.length > 0) {
      const { data: ownerRows } = await supabase
        .from("sellers")
        .select("id, full_name")
        .in("id", ownerIds);
      for (const row of (ownerRows ?? []) as unknown as Array<{
        id: string;
        full_name: string | null;
      }>) {
        owners.set(row.id, row.full_name);
      }
    }

    return rows.flatMap((row, index): INpsRecovery[] => {
      const survey = surveys[index];
      if (!survey) return [];
      return [
        {
          ...survey,
          // Null in the column is the "Novo" column of the board — see the type.
          recoveryStatus: (row.recovery_status ?? "novo") as INpsRecovery["recoveryStatus"],
          recoveryOwnerName: row.recovery_owner_id
            ? (owners.get(row.recovery_owner_id) ?? null)
            : null,
          recoveryNote: row.recovery_note,
          recoveryContactedAt: row.recovery_contacted_at,
          recoveryResolvedAt: row.recovery_resolved_at,
        },
      ];
    });
  },

  async setRecovery(
    surveyId: string,
    status: "em_contato" | "resolvido" | null,
    note?: string | null,
  ): Promise<void> {
    // The RPC is the only write path: nps_surveys has no UPDATE policy for
    // authenticated, and opening one would also hand over the score and the
    // comment — the customer's own words, which nobody being rated may edit.
    const { error } = await getSupabaseClient().rpc("nps_set_recovery", {
      p_survey_id: surveyId,
      p_status: status,
      p_note: note ?? null,
    });
    if (error) throw error;
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
