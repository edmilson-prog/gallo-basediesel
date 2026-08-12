import { describe, expect, it } from "vitest";
import { buildDefaultAiSettings } from "@/providers/data/engine/aiCatalog";
import { rowToSettings, settingsToRow } from "./ai";

describe("supabase ai mappers", () => {
  it("settingsToRow → rowToSettings é round-trip", () => {
    const s = buildDefaultAiSettings("supabase");
    const row = settingsToRow(s, "user-123");
    expect(row.id).toBe(1);
    expect(row.master_enabled).toBe(false);
    expect(row.default_provider_id).toBe("anthropic");
    const back = rowToSettings({
      id: 1,
      master_enabled: row.master_enabled,
      default_provider_id: row.default_provider_id,
      budget: row.budget,
      providers: row.providers,
      routing: row.routing,
      updated_at: "2026-06-17T00:00:00.000Z",
      updated_by: "user-123",
    });
    expect(back).toEqual(s);
  });

  it("settingsToRow/rowToSettings preserva modelsRefreshedAt nos providers", () => {
    const base = rowToSettings({
      id: 1,
      master_enabled: false,
      default_provider_id: "openai",
      budget: { monthlyCapBRL: 1000, alertThresholdPct: 80, usdToBrl: 5.4 },
      providers: [
        {
          provider: "openai",
          enabled: true,
          defaultModel: "gpt-5.2",
          models: [{ id: "gpt-5.2", label: "GPT-5.2", inputPricePer1kUsd: 0.01, outputPricePer1kUsd: 0.03 }],
          credentialsRef: "OPENAI_API_KEY",
          status: "configured",
          modelsRefreshedAt: "2026-06-17T10:00:00.000Z",
        },
      ],
      routing: [],
      updated_at: "2026-06-17T10:00:00.000Z",
      updated_by: null,
    });
    const row = settingsToRow(base, null);
    expect(row.providers[0]!.modelsRefreshedAt).toBe("2026-06-17T10:00:00.000Z");
  });
});
