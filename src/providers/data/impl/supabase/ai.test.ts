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
});
