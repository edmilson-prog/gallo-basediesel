import { describe, expect, it } from "vitest";
import { mockAiProvider } from "./ai";
import { modelsFor } from "@/providers/data/engine/aiCatalog";
import { resetMockStorePerFile } from "@/mocks/test-setup";

resetMockStorePerFile();

describe("mockAiProvider.listProviderModels", () => {
  it("devolve o catálogo estático do provedor", async () => {
    const out = await mockAiProvider.listProviderModels("openai");
    expect(out.map((m) => m.id).sort()).toEqual(
      modelsFor("openai")
        .map((m) => m.id)
        .sort(),
    );
  });
});

describe("mockAiProvider — analytics resolver", () => {
  it("isAiFeatureEnabled é false no mock (usa regras)", async () => {
    expect(await mockAiProvider.isAiFeatureEnabled("analytics_copilot")).toBe(false);
  });
  it("resolveAnalyticsQueries é null no mock (fallback p/ regras)", async () => {
    expect(
      await mockAiProvider.resolveAnalyticsQueries("quanto faturei?", {
        catalog: [],
        brands: [],
        categories: [],
      }),
    ).toBeNull();
  });
});
