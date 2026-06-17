import { getSupabaseClient } from "@/shared/lib/supabase";
import { buildDefaultAiSettings } from "@/providers/data/engine/aiCatalog";
import { summarizeUsage } from "@/features/ai-settings/engine/aiUsage";
import { projectMonthlySpend } from "@/features/ai-settings/engine/aiBudget";
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
import type { IAiProvider } from "../../contracts/ai";

const SETTINGS_COLUMNS =
  "id, master_enabled, default_provider_id, budget, providers, routing, updated_at, updated_by";

export interface AiSettingsRow {
  id: number;
  master_enabled: boolean;
  default_provider_id: string;
  budget: IAiBudget;
  providers: IAiProviderConfig[];
  routing: IAiFeatureRouting[];
  updated_at: string;
  updated_by: string | null;
}

export function rowToSettings(row: AiSettingsRow): IAiSettings {
  return {
    masterEnabled: row.master_enabled,
    defaultProviderId: row.default_provider_id as AiProviderId,
    budget: row.budget,
    providers: row.providers,
    routing: row.routing,
  };
}

export function settingsToRow(s: IAiSettings, updatedBy: string | null) {
  return {
    id: 1 as const,
    master_enabled: s.masterEnabled,
    default_provider_id: s.defaultProviderId,
    budget: s.budget,
    providers: s.providers,
    routing: s.routing,
    updated_by: updatedBy,
  };
}

interface AiUsageEventRow {
  id: string;
  ts: string;
  source: "playground" | "routed";
  feature: string | null;
  provider_id: string;
  model: string;
  input_tokens: number;
  output_tokens: number;
  cost_brl: number | string;
  latency_ms: number;
  status: "ok" | "error" | "fallback";
}

function rowToUsageEvent(r: AiUsageEventRow): IAiUsageEvent {
  return {
    id: r.id,
    ts: r.ts,
    source: r.source,
    feature: r.feature ? (r.feature as AiFeatureKey) : undefined,
    providerId: r.provider_id as AiProviderId,
    model: r.model,
    inputTokens: r.input_tokens,
    outputTokens: r.output_tokens,
    costBRL: Number(r.cost_brl),
    latencyMs: r.latency_ms,
    status: r.status,
  };
}

async function loadSettingsRow(): Promise<AiSettingsRow> {
  const client = getSupabaseClient();
  const { data, error } = await client
    .from("ai_settings")
    .select(SETTINGS_COLUMNS)
    .eq("id", 1)
    .maybeSingle<AiSettingsRow>();
  if (error) throw new Error(`[supabase] ai.getSettings failed: ${error.message}`);
  if (data) return data;

  // Seed the singleton default on first read (race-safe via ON CONFLICT DO NOTHING).
  const { data: auth } = await client.auth.getUser();
  await client
    .from("ai_settings")
    .upsert(settingsToRow(buildDefaultAiSettings("supabase"), auth.user?.id ?? null), {
      onConflict: "id",
      ignoreDuplicates: true,
    });
  const { data: seeded, error: reErr } = await client
    .from("ai_settings")
    .select(SETTINGS_COLUMNS)
    .eq("id", 1)
    .single<AiSettingsRow>();
  if (reErr) throw new Error(`[supabase] ai.getSettings (seed) failed: ${reErr.message}`);
  return seeded;
}

async function writeSettings(next: IAiSettings): Promise<void> {
  const client = getSupabaseClient();
  const { data: auth } = await client.auth.getUser();
  const row = settingsToRow(next, auth.user?.id ?? null);
  const { error } = await client
    .from("ai_settings")
    .update({
      master_enabled: row.master_enabled,
      default_provider_id: row.default_provider_id,
      budget: row.budget,
      providers: row.providers,
      routing: row.routing,
      updated_by: row.updated_by,
      updated_at: new Date().toISOString(),
    })
    .eq("id", 1);
  if (error) throw new Error(`[supabase] ai write failed: ${error.message}`);
}

async function extractFunctionError(error: unknown): Promise<string> {
  const ctx = (error as { context?: Response }).context;
  if (ctx && typeof ctx.json === "function") {
    try {
      const body = (await ctx.json()) as { error?: string };
      if (body?.error) return body.error;
    } catch {
      /* fall through */
    }
  }
  return error instanceof Error ? error.message : "[supabase] ai operation failed";
}

export const supabaseAiProvider: IAiProvider = {
  async getSettings() {
    return rowToSettings(await loadSettingsRow());
  },

  async setMasterEnabled(enabled) {
    const s = rowToSettings(await loadSettingsRow());
    await writeSettings({ ...s, masterEnabled: enabled });
  },

  async setDefaultProvider(providerId) {
    const s = rowToSettings(await loadSettingsRow());
    await writeSettings({ ...s, defaultProviderId: providerId });
  },

  async updateBudget(patch) {
    const s = rowToSettings(await loadSettingsRow());
    const budget = { ...s.budget, ...patch };
    await writeSettings({ ...s, budget });
    return budget;
  },

  async updateProviderConfig(providerId, patch) {
    const s = rowToSettings(await loadSettingsRow());
    const providers = s.providers.map((p) => (p.provider === providerId ? { ...p, ...patch } : p));
    const updated = providers.find((p) => p.provider === providerId);
    if (!updated) throw new Error(`provider ${providerId} não encontrado`);
    await writeSettings({ ...s, providers });
    return updated;
  },

  async updateFeatureRouting(feature, patch) {
    const s = rowToSettings(await loadSettingsRow());
    const routing = s.routing.map((r) => (r.feature === feature ? { ...r, ...patch } : r));
    const updated = routing.find((r) => r.feature === feature);
    if (!updated) throw new Error(`routing ${feature} não encontrado`);
    await writeSettings({ ...s, routing });
    return updated;
  },

  async testConnection(providerId): Promise<IAiTestConnectionResult> {
    const settings = rowToSettings(await loadSettingsRow());
    const cfg = settings.providers.find((p) => p.provider === providerId);
    const { data, error } = await getSupabaseClient().functions.invoke("ai-generate", {
      body: { mode: "test", providerId, model: cfg?.defaultModel },
    });
    if (error) {
      return { ok: false, latencyMs: 0, message: await extractFunctionError(error) };
    }
    return data as IAiTestConnectionResult;
  },

  async getUsageSummary(period: AiUsagePeriod): Promise<IAiUsageSummary> {
    const settings = rowToSettings(await loadSettingsRow());
    const events = await supabaseAiProvider.listUsageEvents();
    const now = new Date();
    const summary = summarizeUsage(events, period, settings.budget, now);
    if (period === "current_month") {
      summary.projectionBRL = projectMonthlySpend(summary.costBRL, now);
    }
    return summary;
  },

  async listUsageEvents() {
    const { data, error } = await getSupabaseClient()
      .from("ai_usage_events")
      .select(
        "id, ts, source, feature, provider_id, model, input_tokens, output_tokens, cost_brl, latency_ms, status",
      )
      .order("ts", { ascending: false })
      .limit(5000);
    if (error) throw new Error(`[supabase] ai.listUsageEvents failed: ${error.message}`);
    return (data as AiUsageEventRow[]).map(rowToUsageEvent);
  },

  async runPlayground(input: IAiPlaygroundInput): Promise<IAiPlaygroundResult> {
    const { data, error } = await getSupabaseClient().functions.invoke("ai-generate", {
      body: { mode: "generate", ...input },
    });
    if (error) throw new Error(await extractFunctionError(error));
    return data as IAiPlaygroundResult;
  },
};
