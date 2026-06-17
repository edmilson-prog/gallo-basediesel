import seedrandom from "seedrandom";
import type { AiFeatureKey, IAiUsageEvent } from "@/shared/types";
import { FEATURES, buildDefaultAiSettings, modelsFor } from "@/providers/data/engine/aiCatalog";

// Re-export so existing mock imports keep working.
export { FEATURES, modelsFor } from "@/providers/data/engine/aiCatalog";

export function defaultAiSettings() {
  return buildDefaultAiSettings("mock");
}

/**
 * Deterministic 60-day usage history (covers "current month" + comparison).
 * `referenceIso` is the "now" anchor so reloads produce the same dataset.
 */
export function seedUsageEvents(referenceIso: string): IAiUsageEvent[] {
  const rng = seedrandom("gallo-ai-usage-v1");
  const settings = defaultAiSettings();
  const routingByFeature = new Map(settings.routing.map((r) => [r.feature, r]));
  const now = new Date(referenceIso);
  const events: IAiUsageEvent[] = [];
  for (let dayOffset = 59; dayOffset >= 0; dayOffset--) {
    const day = new Date(now);
    day.setUTCDate(day.getUTCDate() - dayOffset);
    const callsToday = 20 + Math.floor(rng() * 60);
    for (let i = 0; i < callsToday; i++) {
      const feature = FEATURES[Math.floor(rng() * FEATURES.length)]!;
      const route = routingByFeature.get(feature)!;
      if (!route.enabled) continue;
      const usedFallback = rng() < 0.05;
      const providerId =
        usedFallback && route.fallbackProviderId ? route.fallbackProviderId : route.providerId;
      const model = usedFallback && route.fallbackModel ? route.fallbackModel : route.model;
      const inputTokens = 200 + Math.floor(rng() * 800);
      const outputTokens = 80 + Math.floor(rng() * 400);
      const isError = rng() < 0.02;
      const ts = new Date(day);
      ts.setUTCHours(8 + Math.floor(rng() * 11), Math.floor(rng() * 60), 0, 0);
      events.push({
        id: `aiu-${dayOffset}-${i}`,
        ts: ts.toISOString(),
        source: "routed",
        feature,
        providerId,
        model,
        inputTokens,
        outputTokens,
        costBRL: 0, // filled by the pricing engine in the mock provider
        latencyMs: 600 + Math.floor(rng() * 1800),
        status: isError ? "error" : usedFallback ? "fallback" : "ok",
      });
    }
  }
  return events;
}
