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
}
