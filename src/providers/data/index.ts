/**
 * GALLO BASE DIESEL — Public surface of the data provider layer (PRD-005).
 *
 * Features MUST consume data exclusively through this barrel. Importing
 * factory, implementations, or individual contracts directly is forbidden by
 * the ESLint `no-restricted-imports` rule.
 *
 *   import { useCustomersProvider } from "@/providers/data";
 *
 * @see ../../../docs/provider-pattern.md
 */

export { DataProvidersProvider } from "./context";
export { getActiveDataSource, type DataSource } from "./factory";
export { NotImplementedError } from "./errors";
export { recordAuditLog, recordAuditLogSync, type ICreateAuditInput } from "./auditLogger";

export type {
  IDataProviders,
  IPaginatedResult,
  IPaginationParams,
  ICustomersProvider,
  IListCustomersParams,
  IWalletStats,
  IWalletStatsParams,
  IWalletSellerStats,
  IConvertPendingContactInput,
  ICustomerDocumentMatch,
  IContactsProvider,
  IListContactsParams,
  ContactsOrderBy,
  ContactRecencyBucket,
  IVehiclesProvider,
  IListVehiclesParams,
  IAddServiceEntryInput,
  VehiclesOrderBy,
  VehiclesOrderDir,
  ILeadsProvider,
  IListLeadsParams,
  IConversationsProvider,
  IListConversationsParams,
  ICreateConversationInput,
  ICreateConversationResult,
  IMessagesProvider,
  IListMessagesParams,
  IListMessagesForAnalyticsParams,
  IPartsProvider,
  IListPartsParams,
  IPartCategoriesProvider,
  IListPartCategoriesParams,
  ISavePartCategoryInput,
  IQuotesProvider,
  IListQuotesParams,
  IOrdersProvider,
  IListOrdersParams,
  ICommissionsProvider,
  IListCommissionsParams,
  IExpensesProvider,
  IListExpensesParams,
  ICreateExpenseInput,
  IMarkExpensePaidInput,
  ICancelExpenseInput,
  IUpdateExpenseSeriesInput,
  ICancelExpenseSeriesInput,
  ExpenseSeriesScope,
  ICashFlowProvider,
  IListCashFlowEntriesParams,
  ICreateCashFlowEntryInput,
  IGoalsProvider,
  IListGoalsParams,
  IRecommendationsProvider,
  IListRecommendationsParams,
  ITransfersProvider,
  IListTransfersParams,
  ICreateTransferInput,
  ISegmentsProvider,
  IListSegmentsParams,
  ISellersProvider,
  IListSellersParams,
  ICreateSellerInput,
  IStoresProvider,
  ISettingsProvider,
  IAuditsProvider,
  IListAuditsParams,
  IWhatsAppAccountsProvider,
  IListWhatsAppAccountsParams,
  IWhatsAppAccountMetrics,
  IDistributionTracesProvider,
  IListDistributionTracesParams,
  IActivityProvider,
  IManagerDashboardProvider,
  IManagerDashboardSnapshotParams,
  IManagerDashboardSnapshot,
  ISdrSessionsProvider,
  IListSdrSessionsParams,
  ISdrEscalationsProvider,
  IListSdrEscalationsParams,
  IIndicatorsProvider,
  IListIndicatorsParams,
  IVehicleModelsProvider,
  IListVehicleModelsParams,
  ICreateVehicleModelInput,
  IUpdateVehicleModelPatch,
  IModelKitsProvider,
  IListModelKitsParams,
  ICreateModelKitInput,
  IUpdateModelKitPatch,
  ISuppliersProvider,
  IListSuppliersParams,
  IFiscalNotesProvider,
  IListFiscalNotesParams,
  ICreateFiscalNoteInput,
  IUpdateFiscalNoteItemPatch,
  IPostContext,
  IMediaStorageProvider,
  IMediaUploadInput,
  IListMediaParams,
  IAssetLibraryProvider,
  IAssetLibraryListParams,
  IQuickReplyProvider,
  ITrackableLinkProvider,
  IScheduledSendProvider,
  IConversationNotesProvider,
  IConversationPinsProvider,
  IConversationPin,
  IStorefrontProvider,
  ISystemHealthProvider,
  IWebhookDeliveriesProvider,
  IMessageTemplatesProvider,
  IListMessageTemplatesParams,
  ICreateMessageTemplateInput,
  IUpdateMessageTemplateInput,
  IRolesProvider,
  ICreateRoleInput,
  IDepartmentsProvider,
  ICreateDepartmentInput,
  IRotationQueuesProvider,
  IRotationParticipantsProvider,
  IAddRotationParticipantInput,
  IAiProvider,
  IAtendimentoMetricsProvider,
  IWhatsAppGoServersProvider,
  ICreateGoServerInput,
  IGoServerPatch,
  IWhatsAppOpenWaServersProvider,
  ICreateOpenWaServerInput,
  IOpenWaServerPatch,
  IConversationTagsProvider,
  IListConversationTagsParams,
  ICreateConversationTagInput,
  IUpdateConversationTagInput,
  IConversationParticipantsProvider,
  ISdrPilotSettingsProvider,
  IConversationRescuesProvider,
  IPixKeyProvider,
  INpsProvider,
} from "./contracts";
export { computeFailureRate, FETCH_ALL_PAGE_SIZE, WALLET_STALE_DAYS } from "./contracts";

export { useCustomersProvider } from "./hooks/useCustomersProvider";
export { useContactsProvider } from "./hooks/useContactsProvider";
export { useVehiclesProvider } from "./hooks/useVehiclesProvider";
export { useLeadsProvider } from "./hooks/useLeadsProvider";
export { useLeadFunnelsProvider } from "./hooks/useLeadFunnelsProvider";
export { useConversationsProvider } from "./hooks/useConversationsProvider";
export { useMessagesProvider } from "./hooks/useMessagesProvider";
export { usePartsProvider } from "./hooks/usePartsProvider";
export { usePartCategoriesProvider } from "./hooks/usePartCategoriesProvider";
export { useQuotesProvider } from "./hooks/useQuotesProvider";
export { useOrdersProvider } from "./hooks/useOrdersProvider";
export { useCommissionsProvider } from "./hooks/useCommissionsProvider";
export { useExpensesProvider } from "./hooks/useExpensesProvider";
export { useCashFlowProvider } from "./hooks/useCashFlowProvider";
export { useGoalsProvider } from "./hooks/useGoalsProvider";
export { useRecommendationsProvider } from "./hooks/useRecommendationsProvider";
export { useTransfersProvider } from "./hooks/useTransfersProvider";
export { useSegmentsProvider } from "./hooks/useSegmentsProvider";
export { useSellersProvider } from "./hooks/useSellersProvider";
export { useStoresProvider } from "./hooks/useStoresProvider";
export { useSettingsProvider } from "./hooks/useSettingsProvider";
export { useAuditsProvider } from "./hooks/useAuditsProvider";
export { useWhatsAppAccountsProvider } from "./hooks/useWhatsAppAccountsProvider";
export { useDistributionTracesProvider } from "./hooks/useDistributionTracesProvider";
export { useActivityProvider } from "./hooks/useActivityProvider";
export { useManagerDashboardProvider } from "./hooks/useManagerDashboardProvider";
export { useSdrSessionsProvider } from "./hooks/useSdrSessionsProvider";
export { useSdrEscalationsProvider } from "./hooks/useSdrEscalationsProvider";
export { useCopilotProvider } from "./hooks/useCopilotProvider";
export { useIndicatorsProvider } from "./hooks/useIndicatorsProvider";
export { useVehicleModelsProvider } from "./hooks/useVehicleModelsProvider";
export { useModelKitsProvider } from "./hooks/useModelKitsProvider";
export { useSuppliersProvider } from "./hooks/useSuppliersProvider";
export { useFiscalNotesProvider } from "./hooks/useFiscalNotesProvider";
export { useMediaStorageProvider } from "./hooks/useMediaStorageProvider";
export { useAssetLibraryProvider } from "./hooks/useAssetLibraryProvider";
export { useQuickReplyProvider } from "./hooks/useQuickReplyProvider";
export { useTrackableLinkProvider } from "./hooks/useTrackableLinkProvider";
export { useScheduledSendProvider } from "./hooks/useScheduledSendProvider";
export { useConversationNotesProvider } from "./hooks/useConversationNotesProvider";
export { useConversationPinsProvider } from "./hooks/useConversationPinsProvider";
export { useStorefrontProvider } from "./hooks/useStorefrontProvider";
export { useSystemHealthProvider } from "./hooks/useSystemHealthProvider";
export { useWebhookDeliveriesProvider } from "./hooks/useWebhookDeliveriesProvider";
export { useMessageTemplatesProvider } from "./hooks/useMessageTemplatesProvider";
export { useRolesProvider } from "./hooks/useRolesProvider";
export { useDepartmentsProvider } from "./hooks/useDepartmentsProvider";
export { useRotationQueuesProvider } from "./hooks/useRotationQueuesProvider";
export { useRotationParticipantsProvider } from "./hooks/useRotationParticipantsProvider";
export { useAiProvider } from "./hooks/useAiProvider";
export { useAtendimentoMetricsProvider } from "./hooks/useAtendimentoMetricsProvider";
export { useWhatsAppGoServersProvider } from "./hooks/useWhatsAppGoServersProvider";
export { useWahaServersProvider } from "./hooks/useWahaServersProvider";
export { useWhatsAppOpenWaServersProvider } from "./hooks/useWhatsAppOpenWaServersProvider";
export { useConversationTagsProvider } from "./hooks/useConversationTagsProvider";
export { useConversationParticipantsProvider } from "./hooks/useConversationParticipantsProvider";
export { useSdrPilotSettingsProvider } from "./hooks/useSdrPilotSettingsProvider";
export { useConversationRescuesProvider } from "./hooks/useConversationRescuesProvider";
export { usePixKeyProvider } from "./hooks/usePixKeyProvider";
export { useNpsProvider } from "./hooks/useNpsProvider";

export {
  statusOnAssign,
  statusOnUnassign,
  coupleManualStatusChange,
  type ManualStatusCoupling,
} from "./engine/assignmentStatusCoupling";
