import type { Division, ID, ISO8601 } from "./common";
import type { IDistributionSettings } from "./distribution";

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
  /** Default vehicle registration mode for the store. */
  vehicleCadastroMode: "aprovacao_obrigatoria" | "auto_aprovado";
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
