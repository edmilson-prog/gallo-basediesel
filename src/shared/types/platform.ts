import type { Division, ID, ISO8601 } from "./common";
import type { IDistributionSettings } from "./distribution";
import type { ISdrTemplate } from "./sdr";
import type { ISdrQuoteTemplates } from "./sdr-quote";
import type { IShippingConfig } from "./shipping";

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

/** Gamification configuration for ranking and badges. */
export interface IGamificationRules {
  /** Points awarded per closed order. */
  pointsPerOrder: number;
  /** Points awarded per recovered dormant customer. */
  pointsPerRecovery: number;
  /** Points awarded per newly positivated customer in the period. */
  pointsPerPositivation: number;
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
