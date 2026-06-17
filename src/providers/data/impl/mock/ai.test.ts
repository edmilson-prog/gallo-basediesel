import { describe, expect, it } from "vitest";
import { mockAiProvider } from "./ai";
import { modelsFor } from "@/providers/data/engine/aiCatalog";

describe("mockAiProvider.listProviderModels", () => {
  it("devolve o catálogo estático do provedor", async () => {
    const out = await mockAiProvider.listProviderModels("openai");
    expect(out.map((m) => m.id).sort()).toEqual(modelsFor("openai").map((m) => m.id).sort());
  });
});
