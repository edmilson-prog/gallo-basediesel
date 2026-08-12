/**
 * Barrel for every data provider contract.
 *
 * Internal — features must consume providers via the hooks exported from
 * `src/providers/data/index.ts`, never from this file directly.
 */

import type { ICustomersProvider } from "./customers";
import type { IContactsProvider } from "./contacts";
import type { IVehiclesProvider } from "./vehicles";
import type { ILeadsProvider } from "./leads";
import type { ILeadFunnelsProvider } from "./leadFunnels";
import type { IConversationsProvider } from "./conversations";
import type { IMessagesProvider } from "./messages";
import type { IPartsProvider } from "./parts";
import type { IQuotesProvider } from "./quotes";
import type { IOrdersProvider } from "./orders";
import type { ICommissionsProvider } from "./commissions";
import type { IExpensesProvider } from "./expenses";
import type { ICashFlowProvider } from "./cashflow";
import type { IGoalsProvider } from "./goals";
import type { IRecommendationsProvider } from "./recommendations";
import type { ITransfersProvider } from "./transfers";
import type { ISegmentsProvider } from "./segments";
import type { ISellersProvider } from "./sellers";
import type { IStoresProvider } from "./stores";
import type { ISettingsProvider } from "./settings";
import type { IAuditsProvider } from "./audits";
import type { IWhatsAppAccountsProvider } from "./whatsappAccounts";
import type { IDistributionTracesProvider } from "./distributionTraces";
import type { IActivityProvider } from "./activity";
import type { IManagerDashboardProvider } from "./managerDashboard";
import type { ISdrSessionsProvider } from "./sdrSessions";
import type { ISdrEscalationsProvider } from "./sdrEscalations";
import type { ICopilotProvider } from "./copilot";
import type { IIndicatorsProvider } from "./indicators";
import type { IVehicleModelsProvider } from "./vehicleModels";
import type { IModelKitsProvider } from "./modelKits";
import type { IMediaStorageProvider } from "./mediaStorage";
import type { IAssetLibraryProvider } from "./assetLibrary";
import type { IQuickReplyProvider } from "./quickReply";
import type { ITrackableLinkProvider } from "./trackableLink";
import type { IScheduledSendProvider } from "./scheduledSend";
import type { IConversationNotesProvider } from "./conversationNotes";
import type { IConversationPinsProvider } from "./conversationPins";
import type { IStorefrontProvider } from "./storefront";
import type { ISystemHealthProvider } from "./systemHealth";
import type { IWebhookDeliveriesProvider } from "./webhookDeliveries";
import type { IMessageTemplatesProvider } from "./messageTemplates";
import type { IRolesProvider } from "./roles";
import type { IDepartmentsProvider } from "./departments";
import type { IRotationQueuesProvider } from "./rotationQueues";
import type { IRotationParticipantsProvider } from "./rotationParticipants";
import type { IAiProvider } from "./ai";
import type { IAtendimentoMetricsProvider } from "./atendimentoMetrics";
import type { IWhatsAppGoServersProvider } from "./whatsappGoServers";
import type { IWahaServersProvider } from "./wahaServers";
import type { IWhatsAppOpenWaServersProvider } from "./whatsappOpenWaServers";
import type { IConversationTagsProvider } from "./conversationTags";
import type { IConversationParticipantsProvider } from "./conversationParticipants";
import type { ISdrPilotSettingsProvider } from "./sdrPilotSettings";
import type { IConversationRescuesProvider } from "./conversationRescues";
import type { IPixKeyProvider } from "./pixKey";
import type { INpsProvider } from "./nps";

export type { IPaginatedResult, IPaginationParams } from "./_shared";
export { FETCH_ALL_PAGE_SIZE } from "./_shared";

export type {
  ICustomersProvider,
  IListCustomersParams,
  IConvertPendingContactInput,
  ICustomerDocumentMatch,
  IWalletStats,
  IWalletStatsParams,
  IWalletSellerStats,
} from "./customers";
export { WALLET_STALE_DAYS } from "./customers";
export type {
  IContactsProvider,
  IListContactsParams,
  ContactsOrderBy,
  ContactRecencyBucket,
} from "./contacts";
export type {
  IVehiclesProvider,
  IListVehiclesParams,
  IAddServiceEntryInput,
  VehiclesOrderBy,
  VehiclesOrderDir,
} from "./vehicles";
export type { ILeadsProvider, IListLeadsParams } from "./leads";
export type { ILeadFunnelsProvider } from "./leadFunnels";
export type {
  IConversationsProvider,
  IListConversationsParams,
  ICreateConversationInput,
  ICreateConversationResult,
} from "./conversations";
export type {
  IMessagesProvider,
  IListMessagesParams,
  IListMessagesForAnalyticsParams,
} from "./messages";
export type { IPartsProvider, IListPartsParams } from "./parts";
export type { IQuotesProvider, IListQuotesParams } from "./quotes";
export type { IOrdersProvider, IListOrdersParams } from "./orders";
export type { ICommissionsProvider, IListCommissionsParams } from "./commissions";
export type {
  IExpensesProvider,
  IListExpensesParams,
  ICreateExpenseInput,
  IMarkExpensePaidInput,
  ICancelExpenseInput,
  IUpdateExpenseSeriesInput,
  ICancelExpenseSeriesInput,
  ExpenseSeriesScope,
} from "./expenses";
export type {
  ICashFlowProvider,
  IListCashFlowEntriesParams,
  ICreateCashFlowEntryInput,
} from "./cashflow";
export type { IGoalsProvider, IListGoalsParams } from "./goals";
export type { IRecommendationsProvider, IListRecommendationsParams } from "./recommendations";
export type { ITransfersProvider, IListTransfersParams, ICreateTransferInput } from "./transfers";
export type { ISegmentsProvider, IListSegmentsParams } from "./segments";
export type { ISellersProvider, IListSellersParams, ICreateSellerInput } from "./sellers";
export type { IStoresProvider } from "./stores";
export type { ISettingsProvider } from "./settings";
export type { IAuditsProvider, IListAuditsParams, ICreateAuditInput } from "./audits";
export type {
  IWhatsAppAccountsProvider,
  IListWhatsAppAccountsParams,
  IWhatsAppAccountMetrics,
} from "./whatsappAccounts";
export { computeFailureRate } from "./whatsappAccounts";
export type {
  IDistributionTracesProvider,
  IListDistributionTracesParams,
} from "./distributionTraces";
export type { IActivityProvider } from "./activity";
export type {
  IManagerDashboardProvider,
  IManagerDashboardSnapshotParams,
  IManagerDashboardSnapshot,
} from "./managerDashboard";
export type { ISdrSessionsProvider, IListSdrSessionsParams } from "./sdrSessions";
export type { ISdrEscalationsProvider, IListSdrEscalationsParams } from "./sdrEscalations";
export type { ICopilotProvider } from "./copilot";
export type { IIndicatorsProvider, IListIndicatorsParams } from "./indicators";
export type {
  IVehicleModelsProvider,
  IListVehicleModelsParams,
  ICreateVehicleModelInput,
  IUpdateVehicleModelPatch,
} from "./vehicleModels";
export type {
  IModelKitsProvider,
  IListModelKitsParams,
  ICreateModelKitInput,
  IUpdateModelKitPatch,
} from "./modelKits";
export type { IMediaStorageProvider, IMediaUploadInput, IListMediaParams } from "./mediaStorage";
export type { IAssetLibraryProvider, IAssetLibraryListParams } from "./assetLibrary";
export type { IQuickReplyProvider } from "./quickReply";
export type { ITrackableLinkProvider } from "./trackableLink";
export type { IScheduledSendProvider } from "./scheduledSend";
export type { IConversationNotesProvider } from "./conversationNotes";
export type { IConversationPinsProvider, IConversationPin } from "./conversationPins";
export type { IStorefrontProvider } from "./storefront";
export type { ISystemHealthProvider } from "./systemHealth";
export type { IWebhookDeliveriesProvider } from "./webhookDeliveries";
export type {
  IMessageTemplatesProvider,
  IListMessageTemplatesParams,
  ICreateMessageTemplateInput,
  IUpdateMessageTemplateInput,
} from "./messageTemplates";
export type {
  IConversationTagsProvider,
  IListConversationTagsParams,
  ICreateConversationTagInput,
  IUpdateConversationTagInput,
} from "./conversationTags";
export type { IConversationParticipantsProvider } from "./conversationParticipants";
export type { IRolesProvider, ICreateRoleInput } from "./roles";
export type { IDepartmentsProvider, ICreateDepartmentInput } from "./departments";
export type { IRotationQueuesProvider } from "./rotationQueues";
export type {
  IRotationParticipantsProvider,
  IAddRotationParticipantInput,
} from "./rotationParticipants";
export type { IAiProvider } from "./ai";
export type { IAtendimentoMetricsProvider } from "./atendimentoMetrics";
export type {
  IWhatsAppGoServersProvider,
  ICreateGoServerInput,
  IGoServerPatch,
} from "./whatsappGoServers";
export type { IWahaServersProvider, ICreateWahaServerInput, IWahaServerPatch } from "./wahaServers";
export type {
  IWhatsAppOpenWaServersProvider,
  ICreateOpenWaServerInput,
  IOpenWaServerPatch,
} from "./whatsappOpenWaServers";
export type { ISdrPilotSettingsProvider } from "./sdrPilotSettings";
export type { IConversationRescuesProvider } from "./conversationRescues";
export type { IPixKeyProvider } from "./pixKey";
export type { INpsProvider } from "./nps";

/**
 * Aggregate of every data provider returned by `getDataProviders()`. The factory
 * guarantees the same set of keys regardless of the chosen implementation
 * (mock vs supabase) so consumers stay implementation-agnostic.
 */
export interface IDataProviders {
  customers: ICustomersProvider;
  contacts: IContactsProvider;
  vehicles: IVehiclesProvider;
  leads: ILeadsProvider;
  leadFunnels: ILeadFunnelsProvider;
  conversations: IConversationsProvider;
  messages: IMessagesProvider;
  parts: IPartsProvider;
  quotes: IQuotesProvider;
  orders: IOrdersProvider;
  commissions: ICommissionsProvider;
  expenses: IExpensesProvider;
  cashflow: ICashFlowProvider;
  goals: IGoalsProvider;
  recommendations: IRecommendationsProvider;
  transfers: ITransfersProvider;
  segments: ISegmentsProvider;
  sellers: ISellersProvider;
  stores: IStoresProvider;
  settings: ISettingsProvider;
  audits: IAuditsProvider;
  whatsappAccounts: IWhatsAppAccountsProvider;
  distributionTraces: IDistributionTracesProvider;
  activity: IActivityProvider;
  managerDashboard: IManagerDashboardProvider;
  sdrSessions: ISdrSessionsProvider;
  sdrEscalations: ISdrEscalationsProvider;
  copilot: ICopilotProvider;
  indicators: IIndicatorsProvider;
  vehicleModels: IVehicleModelsProvider;
  modelKits: IModelKitsProvider;
  media: IMediaStorageProvider;
  assetLibrary: IAssetLibraryProvider;
  quickReply: IQuickReplyProvider;
  trackableLink: ITrackableLinkProvider;
  scheduledSend: IScheduledSendProvider;
  conversationNotes: IConversationNotesProvider;
  conversationPins: IConversationPinsProvider;
  storefront: IStorefrontProvider;
  systemHealth: ISystemHealthProvider;
  webhookDeliveries: IWebhookDeliveriesProvider;
  messageTemplates: IMessageTemplatesProvider;
  roles: IRolesProvider;
  departments: IDepartmentsProvider;
  rotationQueues: IRotationQueuesProvider;
  rotationParticipants: IRotationParticipantsProvider;
  ai: IAiProvider;
  atendimentoMetrics: IAtendimentoMetricsProvider;
  whatsappGoServers: IWhatsAppGoServersProvider;
  wahaServers: IWahaServersProvider;
  whatsappOpenWaServers: IWhatsAppOpenWaServersProvider;
  conversationTags: IConversationTagsProvider;
  conversationParticipants: IConversationParticipantsProvider;
  sdrPilotSettings: ISdrPilotSettingsProvider;
  conversationRescues: IConversationRescuesProvider;
  pixKey: IPixKeyProvider;
  nps: INpsProvider;
}
