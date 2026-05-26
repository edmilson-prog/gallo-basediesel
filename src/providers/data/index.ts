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
export { NotImplementedError } from "./errors";
export { recordAuditLog, recordAuditLogSync, type ICreateAuditInput } from "./auditLogger";

export type {
  IDataProviders,
  IPaginatedResult,
  IPaginationParams,
  ICustomersProvider,
  IListCustomersParams,
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
  IPartsProvider,
  IListPartsParams,
  IQuotesProvider,
  IListQuotesParams,
  IOrdersProvider,
  IListOrdersParams,
  ICommissionsProvider,
  IListCommissionsParams,
  IGoalsProvider,
  IListGoalsParams,
  IRecommendationsProvider,
  IListRecommendationsParams,
  ITransfersProvider,
  IListTransfersParams,
  ISegmentsProvider,
  IListSegmentsParams,
  ISellersProvider,
  IListSellersParams,
  IStoresProvider,
  ISettingsProvider,
  IAuditsProvider,
  IListAuditsParams,
  IWhatsAppAccountsProvider,
  IListWhatsAppAccountsParams,
  IDistributionTracesProvider,
  IListDistributionTracesParams,
  IManagerDashboardProvider,
  IManagerDashboardSnapshotParams,
  IManagerDashboardSnapshot,
} from "./contracts";

export { useCustomersProvider } from "./hooks/useCustomersProvider";
export { useVehiclesProvider } from "./hooks/useVehiclesProvider";
export { useLeadsProvider } from "./hooks/useLeadsProvider";
export { useConversationsProvider } from "./hooks/useConversationsProvider";
export { useMessagesProvider } from "./hooks/useMessagesProvider";
export { usePartsProvider } from "./hooks/usePartsProvider";
export { useQuotesProvider } from "./hooks/useQuotesProvider";
export { useOrdersProvider } from "./hooks/useOrdersProvider";
export { useCommissionsProvider } from "./hooks/useCommissionsProvider";
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
export { useManagerDashboardProvider } from "./hooks/useManagerDashboardProvider";
