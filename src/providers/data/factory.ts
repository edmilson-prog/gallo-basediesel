import type { IDataProviders } from "./contracts";

import { mockCustomersProvider } from "./impl/mock/customers";
import { mockVehiclesProvider } from "./impl/mock/vehicles";
import { mockLeadsProvider } from "./impl/mock/leads";
import { mockLeadFunnelsProvider } from "./impl/mock/leadFunnels";
import { mockConversationsProvider } from "./impl/mock/conversations";
import { mockMessagesProvider } from "./impl/mock/messages";
import { mockPartsProvider } from "./impl/mock/parts";
import { mockQuotesProvider } from "./impl/mock/quotes";
import { mockOrdersProvider } from "./impl/mock/orders";
import { mockCommissionsProvider } from "./impl/mock/commissions";
import { mockExpensesProvider } from "./impl/mock/expenses";
import { mockCashFlowProvider } from "./impl/mock/cashflow";
import { mockGoalsProvider } from "./impl/mock/goals";
import { mockRecommendationsProvider } from "./impl/mock/recommendations";
import { mockTransfersProvider } from "./impl/mock/transfers";
import { mockSegmentsProvider } from "./impl/mock/segments";
import { mockSellersProvider } from "./impl/mock/sellers";
import { mockStoresProvider } from "./impl/mock/stores";
import { mockSettingsProvider } from "./impl/mock/settings";
import { mockAuditsProvider } from "./impl/mock/audits";
import { mockWhatsAppAccountsProvider } from "./impl/mock/whatsappAccounts";
import { mockDistributionTracesProvider } from "./impl/mock/distributionTraces";
import { mockActivityProvider } from "./impl/mock/activity";
import { mockManagerDashboardProvider } from "./impl/mock/managerDashboard";
import { mockSdrSessionsProvider } from "./impl/mock/sdrSessions";
import { mockSdrEscalationsProvider } from "./impl/mock/sdrEscalations";
import { mockCopilotProvider } from "./impl/mock/copilot";
import { mockIndicatorsProvider } from "./impl/mock/indicators";
import { mockVehicleModelsProvider } from "./impl/mock/vehicleModels";
import { mockModelKitsProvider } from "./impl/mock/modelKits";
import { mockMediaProvider } from "./impl/mock/media";
import { mockAssetLibraryProvider } from "./impl/mock/assetLibrary";
import { mockQuickReplyProvider } from "./impl/mock/quickReply";
import { mockTrackableLinkProvider } from "./impl/mock/trackableLink";
import { mockScheduledSendProvider } from "./impl/mock/scheduledSend";
import { mockConversationNotesProvider } from "./impl/mock/conversationNotes";
import { mockStorefrontProvider } from "./impl/mock/storefront";
import { mockSystemHealthProvider } from "./impl/mock/systemHealth";
import { mockWebhookDeliveriesProvider } from "./impl/mock/webhookDeliveries";
import { mockMessageTemplatesProvider } from "./impl/mock/messageTemplates";
import { mockRolesProvider } from "./impl/mock/roles";
import { mockDepartmentsProvider } from "./impl/mock/departments";
import { mockRotationQueuesProvider } from "./impl/mock/rotationQueues";
import { mockRotationParticipantsProvider } from "./impl/mock/rotationParticipants";
import { mockAiProvider } from "./impl/mock/ai";
import { mockAtendimentoMetricsProvider } from "./impl/mock/atendimentoMetrics";
import { mockWhatsAppGoServersProvider } from "./impl/mock/whatsappGoServers";
import { mockWahaServersProvider } from "./impl/mock/wahaServers";
import { mockWhatsAppOpenWaServersProvider } from "./impl/mock/whatsappOpenWaServers";
import { mockConversationTagsProvider } from "./impl/mock/conversationTags";
import { mockConversationParticipantsProvider } from "./impl/mock/conversationParticipants";
import { mockSdrPilotSettingsProvider } from "./impl/mock/sdrPilotSettings";
import { mockConversationRescuesProvider } from "./impl/mock/conversationRescues";
import { mockPixKeyProvider } from "./impl/mock/pixKey";

import { supabaseCustomersProvider } from "./impl/supabase/customers";
import { supabaseVehiclesProvider } from "./impl/supabase/vehicles";
import { supabaseLeadsProvider } from "./impl/supabase/leads";
import { supabaseLeadFunnelsProvider } from "./impl/supabase/leadFunnels";
import { supabaseConversationsProvider } from "./impl/supabase/conversations";
import { supabaseMessagesProvider } from "./impl/supabase/messages";
import { supabasePartsProvider } from "./impl/supabase/parts";
import { supabaseQuotesProvider } from "./impl/supabase/quotes";
import { supabaseOrdersProvider } from "./impl/supabase/orders";
import { supabaseCommissionsProvider } from "./impl/supabase/commissions";
import { supabaseExpensesProvider } from "./impl/supabase/expenses";
import { supabaseCashFlowProvider } from "./impl/supabase/cashflow";
import { supabaseGoalsProvider } from "./impl/supabase/goals";
import { supabaseRecommendationsProvider } from "./impl/supabase/recommendations";
import { supabaseTransfersProvider } from "./impl/supabase/transfers";
import { supabaseSegmentsProvider } from "./impl/supabase/segments";
import { supabaseSellersProvider } from "./impl/supabase/sellers";
import { supabaseStoresProvider } from "./impl/supabase/stores";
import { supabaseSettingsProvider } from "./impl/supabase/settings";
import { supabaseAuditsProvider } from "./impl/supabase/audits";
import { supabaseWhatsAppAccountsProvider } from "./impl/supabase/whatsappAccounts";
import { supabaseDistributionTracesProvider } from "./impl/supabase/distributionTraces";
import { supabaseActivityProvider } from "./impl/supabase/activity";
import { supabaseManagerDashboardProvider } from "./impl/supabase/managerDashboard";
import { supabaseSdrSessionsProvider } from "./impl/supabase/sdrSessions";
import { supabaseSdrEscalationsProvider } from "./impl/supabase/sdrEscalations";
import { supabaseCopilotProvider } from "./impl/supabase/copilot";
import { supabaseIndicatorsProvider } from "./impl/supabase/indicators";
import { supabaseVehicleModelsProvider } from "./impl/supabase/vehicleModels";
import { supabaseModelKitsProvider } from "./impl/supabase/modelKits";
import { supabaseMediaProvider } from "./impl/supabase/media";
import { supabaseAssetLibraryProvider } from "./impl/supabase/assetLibrary";
import { supabaseQuickReplyProvider } from "./impl/supabase/quickReply";
import { supabaseTrackableLinkProvider } from "./impl/supabase/trackableLink";
import { supabaseScheduledSendProvider } from "./impl/supabase/scheduledSend";
import { supabaseConversationNotesProvider } from "./impl/supabase/conversationNotes";
import { supabaseStorefrontProvider } from "./impl/supabase/storefront";
import { supabaseSystemHealthProvider } from "./impl/supabase/systemHealth";
import { supabaseWebhookDeliveriesProvider } from "./impl/supabase/webhookDeliveries";
import { supabaseMessageTemplatesProvider } from "./impl/supabase/messageTemplates";
import { supabaseRolesProvider } from "./impl/supabase/roles";
import { supabaseDepartmentsProvider } from "./impl/supabase/departments";
import { supabaseRotationQueuesProvider } from "./impl/supabase/rotationQueues";
import { supabaseRotationParticipantsProvider } from "./impl/supabase/rotationParticipants";
import { supabaseAiProvider } from "./impl/supabase/ai";
import { supabaseAtendimentoMetricsProvider } from "./impl/supabase/atendimentoMetrics";
import { supabaseWhatsAppGoServersProvider } from "./impl/supabase/whatsappGoServers";
import { supabaseWahaServersProvider } from "./impl/supabase/wahaServers";
import { supabaseWhatsAppOpenWaServersProvider } from "./impl/supabase/whatsappOpenWaServers";
import { supabaseConversationTagsProvider } from "./impl/supabase/conversationTags";
import { supabaseConversationParticipantsProvider } from "./impl/supabase/conversationParticipants";
import { supabaseSdrPilotSettingsProvider } from "./impl/supabase/sdrPilotSettings";
import { supabaseConversationRescuesProvider } from "./impl/supabase/conversationRescues";
import { supabasePixKeyProvider } from "./impl/supabase/pixKey";

import {
  DATA_SOURCE_OVERRIDE_KEY,
  readSourceOverride,
  resolveSourceMode,
} from "@/shared/lib/environmentMode";

export type DataSource = "mock" | "supabase";

const VALID_SOURCES: readonly DataSource[] = ["mock", "supabase"] as const;

function resolveDataSource(): DataSource {
  const raw = import.meta.env.VITE_DATA_SOURCE;
  // Per-browser override (Configurações → Ambiente & Dados) beats the env
  // default; still resolved ONCE at boot — applying a change reloads the page.
  const override = readSourceOverride(DATA_SOURCE_OVERRIDE_KEY);
  if (!override && raw && !(VALID_SOURCES as readonly string[]).includes(raw)) {
    if (import.meta.env.DEV) {
      console.warn(
        `[providers/data] VITE_DATA_SOURCE="${raw}" is not a valid data source. ` +
          `Falling back to "mock". Allowed values: ${VALID_SOURCES.join(", ")}.`,
      );
    }
  }
  return resolveSourceMode(raw, override);
}

const DATA_SOURCE: DataSource = resolveDataSource();

if (import.meta.env.DEV) {
  console.info(`[providers/data] active data source: "${DATA_SOURCE}"`);
}

const mockProviders: IDataProviders = {
  customers: mockCustomersProvider,
  vehicles: mockVehiclesProvider,
  leads: mockLeadsProvider,
  leadFunnels: mockLeadFunnelsProvider,
  conversations: mockConversationsProvider,
  messages: mockMessagesProvider,
  parts: mockPartsProvider,
  quotes: mockQuotesProvider,
  orders: mockOrdersProvider,
  commissions: mockCommissionsProvider,
  expenses: mockExpensesProvider,
  cashflow: mockCashFlowProvider,
  goals: mockGoalsProvider,
  recommendations: mockRecommendationsProvider,
  transfers: mockTransfersProvider,
  segments: mockSegmentsProvider,
  sellers: mockSellersProvider,
  stores: mockStoresProvider,
  settings: mockSettingsProvider,
  audits: mockAuditsProvider,
  whatsappAccounts: mockWhatsAppAccountsProvider,
  distributionTraces: mockDistributionTracesProvider,
  activity: mockActivityProvider,
  managerDashboard: mockManagerDashboardProvider,
  sdrSessions: mockSdrSessionsProvider,
  sdrEscalations: mockSdrEscalationsProvider,
  copilot: mockCopilotProvider,
  indicators: mockIndicatorsProvider,
  vehicleModels: mockVehicleModelsProvider,
  modelKits: mockModelKitsProvider,
  media: mockMediaProvider,
  assetLibrary: mockAssetLibraryProvider,
  quickReply: mockQuickReplyProvider,
  trackableLink: mockTrackableLinkProvider,
  scheduledSend: mockScheduledSendProvider,
  conversationNotes: mockConversationNotesProvider,
  storefront: mockStorefrontProvider,
  systemHealth: mockSystemHealthProvider,
  webhookDeliveries: mockWebhookDeliveriesProvider,
  messageTemplates: mockMessageTemplatesProvider,
  roles: mockRolesProvider,
  departments: mockDepartmentsProvider,
  rotationQueues: mockRotationQueuesProvider,
  rotationParticipants: mockRotationParticipantsProvider,
  ai: mockAiProvider,
  atendimentoMetrics: mockAtendimentoMetricsProvider,
  whatsappGoServers: mockWhatsAppGoServersProvider,
  wahaServers: mockWahaServersProvider,
  whatsappOpenWaServers: mockWhatsAppOpenWaServersProvider,
  conversationTags: mockConversationTagsProvider,
  conversationParticipants: mockConversationParticipantsProvider,
  sdrPilotSettings: mockSdrPilotSettingsProvider,
  conversationRescues: mockConversationRescuesProvider,
  pixKey: mockPixKeyProvider,
};

const supabaseProviders: IDataProviders = {
  customers: supabaseCustomersProvider,
  vehicles: supabaseVehiclesProvider,
  leads: supabaseLeadsProvider,
  leadFunnels: supabaseLeadFunnelsProvider,
  conversations: supabaseConversationsProvider,
  messages: supabaseMessagesProvider,
  parts: supabasePartsProvider,
  quotes: supabaseQuotesProvider,
  orders: supabaseOrdersProvider,
  commissions: supabaseCommissionsProvider,
  expenses: supabaseExpensesProvider,
  cashflow: supabaseCashFlowProvider,
  goals: supabaseGoalsProvider,
  recommendations: supabaseRecommendationsProvider,
  transfers: supabaseTransfersProvider,
  segments: supabaseSegmentsProvider,
  sellers: supabaseSellersProvider,
  stores: supabaseStoresProvider,
  settings: supabaseSettingsProvider,
  audits: supabaseAuditsProvider,
  whatsappAccounts: supabaseWhatsAppAccountsProvider,
  distributionTraces: supabaseDistributionTracesProvider,
  activity: supabaseActivityProvider,
  managerDashboard: supabaseManagerDashboardProvider,
  sdrSessions: supabaseSdrSessionsProvider,
  sdrEscalations: supabaseSdrEscalationsProvider,
  copilot: supabaseCopilotProvider,
  indicators: supabaseIndicatorsProvider,
  vehicleModels: supabaseVehicleModelsProvider,
  modelKits: supabaseModelKitsProvider,
  media: supabaseMediaProvider,
  assetLibrary: supabaseAssetLibraryProvider,
  quickReply: supabaseQuickReplyProvider,
  trackableLink: supabaseTrackableLinkProvider,
  scheduledSend: supabaseScheduledSendProvider,
  conversationNotes: supabaseConversationNotesProvider,
  storefront: supabaseStorefrontProvider,
  systemHealth: supabaseSystemHealthProvider,
  webhookDeliveries: supabaseWebhookDeliveriesProvider,
  messageTemplates: supabaseMessageTemplatesProvider,
  roles: supabaseRolesProvider,
  departments: supabaseDepartmentsProvider,
  rotationQueues: supabaseRotationQueuesProvider,
  rotationParticipants: supabaseRotationParticipantsProvider,
  ai: supabaseAiProvider,
  atendimentoMetrics: supabaseAtendimentoMetricsProvider,
  whatsappGoServers: supabaseWhatsAppGoServersProvider,
  wahaServers: supabaseWahaServersProvider,
  whatsappOpenWaServers: supabaseWhatsAppOpenWaServersProvider,
  conversationTags: supabaseConversationTagsProvider,
  conversationParticipants: supabaseConversationParticipantsProvider,
  sdrPilotSettings: supabaseSdrPilotSettingsProvider,
  conversationRescues: supabaseConversationRescuesProvider,
  pixKey: supabasePixKeyProvider,
};

/**
 * Returns the singleton bundle of data providers selected by the build-time
 * `VITE_DATA_SOURCE` environment variable. The same instance is returned on
 * every call so React Context propagation stays stable.
 */
export function getDataProviders(): IDataProviders {
  return DATA_SOURCE === "supabase" ? supabaseProviders : mockProviders;
}

/**
 * The data origin selected at build time (`mock` or `supabase`). Exposed so the
 * UI (e.g. the data-source health banner) can label which source is active when
 * surfacing a data-origin break.
 */
export function getActiveDataSource(): DataSource {
  return DATA_SOURCE;
}
