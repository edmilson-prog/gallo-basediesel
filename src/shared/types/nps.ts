/**
 * NPS transacional (PRD-148B).
 *
 * The promoter/passive/detractor class is never stored — it is always derived
 * from the score, so a change to the classification thresholds can never leave
 * historical rows disagreeing with the current rule.
 */

export type INpsClass = "detractor" | "passive" | "promoter";

export type INpsTrigger = "conversation_resolved" | "order_delivered" | "manual";

export type INpsSurveyStatus =
  | "pending"
  | "sent"
  | "responded"
  | "expired"
  | "suppressed"
  | "failed";

/**
 * One survey and its answer — the relation is 1:1, so the answer columns live
 * here as nullable rather than in a second table.
 *
 * `customerId` is nullable by design: most resolved conversations belong to a
 * lead from the pool rather than a registered customer. `phoneDigits` is the
 * stable identity that spans both.
 */
export interface INpsSurvey {
  id: string;
  storeId: string;
  conversationId: string | null;
  customerId: string | null;
  leadId: string | null;
  phoneDigits: string;
  recipientName: string | null;
  trigger: INpsTrigger;
  orderId: string | null;
  channel: "whatsapp" | "email" | null;
  status: INpsSurveyStatus;
  score: number | null;
  comment: string | null;
  sentAt: string | null;
  respondedAt: string | null;
  expiresAt: string;
  createdAt: string;
  /** Chips the customer marked. Empty when they answered without picking any. */
  reasons: string[];
  /** Resolved for display only — the survey carries ids, not names. */
  storeName: string | null;
  sellerName: string | null;
}

/**
 * State of a detractor's treatment.
 *
 * `'novo'` is not stored: a detractor whose `recoveryStatus` column is null has
 * never been touched, which is exactly the first column of the board. Deriving
 * it instead of writing it means the whole history joins the queue the moment
 * the feature is switched on, with no backfill.
 */
export type INpsRecoveryStatus = "novo" | "em_contato" | "resolvido";

/** A detractor answer plus its treatment — one card of the recovery board. */
export interface INpsRecovery extends INpsSurvey {
  recoveryStatus: INpsRecoveryStatus;
  recoveryOwnerName: string | null;
  recoveryNote: string | null;
  recoveryContactedAt: string | null;
  recoveryResolvedAt: string | null;
}

/**
 * Result of the score computation. `state: 'collecting'` means the sample is
 * below the honest minimum — `score` is then null and no surface may render a
 * number in its place.
 */
export interface INpsResult {
  state: "ok" | "collecting";
  score: number | null;
  n: number;
  sent: number;
  responseRate: number;
  promoters: number;
  passives: number;
  detractors: number;
}

export interface INpsFilters {
  storeId?: string;
  windowDays: number;
  trigger?: INpsTrigger;
  /** 'customer' = only registered customers; 'contact' = only pool contacts. */
  audience?: "customer" | "contact";
}

export interface INpsMonthlyPoint {
  /** 'YYYY-MM' */
  month: string;
  score: number | null;
  promoters: number;
  passives: number;
  detractors: number;
  n: number;
}

export interface INpsResponsePoint {
  score: number;
  respondedAt: string;
}

/**
 * Raw material for the score, not the score itself.
 *
 * The provider does I/O; `computeNps` does the arithmetic. Keeping the split
 * this way round means the data layer never has to import a feature's engine,
 * and there is exactly one implementation of the "no score without N" rule.
 */
/** Counts for one slice of the population (a store, an attendant). */
export interface INpsBreakdown {
  key: string;
  label: string;
  promoters: number;
  passives: number;
  detractors: number;
}

/** One reason and how many answers cited it. */
export interface INpsReasonCount {
  label: string;
  count: number;
}

/** Reasons split by who cited them — the panel's "what pulls it up / down". */
export interface INpsReasonSplit {
  promoter: INpsReasonCount[];
  detractor: INpsReasonCount[];
}

export interface INpsRawMetrics {
  /** Answers inside the window. */
  responses: INpsResponsePoint[];
  /** Answers inside the preceding window of equal length, for the delta. */
  previousResponses: INpsResponsePoint[];
  /** Surveys that reached the customer in the window — the response-rate denominator. */
  sent: number;
  previousSent: number;
  /** Per-store slice of the current window. */
  byStore: INpsBreakdown[];
  /** Per-attendant slice of the current window. */
  bySeller: INpsBreakdown[];
  /** Chips cited in the window, split by category. */
  reasons: INpsReasonSplit;
}

export interface INpsListFilters extends INpsFilters {
  page?: number;
  pageSize?: number;
  /** Free-text search over the comment. */
  search?: string;
  npsClass?: INpsClass;
  /** Only answers that carry a written comment. */
  hasComment?: boolean;
  /** Only answers that marked this chip. */
  reason?: string;
}

export interface INpsProvider {
  rawMetrics(filters: INpsFilters): Promise<INpsRawMetrics>;
  list(filters: INpsListFilters): Promise<{ data: INpsSurvey[]; total: number }>;
  /**
   * Detractors of the window with their treatment state.
   *
   * Separate from {@link list} on purpose: it reads columns added by
   * `20260813160000_nps_recovery_and_parameters.sql`, so before that migration
   * is applied this call fails while every other panel surface keeps working.
   */
  listRecoveries(filters: INpsFilters, threshold?: 6 | 8): Promise<INpsRecovery[]>;
  /** Moves one detractor between the board's columns. Writes nothing else. */
  setRecovery(
    surveyId: string,
    status: Exclude<INpsRecoveryStatus, "novo"> | null,
    note?: string | null,
  ): Promise<void>;
  /** Most recent answered survey for a customer, or null. Powers the fiche badge. */
  latestForCustomer(customerId: string): Promise<INpsSurvey | null>;
  /** Null when the store has never been configured — the survey is then off. */
  getSettings(storeId: string): Promise<INpsSettings | null>;
  updateSettings(storeId: string, patch: Partial<INpsSettings>): Promise<INpsSettings>;
}

export interface INpsSettings {
  storeId: string;
  enabled: boolean;
  triggerConversationEnabled: boolean;
  triggerConversationDelayHours: number;
  triggerOrderEnabled: boolean;
  triggerOrderDelayHours: number;
  cooldownDays: number;
  tokenExpiryDays: number;
  windowDays: number;
  samplingRate: number;
  sendWindowStartHour: number;
  sendWindowEndHour: number;
  minResponsesForScore: number;
  /** Backstop: conversations resolved longer ago than this are never surveyed. */
  maxBackfillDays: number;
  /** Backstop: ceiling of surveys per store per day. */
  dailyCap: number;
  whatsappAccountId: string | null;
  /**
   * Reading parameters — the panel's "Parâmetros" tab.
   *
   * These change how the same answers are *read*, never which answers exist:
   * moving the target or a band cut re-labels history rather than rewriting it,
   * which is why they live beside the sending rules instead of inside them.
   */
  targetScore: number;
  bandExcellence: number;
  bandQuality: number;
  bandImprovement: number;
  /** 6 = only detractors open a treatment; 8 = passives too. */
  recoveryThreshold: 6 | 8;
  recoverySlaHours: number;
  recoveryOwner: "attendant" | "manager";
  recoveryEscalate: boolean;
  showWidget: boolean;
  showOnFiche: boolean;
  includeInRanking: boolean;
  anonymousForTeam: boolean;
}
