/**
 * Barrel for every data provider contract.
 *
 * Internal — features must consume providers via the hooks exported from
 * `src/providers/data/index.ts`, never from this file directly.
 */

import type { ICustomersProvider } from "./customers";
import type { IVehiclesProvider } from "./vehicles";
import type { ILeadsProvider } from "./leads";
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
import type { IManagerDashboardProvider } from "./managerDashboard";
import type { ISdrSessionsProvider } from "./sdrSessions";
import type { ISdrEscalationsProvider } from "./sdrEscalations";
import type { ICopilotProvider } from "./copilot";
import type { IIndicatorsProvider } from "./indicators";
import type { IVehicleModelsProvider } from "./vehicleModels";
import type { IModelKitsProvider } from "./modelKits";
import type { IMediaStorageProvider } from "./mediaStorage";

export type { IPaginatedResult, IPaginationParams } from "./_shared";

export type { ICustomersProvider, IListCustomersParams } from "./customers";
export type {
  IVehiclesProvider,
  IListVehiclesParams,
  IAddServiceEntryInput,
  VehiclesOrderBy,
  VehiclesOrderDir,
} from "./vehicles";
export type { ILeadsProvider, IListLeadsParams } from "./leads";
export type {
  IConversationsProvider,
  IListConversationsParams,
  ICreateConversationInput,
  ICreateConversationResult,
} from "./conversations";
export type { IMessagesProvider, IListMessagesParams } from "./messages";
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
export type { ISellersProvider, IListSellersParams } from "./sellers";
export type { IStoresProvider } from "./stores";
export type { ISettingsProvider } from "./settings";
export type { IAuditsProvider, IListAuditsParams, ICreateAuditInput } from "./audits";
export type { IWhatsAppAccountsProvider, IListWhatsAppAccountsParams } from "./whatsappAccounts";
export type {
  IDistributionTracesProvider,
  IListDistributionTracesParams,
} from "./distributionTraces";
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

/**
 * Aggregate of every data provider returned by `getDataProviders()`. The factory
 * guarantees the same set of keys regardless of the chosen implementation
 * (mock vs supabase) so consumers stay implementation-agnostic.
 */
export interface IDataProviders {
  customers: ICustomersProvider;
  vehicles: IVehiclesProvider;
  leads: ILeadsProvider;
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
  managerDashboard: IManagerDashboardProvider;
  sdrSessions: ISdrSessionsProvider;
  sdrEscalations: ISdrEscalationsProvider;
  copilot: ICopilotProvider;
  indicators: IIndicatorsProvider;
  vehicleModels: IVehicleModelsProvider;
  modelKits: IModelKitsProvider;
  media: IMediaStorageProvider;
}
