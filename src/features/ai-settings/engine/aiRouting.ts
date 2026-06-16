import type { AiFeatureKey, AiProviderId, IAiGenerationParams, IAiSettings } from "@/shared/types";

export interface IResolvedModel {
  providerId: AiProviderId;
  model: string;
  params: IAiGenerationParams;
  systemPrompt: string;
  usedFallback: boolean;
}

function providerAvailable(settings: IAiSettings, providerId: AiProviderId): boolean {
  const p = settings.providers.find((x) => x.provider === providerId);
  return Boolean(p && p.enabled && p.status === "configured");
}

/** Returns the effective {provider, model, params, prompt} for a feature, or null when AI is off. */
export function resolveEffectiveModel(settings: IAiSettings, feature: AiFeatureKey): IResolvedModel | null {
  if (!settings.masterEnabled) return null;
  const route = settings.routing.find((r) => r.feature === feature);
  if (!route || !route.enabled) return null;

  if (providerAvailable(settings, route.providerId)) {
    return {
      providerId: route.providerId,
      model: route.model,
      params: route.params,
      systemPrompt: route.systemPrompt,
      usedFallback: false,
    };
  }
  if (route.fallbackProviderId && route.fallbackModel && providerAvailable(settings, route.fallbackProviderId)) {
    return {
      providerId: route.fallbackProviderId,
      model: route.fallbackModel,
      params: route.params,
      systemPrompt: route.systemPrompt,
      usedFallback: true,
    };
  }
  return null;
}
