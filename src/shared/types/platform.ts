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
  /** Manager-dashboard alert configuration (PRD-014). */
  managerDashboard: IManagerDashboardSettings;
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
