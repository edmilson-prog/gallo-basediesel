import type { IDataProviders } from "./contracts";

import { mockCustomersProvider } from "./impl/mock/customers";
import { mockVehiclesProvider } from "./impl/mock/vehicles";
import { mockLeadsProvider } from "./impl/mock/leads";
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
import { mockManagerDashboardProvider } from "./impl/mock/managerDashboard";
import { mockSdrSessionsProvider } from "./impl/mock/sdrSessions";
import { mockSdrEscalationsProvider } from "./impl/mock/sdrEscalations";
import { mockCopilotProvider } from "./impl/mock/copilot";
import { mockIndicatorsProvider } from "./impl/mock/indicators";
import { mockVehicleModelsProvider } from "./impl/mock/vehicleModels";
import { mockModelKitsProvider } from "./impl/mock/modelKits";
import { mockMediaProvider } from "./impl/mock/media";

import { supabaseCustomersProvider } from "./impl/supabase/customers";
import { supabaseVehiclesProvider } from "./impl/supabase/vehicles";
import { supabaseLeadsProvider } from "./impl/supabase/leads";
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
import { supabaseManagerDashboardProvider } from "./impl/supabase/managerDashboard";
import { supabaseSdrSessionsProvider } from "./impl/supabase/sdrSessions";
import { supabaseSdrEscalationsProvider } from "./impl/supabase/sdrEscalations";
import { supabaseCopilotProvider } from "./impl/supabase/copilot";
import { supabaseIndicatorsProvider } from "./impl/supabase/indicators";
import { supabaseVehicleModelsProvider } from "./impl/supabase/vehicleModels";
import { supabaseModelKitsProvider } from "./impl/supabase/modelKits";
import { supabaseMediaProvider } from "./impl/supabase/media";

type DataSource = "mock" | "supabase";

const VALID_SOURCES: readonly DataSource[] = ["mock", "supabase"] as const;

function resolveDataSource(): DataSource {
  const raw = import.meta.env.VITE_DATA_SOURCE;
  if (raw && (VALID_SOURCES as readonly string[]).includes(raw)) {
    return raw as DataSource;
  }
  if (raw && import.meta.env.DEV) {
    console.warn(
      `[providers/data] VITE_DATA_SOURCE="${raw}" is not a valid data source. ` +
        `Falling back to "mock". Allowed values: ${VALID_SOURCES.join(", ")}.`,
    );
  }
  return "mock";
}

const DATA_SOURCE: DataSource = resolveDataSource();

if (import.meta.env.DEV) {
  console.info(`[providers/data] active data source: "${DATA_SOURCE}"`);
}

const mockProviders: IDataProviders = {
  customers: mockCustomersProvider,
  vehicles: mockVehiclesProvider,
  leads: mockLeadsProvider,
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
  managerDashboard: mockManagerDashboardProvider,
  sdrSessions: mockSdrSessionsProvider,
  sdrEscalations: mockSdrEscalationsProvider,
  copilot: mockCopilotProvider,
  indicators: mockIndicatorsProvider,
  vehicleModels: mockVehicleModelsProvider,
  modelKits: mockModelKitsProvider,
  media: mockMediaProvider,
};

const supabaseProviders: IDataProviders = {
  customers: supabaseCustomersProvider,
  vehicles: supabaseVehiclesProvider,
  leads: supabaseLeadsProvider,
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
  managerDashboard: supabaseManagerDashboardProvider,
  sdrSessions: supabaseSdrSessionsProvider,
  sdrEscalations: supabaseSdrEscalationsProvider,
  copilot: supabaseCopilotProvider,
  indicators: supabaseIndicatorsProvider,
  vehicleModels: supabaseVehicleModelsProvider,
  modelKits: supabaseModelKitsProvider,
  media: supabaseMediaProvider,
};

/**
 * Returns the singleton bundle of data providers selected by the build-time
 * `VITE_DATA_SOURCE` environment variable. The same instance is returned on
 * every call so React Context propagation stays stable.
 */
export function getDataProviders(): IDataProviders {
  return DATA_SOURCE === "supabase" ? supabaseProviders : mockProviders;
}
