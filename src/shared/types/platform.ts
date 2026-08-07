import type { Division, ID, ISO8601 } from "./common";
import type { IDistributionSettings } from "./distribution";
import type { ISdrTemplate } from "./sdr";
import type { ISdrQuoteTemplates } from "./sdr-quote";
import type { IShippingConfig } from "./shipping";
import type { ICommissionRuleConfig } from "./commercial";
import type { IFinancialSettings } from "./dre";
import type { ICashFlowSettings } from "./cashflow";
import type { IInventoryAnalysisSettings } from "./inventory";
import type { IInsightThresholds } from "./insights";
import type { IStorefrontConfig } from "./storefront";
import type { IForecastConfig } from "./forecast";
import type { ISoundSettings } from "./sound";
import type { IInboundToastSettings } from "./inbound-toast";

/** Idle-timeout (inactivity session-termination) configuration. */
export interface ISessionTimeoutSettings {
  /** Master switch — when false, no tracking occurs. */
  enabled: boolean;
  /** Minutes of inactivity before termination (the warning window is included in this total). */
  idleMinutes: number;
  /** Countdown-modal seconds before logout. Must be < idleMinutes * 60. */
  warningSeconds: number;
  /** Emits audible beeps during the warning. */
  soundEnabled: boolean;
  /** Beep intensity, 0..1 (oscillator gain). */
  soundVolume: number;
}

/** Default applied when `IPlatformSettings.sessionTimeout` is absent. */
export const DEFAULT_SESSION_TIMEOUT: ISessionTimeoutSettings = {
  enabled: true,
  idleMinutes: 30,
  warningSeconds: 60,
  soundEnabled: true,
  soundVolume: 0.5,
};

/** Store type. Matriz is the headquarters, filial is a branch, parceira is a partner store. */
export type StoreType = "matriz" | "filial" | "parceira";

/** Pipeline stage definition used by lead pipeline (PRD-017). */
export interface IPipelineStage {
  id: ID;
  name: string;
  order: number;
  color: string;
}

/** Reason a lead was lost (configurable per store). */
export interface ILossReason {
  id: ID;
  name: string;
  active: boolean;
}

/**
 * Vehicle registration cadastro mode (PRD-016).
 * - `auto_aprovado`: sellers can register vehicles directly (status approved immediately).
 * - `aprovacao_obrigatoria`: sellers register but vehicle stays `pendente` until a manager approves.
 * - `manual_apenas_gestor`: only managers/owners can register vehicles (sellers have no "+ Vehicle" button).
 */
export type VehicleCadastroMode =
  | "auto_aprovado"
  | "aprovacao_obrigatoria"
  | "manual_apenas_gestor";

/** Tag that can be applied to customers, leads or conversations. */
export interface ITagSuggestion {
  id: ID;
  label: string;
  color: string;
  /** Promoted tags appear in official catalog; free tags live only on the entities they were applied to. */
  promoted: boolean;
}

/** Where the conversation-tag chips render in the conversation header. */
export type ConversationTagsHeaderMode = "readonly" | "quick-add" | "band";

/** Display settings for conversation tags (association always lives in the fiche). */
export interface IConversationTagsSettings {
  headerMode: ConversationTagsHeaderMode;
}

/** Lifecycle threshold configuration (days). */
export interface ILifecycleThresholds {
  /** Days without purchase to move customer from `ativo` to `dormente`. */
  dormantDays: number;
  /** Days without purchase to move customer from `dormente` to `perdido`. */
  lostDays: number;
}

/**
 * ABC curve (Pareto classification) configuration — PRD-045.
 * Owner can tune the rolling window and the class cutoffs from
 * `/app/configuracoes/curva-abc`.
 */
export interface IABCCurveSettings {
  /** Rolling window in months used to aggregate customer revenue. */
  periodMonths: number;
  /** Cumulative revenue share cutoff for class A (0.7 = 70%, 0.9 = 90%). */
  classAThreshold: number;
  /** Cumulative revenue share cutoff for class B. Must be > classAThreshold. */
  classBThreshold: number;
}

/**
 * Gamification configuration for ranking and badges (PRD-043).
 *
 * Owner edits these rules at `/app/configuracoes/gamificacao`. Any change
 * triggers an audit-log entry and a recalculation of the current period.
 *
 * The original three fields (`pointsPerOrder`, `pointsPerRecovery`,
 * `pointsPerPositivation`) are kept for backward compatibility with the
 * scaffold from PRD-004; the engine now reads the richer set of rules below.
 */
export interface IGamificationRules {
  /** Global toggle — disables ranking, widgets and config when false. */
  active: boolean;
  /** Legacy — points per closed paid order (kept for back-compat with seeds). */
  pointsPerOrder: number;
  /** Points awarded per recovered dormant customer (dormente → ativo). */
  pointsPerRecovery: number;
  /** Points awarded per newly positivated customer in the period. */
  pointsPerPositivation: number;
  /** Points awarded when a goal moves to status `concluida`. */
  pointsPerGoalCompleted: number;
  /** Extra points when a goal `currentValue` reaches `1.2 * targetValue` (≥ 120%). */
  pointsPerGoalExceeded: number;
  /** Points awarded per new customer assigned to the seller in the period. */
  pointsPerNewCustomer: number;
  /** Points awarded per paid order whose `total` exceeds `thresholdHighTicket`. */
  pointsPerHighTicketOrder: number;
  /** Order total (R$) above which `pointsPerHighTicketOrder` is granted. */
  thresholdHighTicket: number;
  /** Ticket-médio threshold (R$) for the `big-ticket` badge. */
  thresholdBigTicket: number;
  /** Toggle in-app toast notification when a badge is earned. */
  notifyOnBadgeEarned: boolean;
  /** Catalog of badge definitions available to this store. */
  badges: import("./bi").IBadgeDefinition[];
}

/**
 * Manager dashboard alert configuration (PRD-014).
 * Owners can tune the thresholds that drive the alerts list and the seller-load
 * coloring on the operational dashboard.
 */
export interface IManagerDashboardSettings {
  /** Hours a conversation may sit in `aguardando` before it surfaces an alert. */
  conversationWaitingHoursThreshold: number;
  /** Active conversations above which a seller is flagged as overloaded. */
  sellerOverloadThreshold: number;
  /** Toggle the "Cliente A dormente" alert family. */
  alertClienteADormenteEnabled: boolean;
  /** Toggle the "Vendedor sobrecarregado" alert family. */
  alertVendedorSobrecarregadoEnabled: boolean;
  /** Toggle the "Conversa sem resposta há > Xh" alert family. */
  alertConversaSemRespostaEnabled: boolean;
  /** Polling interval (seconds) used by the alerts list. */
  alertPollingSeconds: number;
}

/**
 * Idle-conversation alert thresholds (spec 2026-07-16). Units are BUSINESS
 * hours of the assigned seller's work schedule (PRD-212); sellers without a
 * schedule accrue raw clock time. Stored at `stores.settings->'idleAlerts'`
 * and read by the server-side reconciler — keep keys in sync with the SQL.
 */
export interface IIdleAlertsSettings {
  enabled: boolean;
  /** Level 1 "Atenção" — business hours until the passive badge counts it. */
  level1Hours: number;
  /** Level 2 "Alerta" — business hours until the aggregated notification. */
  level2Hours: number;
  /** Level 3 "Crítica" — business hours until the fixed banner + manager. */
  level3Hours: number;
  notifyManagerOnLevel3: boolean;
}

/**
 * Offline-rescue thresholds (spec 2026-07-17). Broadcasts a stalled,
 * assigned conversation to every eligible online seller when its assignee
 * is absent; forces a random fallback assignment if nobody claims it in
 * time. Stored at `stores.settings->'conversationRescue'`.
 */
export interface IConversationRescueSettings {
  enabled: boolean;
  /** Minutes the client must have waited (past `awaiting_reply_since`) before a
   * within-schedule-but-away seller counts as "temporarily absent". */
  temporaryAbsenceGraceMinutes: number;
  /** Minutes after the broadcast starts before a forced fallback assignment kicks in. */
  forceAssignTimeoutMinutes: number;
  /** Reserve sellers considered first for the forced fallback assignment. */
  fallbackSellerIds: ID[];
}

/**
 * Echo continuity window (decision 2026-07-23 —
 * docs/dev/conversation-split-echo-after-close.md §7 item 3). A phone-sent
 * echo may APPEND to the contact's most recent `resolvida` conversation on
 * the same WhatsApp account when it was closed less than `windowHours` ago —
 * WITHOUT reopening it (the customer's next inbound reopens that same
 * thread). 0 disables the window (echo always opens a fresh conversation).
 * `arquivada` never participates (a deliberate discard). Stored at
 * `stores.settings->'echoContinuity'` and read by the waha-webhook echo path.
 */
export interface IEchoContinuitySettings {
  windowHours: number;
}

/** Reference (not the credential itself) to a WhatsApp account. */
export interface IWhatsAppAccountRef {
  id: ID;
  label: string;
}

/**
 * How e-commerce orders are routed to sellers (PRD-067 RF-004).
 * - `round_robin`: spread fairly across active sellers (smallest open e-com load first).
 * - `manager_distributes`: leave the conversation unassigned for a Gestor to distribute.
 * - `specific_seller`: all e-com orders go to `specificSellerId`.
 */
export type EcommerceAssignmentMode = "round_robin" | "manager_distributes" | "specific_seller";

/**
 * Editable notification templates for the e-commerce → central integration
 * (PRD-067 RF-011/012). Variables: {customerName}, {orderNumber}, {total},
 * {paymentMethod}, {reason}. Rendered as placeholders on the MVP — no real
 * WhatsApp/email is dispatched (Fase 2).
 */
export interface IEcommerceNotificationTemplates {
  whatsappConfirmation: string;
  emailConfirmation: string;
  statusPaid: string;
  statusShipped: string;
  statusDelivered: string;
  statusCanceled: string;
}

/** E-commerce ↔ Central integration settings (PRD-067). */
export interface IEcommerceIntegrationSettings {
  assignmentMode: EcommerceAssignmentMode;
  /** Seller that receives every e-com order when `assignmentMode === 'specific_seller'`. */
  specificSellerId?: ID;
  /** Whether a linked IConversation is auto-created for each e-com order (RF-006). */
  createConversationAuto: boolean;
  /** Whether placeholder customer notifications are rendered + audited (RF-011). */
  notifyCustomer: boolean;
  templates: IEcommerceNotificationTemplates;
}

/**
 * Aggregated administrative settings of a store.
 * Each field has its own management screen (PRD-019).
 */
export interface IPlatformSettings {
  storeId: ID;
  lifecycleThresholds: ILifecycleThresholds;
  /** Default vehicle registration mode for the store (PRD-016). */
  vehicleCadastroMode: VehicleCadastroMode;
  tagSuggestions: ITagSuggestion[];
  pipelineStages: IPipelineStage[];
  lossReasons: ILossReason[];
  gamificationRules: IGamificationRules;
  whatsappAccounts: IWhatsAppAccountRef[];
  defaultDivision: Division;
  /** Conversation distribution / routing rules (PRD-013). */
  distribution: IDistributionSettings;
  /**
   * Access model (Portão A) — may a co-responsible (conversation participant)
   * see a conversation on an instance they don't otherwise access? `false`
   * (default): the explicit invite still respects the origin number — the
   * instance is the master gate. `true`: the invite lets the guest transit
   * across instances. Governs only the participant branch of
   * `can_access_conversation`; never widens pool/assignment visibility.
   */
  participantCrossInstance?: boolean;
  /** Política de encerramento de sessão por inatividade. Ausente ⇒ DEFAULT_SESSION_TIMEOUT. */
  sessionTimeout?: ISessionTimeoutSettings;
  /** Manager-dashboard alert configuration (PRD-014). */
  managerDashboard: IManagerDashboardSettings;
  /** Idle-conversation alerts (spec 2026-07-16). Undefined → DEFAULT_IDLE_ALERTS_SETTINGS. */
  idleAlerts?: IIdleAlertsSettings;
  /** Offline-rescue broadcast (spec 2026-07-17). Undefined → DEFAULT_CONVERSATION_RESCUE_SETTINGS. */
  conversationRescue?: IConversationRescueSettings;
  /** Echo continuity window (2026-07-23). Undefined → 24h (DEFAULT_ECHO_CONTINUITY_WINDOW_HOURS). */
  echoContinuity?: IEchoContinuitySettings;
  /** Notification sound center (per-store). Absent on legacy stores → DEFAULT_SOUND_SETTINGS. */
  sound?: ISoundSettings;
  /** On-screen alert for inbound messages (per-store). Absent → DEFAULT_INBOUND_TOAST_SETTINGS. */
  inboundToast?: IInboundToastSettings;
  /** Whether the SDR agent is enabled for this store (PRD-020). */
  sdrEnabled: boolean;
  /** Editable SDR message templates with variable substitution (PRD-020). */
  sdrTemplates: ISdrTemplate[];
  /** Quote validity window in days for SDR-generated quotes (PRD-022). */
  sdrQuoteValidityDays: number;
  /**
   * Automatic discount the SDR is authorised to apply, expressed as a
   * decimal (0.05 = 5%). 0 (default) means the SDR never discounts on its
   * own (PRD-022 RF-002).
   */
  sdrAutoDiscountPct: number;
  /** Editable SDR-quote message templates (4 slots — PRD-022 RF-003). */
  sdrQuoteTemplates: ISdrQuoteTemplates;
  /**
   * Centralised shipping configuration (PRD-033). Consumed by SDR quote
   * generation, manual quotes and any other surface that needs to compute
   * shipping. Edited via `/app/configuracoes/frete`.
   */
  shipping: IShippingConfig;
  /**
   * SDR → human escalation tuning (PRD-023). Controls queue timeouts per mode,
   * the customer-facing handoff template and the broadcast delay for urgent
   * escalations.
   */
  escalationQueueTimeoutMinutesUrgent: number;
  escalationQueueTimeoutMinutesNormal: number;
  escalationCustomerHandoffTemplate: string;
  escalationUrgentBroadcastDelaySeconds: number;
  /**
   * Discount approval threshold for manual quotes (PRD-031 RF-028). Quotes whose
   * `discount / subtotal` exceeds this fraction require Gestor/Owner approval
   * before they can be sent. Expressed as decimal (0.05 = 5%).
   */
  discountApprovalThresholdPct: number;
  /** Default validity window (days) for manually-created quotes. PRD-031 RF-016. */
  quoteDefaultValidityDays: number;
  /** Customer ABC curve classification settings (PRD-045). */
  abcCurveSettings: IABCCurveSettings;
  /** Forecast engine tuning (PRD-056). Undefined → DEFAULT_FORECAST_CONFIG. */
  forecast?: IForecastConfig;
  /** Commission engine settings (PRD-047). */
  commissionSettings: ICommissionSettings;
  /** Financial / DRE settings (PRD-048). */
  financialSettings: IFinancialSettings;
  /**
   * Cash flow settings (PRD-055) — opening balance + low-balance alert. Optional
   * for back-compat; the engine falls back to {@link DEFAULT_CASHFLOW_SETTINGS}.
   */
  cashflowSettings?: ICashFlowSettings;
  /** Inventory analytics settings (PRD-050). */
  inventoryAnalysisSettings: IInventoryAnalysisSettings;
  /** IA analítica / Insights global toggle (PRD-053). */
  insightsEnabled: boolean;
  /** Toggles the analytics copilot panel (PRD-057). Undefined → enabled. */
  analyticsCopilotEnabled?: boolean;
  /** Configurable thresholds for the insight detection heuristics (PRD-053). */
  insightThresholds: IInsightThresholds;
  /** Public storefront (/loja) configuration — hero, brands, footer, SEO (PRD-060). */
  storefront: IStorefrontConfig;
  /** E-commerce ↔ Central integration settings (PRD-067). */
  ecommerceIntegration: IEcommerceIntegrationSettings;
  /** Conversation tags display settings. Undefined → { headerMode: "readonly" }. */
  conversationTags?: IConversationTagsSettings;
}

/**
 * Policy that decides who receives the commission when a temporary carteira
 * transfer is active at the moment the order is paid (PRD-018 + PRD-047):
 *  - `coverage_full`: coverage seller takes 100%.
 *  - `split_50_50`: split 50/50 between titular and coverage.
 */
export type CommissionSplitPolicy = "coverage_full" | "split_50_50";

/**
 * Commission engine configuration (PRD-047).
 *
 * Owner edits this at `/app/configuracoes/comissoes`. Any change triggers an
 * audit-log entry. Rules are evaluated by the engine: seller-specific rules
 * take precedence over the store-wide default rate.
 */
export interface ICommissionSettings {
  /** Whether the commission engine is active (calculations + UI). */
  active: boolean;
  /** Decimal default rate (0.03 = 3%) applied when no seller-specific rule exists. */
  defaultRate: number;
  /** Split policy applied when a temporary carteira transfer is active. */
  splitPolicy: CommissionSplitPolicy;
  /** Whether goal-based bonuses are applied during calculation. */
  goalBonusEnabled: boolean;
  /** Configured rules (store-wide default + per-seller overrides). */
  rules: ICommissionRuleConfig[];
  /** Periods (`YYYY-MM`) that are closed and immutable. */
  closedPeriods: string[];
}

/**
 * Store / unit of the GALLO BASE DIESEL platform.
 * Multi-store is modelled from day one; on the MVP only the headquarters exists.
 */
export interface IStore {
  id: ID;
  name: string;
  type: StoreType;
  address: string;
  cnpj: string;
  /**
   * Gestor seller for the store — recipient of manager-targeted derived
   * notifications (PRD-008 reconciler). Optional: stays dormant until the
   * owner↔seller link is established (PRD-107).
   */
  managerId?: ID;
  settings: IPlatformSettings;
  /** Divisions active for this store. On the MVP always `['parts']`. */
  activeDivisions: Division[];
  /**
   * Soft-delete flag (Fase 2 — gestão multi-loja). Inactive stores are hidden
   * from operational listings but preserved for history/FK integrity.
   */
  isActive: boolean;
  createdAt: ISO8601;
}

/**
 * Sales team grouping. Dormant on the MVP — `IGoal.level` never uses `'team'`
 * until teams are activated post-MVP.
 */
export interface ITeam {
  id: ID;
  name: string;
  storeId: ID;
  managerId: ID;
  sellerIds: ID[];
  createdAt: ISO8601;
}

/**
 * Department (PRD-211). Alias of ITeam — the dormant team entity is revived and
 * repositioned as "Departamento". Use IDepartment in new code for intent.
 */
export type IDepartment = ITeam;
