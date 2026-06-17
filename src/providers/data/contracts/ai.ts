import type {
  AiFeatureKey,
  AiProviderId,
  AiUsagePeriod,
  IAiBudget,
  IAiFeatureRouting,
  IAiPlaygroundInput,
  IAiPlaygroundResult,
  IAiProviderConfig,
  IAiSettings,
  IAiTestConnectionResult,
  IAiUsageEvent,
  IAiUsageSummary,
} from "@/shared/types";

/**
 * AI configuration + usage provider (37th provider).
 * Phase 1: deterministic mock. Phase 2: Supabase + Edge proxy (deferred).
 * API keys do NOT flow through here — they live in the Vault (integration-secrets).
 */
export interface IAiProvider {
  getSettings(): Promise<IAiSettings>;
  setMasterEnabled(enabled: boolean): Promise<void>;
  setDefaultProvider(providerId: AiProviderId): Promise<void>;
  updateBudget(patch: Partial<IAiBudget>): Promise<IAiBudget>;
  updateProviderConfig(
    providerId: AiProviderId,
    patch: Partial<IAiProviderConfig>,
  ): Promise<IAiProviderConfig>;
  testConnection(providerId: AiProviderId): Promise<IAiTestConnectionResult>;
  updateFeatureRouting(
    feature: AiFeatureKey,
    patch: Partial<IAiFeatureRouting>,
  ): Promise<IAiFeatureRouting>;
  getUsageSummary(period: AiUsagePeriod): Promise<IAiUsageSummary>;
  listUsageEvents(): Promise<IAiUsageEvent[]>;
  runPlayground(input: IAiPlaygroundInput): Promise<IAiPlaygroundResult>;
}
