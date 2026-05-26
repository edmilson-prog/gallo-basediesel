/**
 * GALLO BASE DIESEL — Barrel export of the shared domain model.
 *
 * Always import domain types from this barrel:
 *   import type { ICustomer, IOrder } from "@/shared/types";
 *
 * Never import directly from individual files. The barrel is the public surface.
 *
 * @see ../../../docs/glossario.md
 */

// Utility types
export type { ID, ISO8601, Money, Division, ThemeName, ThemeMode } from "./common";

// Platform & organization
export type {
  IStore,
  ITeam,
  IPlatformSettings,
  ILifecycleThresholds,
  IGamificationRules,
  IPipelineStage,
  ILossReason,
  ITagSuggestion,
  IWhatsAppAccountRef,
  IManagerDashboardSettings,
  StoreType,
  VehicleCadastroMode,
} from "./platform";

// People & permissions
export type {
  ISeller,
  IRole,
  IPermission,
  IAuditLog,
  IThemePreference,
  ICommissionRule,
  SellerType,
  SellerAvailability,
  CommissionTier,
  RoleName,
  PermissionAction,
  PermissionScope,
} from "./people";

// Customer, vehicle, segment, portal
export type {
  ICustomer,
  ICustomerB2B,
  ICustomerB2C,
  ICustomerNote,
  ICustomerAddress,
  ICustomerPurchaseStats,
  IVehicle,
  IVehicleServiceEntry,
  ICustomerSegment,
  IPortalSettings,
  CustomerStatus,
  VehicleCadastroStatus,
  SegmentScope,
} from "./customer";

// Lead, pipeline, wallet transfer
export type {
  ILead,
  ILeadStage,
  ICarteiraTransfer,
  LeadTemperature,
  LeadOrigin,
  CarteiraTransferType,
  CarteiraTransferStatus,
} from "./lead";

// Conversation, messaging, WhatsApp
export type {
  IConversation,
  IMessage,
  IWhatsAppAccount,
  IWhatsAppCapabilities,
  ConversationChannel,
  ConversationStatus,
  MessageDirection,
  MessageAuthorType,
  MessageProvider,
  MessageStatus,
  MessageMediaType,
  WhatsAppProviderName,
  WhatsAppAccountStatus,
} from "./conversation";

// Catalog
export type { IPart, IApplication } from "./catalog";

// Commercial
export type {
  IQuote,
  IQuoteItem,
  IOrder,
  IOrderItem,
  ICommission,
  QuoteStatus,
  QuoteOrigin,
  OrderPaymentStatus,
  OrderFulfillmentStatus,
  OrderOrigin,
  CommissionStatus,
} from "./commercial";

// Distribution / routing (PRD-013)
export type {
  IDistributionSettings,
  IDistributionTrace,
  IDistributionCandidate,
  IDistributionCriteriaEnabled,
  IBusinessHoursWindow,
  DistributionMode,
  DistributionCriterion,
  DistributionMatchedCriterion,
} from "./distribution";

// SDR (PRD-020)
export type {
  ISdrSession,
  ISdrTemplate,
  ISdrCollectedData,
  ISdrIntentMatch,
  ISdrAction,
  ISdrTrace,
  ISdrResponse,
  SdrSessionState,
  SdrFinishReason,
  SdrTemplateTrigger,
  SdrIntent,
} from "./sdr";

// Part identification (PRD-021)
export type {
  IPartIdentification,
  IPartCandidate,
  IPartIdentificationDecision,
  IExtractedAttributes,
  AttributeConfidence,
  PartIdentificationStatus,
  PartIdentificationActionKind,
  PartCategory,
} from "./part-identification";

// SDR Quote (PRD-022)
export type {
  ISdrQuoteTemplates,
  ISdrShippingPlaceholderSettings,
  ISdrShippingResult,
  ISdrPendingQuote,
  IQuoteResponseMatch,
  QuoteResponseIntent,
  SdrOtherStatesAction,
} from "./sdr-quote";

// SDR Escalation (PRD-023)
export type {
  ISdrEscalation,
  ISdrContextSummary,
  ISdrEscalationVehicle,
  ISdrEscalationPart,
  ISdrEscalationQuote,
  ISdrEscalationTraceStep,
  SdrEscalationReason,
  SdrEscalationMode,
  SdrEscalationStatus,
} from "./sdr-escalation";

// BI
export type {
  IGoal,
  IGoalPeriod,
  IGamificationBadge,
  IRanking,
  IRankingEntry,
  IPositivation,
  IABCClassification,
  IRecommendation,
  GoalLevel,
  GoalPeriodType,
  GoalMetric,
  ABCClass,
  RecommendationPriority,
  RecommendationType,
} from "./bi";
