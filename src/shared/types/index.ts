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
export type {
  ID,
  ISO8601,
  Money,
  Division,
  ThemeName,
  ThemeMode,
  IPaginatedResult,
} from "./common";

// Platform & organization
export type {
  IStore,
  ITeam,
  IDepartment,
  IPlatformSettings,
  ILifecycleThresholds,
  IABCCurveSettings,
  IGamificationRules,
  IPipelineStage,
  ILossReason,
  ITagSuggestion,
  ConversationTagsHeaderMode,
  IConversationTagsSettings,
  IWhatsAppAccountRef,
  IManagerDashboardSettings,
  IIdleAlertsSettings,
  IConversationRescueSettings,
  ICommissionSettings,
  IEcommerceIntegrationSettings,
  IEcommerceNotificationTemplates,
  ISessionTimeoutSettings,
  CommissionSplitPolicy,
  EcommerceAssignmentMode,
  StoreType,
  VehicleCadastroMode,
} from "./platform";
export { DEFAULT_SESSION_TIMEOUT } from "./platform";

// Sound center (Configurações → Sons de notificação)
export type {
  SoundTemplateId,
  SoundEventId,
  ISoundEventConfig,
  ISoundSettings,
} from "./sound";
export { DEFAULT_SOUND_SETTINGS } from "./sound";

// System health & observability (PRD-110)
export type {
  SystemHealthStatus,
  SystemCheckResult,
  ISystemHealthcheck,
  ISystemCronJob,
  ISystemDbStats,
  IWhatsAppAccountDelivery,
  IWhatsAppFailureBucket,
  IWhatsAppDeliveryHealth,
  IWhatsAppProviderHealthAccount,
  WebhookDeliveryOutcome,
  IWebhookDelivery,
  IWebhookDeliveryFilters,
} from "./system-health";

// WhatsApp HSM templates (PRD-116)
export type {
  MessageTemplateCategory,
  MessageTemplateMetaStatus,
  MessageTemplateHeaderType,
  IMessageTemplateButton,
  IMessageTemplate,
} from "./message-template";

// People & permissions
export type {
  ISeller,
  IRole,
  IRbacResource,
  IPermission,
  IAuditLog,
  IThemePreference,
  ICommissionRule,
  IWorkScheduleWindow,
  IWorkSchedule,
  IScheduleOverride,
  IAccessGrant,
  SellerType,
  SellerAvailability,
  CommissionTier,
  RoleName,
  PermissionAction,
  PermissionScope,
} from "./people";

// Rotation queue (PRD-213)
export type {
  RotationTargetMode,
  IRotationQueue,
  IRotationParticipant,
  RotationSkipReason,
  IRotationCandidate,
  IRotationSelectionInput,
  IRotationSelectionResult,
  IRotationQueueState,
} from "./rotation";

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
  CustomerWhatsappStatus,
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
  IAdReferral,
  IConversation,
  IConversationContact,
  IConversationMessageMatch,
  IConversationTag,
  IMessage,
  IWhatsAppAccount,
  IWhatsAppCapabilities,
  IWhatsAppProviderConfig,
  ConversationChannel,
  ConversationStatus,
  MessageDirection,
  MessageAuthorType,
  MessageProvider,
  MessageStatus,
  MessageMediaType,
  WhatsAppProviderName,
  WhatsAppAccountStatus,
  WhatsAppAccountHealthState,
  WhatsAppFailoverPolicy,
  WhatsAppAccountPurpose,
  IWhatsAppAccountAccessRule,
  IConversationParticipant,
  IWhatsAppGoServer,
  IWahaServer,
  IWahaSessionConfig,
  IWhatsAppOpenWaServer,
  IConversationActivityEvent,
  AttendanceActivityType,
  IIdleConversationEntry,
  IIdleSummary,
  IConversationRescue,
  AbsenceKind,
  ConversationRescueStatus,
} from "./conversation";

// Conversation notes (internal attendant board)
export type { IConversationNote, IConversationNotesProvider } from "./conversationNote";

// Catalog
export type {
  IPart,
  IApplication,
  IPriceTable,
  IPartSupplier,
  IPartFiscal,
  IPartCrossReference,
  SefazStatus,
} from "./catalog";

// Commercial
export type {
  IQuote,
  IQuoteItem,
  IOrder,
  IOrderItem,
  ICommission,
  ICommissionPreview,
  ICommissionRuleConfig,
  ICommissionGoalBonus,
  ICommissionGoalSnapshot,
  ICommissionSplitDetails,
  QuoteStatus,
  QuoteOrigin,
  QuotePaymentMethod,
  OrderPaymentStatus,
  OrderFulfillmentStatus,
  OrderOrigin,
  OrderStatus,
  OrderPaymentMethod,
  CommissionStatus,
  CommissionGoalBonusType,
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
  ISdrPendingQuote,
  IQuoteResponseMatch,
  QuoteResponseIntent,
} from "./sdr-quote";

// Shipping (PRD-033 + Melhor Envio Fase A)
export type {
  IShippingConfig,
  IShippingRate,
  IShippingResult,
  ShippingStrategy,
  ShippingScope,
  ShippingDefaultAction,
  ShippingResultReason,
  IMelhorEnvioConfig,
  IShippingQuoteOption,
  ShippingQuoteSource,
  IShippingQuoteResult,
  IShippingQuoteSnapshot,
} from "./shipping";

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

// SDR production pilot settings (Parte B — 2026-07-15 design)
export type { ISdrPilotSettings } from "./sdr-pilot";

// Copiloto de Vendas (PRD-025)
export type {
  ICopilotSuggestion,
  ICopilotBriefing,
  ICopilotSummary,
  ICopilotPanelData,
  CopilotSuggestionKind,
  CopilotSuggestionSource,
  CopilotSuggestionSeverity,
  CopilotSuggestionStatus,
  CopilotPlacement,
  CopilotSummarySource,
} from "./copilot";

// BI
export type {
  IGoal,
  IGoalPeriod,
  IBadgeDefinition,
  IGamificationBadge,
  IRanking,
  IRankingEntry,
  IPositivation,
  IABCClassification,
  IRecommendation,
  BadgeCategory,
  BadgeRarity,
  GoalLevel,
  GoalPeriodType,
  GoalMetric,
  GoalStatus,
  ABCClass,
  RecommendationPriority,
  RecommendationType,
} from "./bi";

// Goals (PRD-042 — runtime progress)
export type { IGoalProgress, GoalProgressStatus, GoalProgressTrend } from "./goals";

// Product Indicators
export type {
  IProductIndicator,
  IIndicatorProgress,
  IIndicatorContributor,
  IIndicatorPeriod,
  ProductSelector,
  IndicatorMetric,
  IndicatorScopeLevel,
  IndicatorPeriodType,
  IndicatorStatus,
} from "./indicators";

// DRE (PRD-048)
export type {
  IDREPeriod,
  IDREComparison,
  IDREComparativeBlock,
  IDRETrendPoint,
  IDREAlert,
  IFinancialSettings,
  DREAlertSeverity,
} from "./dre";

// Expenses (PRD-054)
export type {
  IExpense,
  IExpenseRecurrence,
  IExpenseDREAggregate,
  ExpenseCategory,
  ExpensePaymentMethod,
  ExpenseStatus,
  ExpenseRecurrenceFrequency,
} from "./expenses";
export { EXPENSE_CATEGORY_TO_DRE_LINE } from "./expenses";

// Cash flow (PRD-055)
export type {
  ICashFlowEntry,
  ICashFlowDailyPoint,
  ICashFlowSummary,
  ICashFlowSettings,
  CashFlowDirection,
  CashFlowSource,
  CashFlowStatus,
} from "./cashflow";
export { DEFAULT_CASHFLOW_SETTINGS } from "./cashflow";

// Inventory analytics (PRD-050)
export type {
  IInventoryAnalysis,
  IInventoryMetrics,
  IInventoryReorderSuggestion,
  IInventoryAnalysisSettings,
  InventoryCurve,
  InventoryStatus,
} from "./inventory";

// Inventory movement (PRD-052)
export type { IInventoryMovement, MovementType } from "./inventory-movement";

// Customer service analytics (PRD-051)
export type {
  ICustomerServiceMetrics,
  ICustomerServiceKpis,
  IChannelServiceMetrics,
  ISellerServiceMetrics,
  ICustomerServiceMonthlyPoint,
  ICustomerServiceDailyPoint,
  IEscalationBreakdown,
} from "./customer-service-analytics";

// About / release history
export type { ReleaseKind, ReleaseCategory, IReleaseCategoryBlock, IRelease } from "./about";

// Insights / IA Analítica (PRD-053)
export type {
  IInsight,
  IInsightThresholds,
  InsightType,
  InsightPriority,
  InsightCategory,
} from "./insights";
export { DEFAULT_INSIGHT_THRESHOLDS } from "./insights";

// Field visits (PRD-070 — external seller PWA)
export type { IVisit, VisitStatus } from "./visit";

// B2B corporate portal (PRD-071)
export type {
  IPortalUser,
  IPortalRequest,
  IPortalRequestItem,
  IPortalContract,
  PortalUserRole,
  PortalRequestUrgency,
  PortalRequestStatus,
} from "./portal-b2b";

// Storefront (PRD-060)
export type {
  IStorefrontConfig,
  IStorefrontBrand,
  IStorefrontBenefit,
  IStorefrontCategoryConfig,
} from "./storefront";
export {
  DEFAULT_STOREFRONT_CONFIG,
  DEFAULT_STOREFRONT_BRANDS,
  DEFAULT_STOREFRONT_BENEFITS,
} from "./storefront";

// Notifications (PRD-008)
export type {
  INotification,
  INotificationAction,
  INotificationEntityRef,
  IChannelDelivery,
  INotificationPreference,
  NotificationLifecycle,
  NotificationCategory,
  NotificationSeverity,
  NotificationStatus,
  NotificationChannel,
  NotificationRecipientType,
  ChannelDeliveryStatus,
} from "./notification";

// Vehicle models / canonical model catalog (PRD-034)
export type { IVehicleModel, VehicleModelStatus } from "./vehicle-models";

// Model kits / curated part bundles per vehicle model (PRD-035)
export type { IVehicleModelKit, IKitItem, ModelKitCategory, ModelKitStatus } from "./model-kits";

// Forecast / closing projection (PRD-056)
export type {
  IForecast,
  IForecastScenario,
  IForecastBreakdown,
  IForecastScope,
  IForecastConfig,
  IForecastInput,
  ITemperatureWeights,
  IScenarioFactors,
  ForecastMetric,
  ForecastScenarioType,
  PipelineWeightingMode,
} from "./forecast";

// Media (PRD-026 — DAM + Galeria)
export type {
  IMediaClassification,
  IMediaAnnotation,
  IMediaAsset,
  IMediaUploadInput,
  IListMediaParams,
  IMediaStorageProvider,
} from "./media";

// Quick Send & Asset Library (PRD-027)
export type {
  AssetCategory,
  AssetKind,
  AssetStatus,
  AssetSensitivity,
  IAssetVersionSnapshot,
  IAssetLibraryItem,
  IQuickReply,
  ITrackableLink,
  IAssetCombo,
  ScheduledSendStatus,
  ScheduledMediaType,
  IScheduledSend,
  IScheduledSendWithContext,
  IAssetLibraryListParams,
  IAssetLibraryProvider,
  IQuickReplyProvider,
  ITrackableLinkProvider,
  IScheduledSendProvider,
} from "./quickSend";

// Service volume / atendimento metrics (PRD-214)
export type {
  Granularity,
  MetricBucket,
  ServiceMetricParams,
  INovosAtendimentosResult,
  IMessageVolumePoint,
  IMessageVolumeResult,
  MetricAudience,
  IMessagesByUserRow,
  IMessagesByUserResult,
  IStatusDistributionSlice,
  IStatusDistributionResult,
  IAccumulatedChatsResult,
  IHandleTimeStatsResult,
  IHeadlineKpisParams,
  IKpiTrendValue,
  IHeadlineKpisResult,
  ISellerLoadParams,
  ISellerLoadCountRow,
  ISellerLoadCountsResult,
  IHeatmapParams,
  IHeatmapCellRow,
  IHeatmapResult,
} from "./service-volume";

// AI / LLM settings (Configurações → Inteligência artificial)
export type {
  AiProviderId,
  AiFeatureKey,
  AiProviderStatus,
  AiUsageStatus,
  AiUsagePeriod,
  IAiModelOption,
  IAiProviderConfig,
  IAiGenerationParams,
  IAiFeatureRouting,
  IAiBudget,
  IAiSettings,
  IAiUsageEvent,
  IAiUsageSummary,
  IAiPlaygroundInput,
  IAiPlaygroundResult,
  IAiTestConnectionResult,
} from "./ai";
export { AI_FEATURE_LABELS, AI_PROVIDER_LABELS, AI_SUPPORTED_PROVIDERS } from "./ai";
