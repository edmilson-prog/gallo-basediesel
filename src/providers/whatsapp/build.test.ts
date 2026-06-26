import { describe, expect, it } from "vitest";
import { buildWhatsAppEngine } from "./build";
import { getEngineCapabilities } from "./factory";

const deps = { resolveSecret: async () => undefined };

describe("buildWhatsAppEngine evolution-go", () => {
  it("builds an EvolutionGoProvider from provider_config baseUrl+instanceId", () => {
    const engine = buildWhatsAppEngine({
      engine: "evolution-go",
      accountId: "acc-go-1",
      providerConfig: { baseUrl: "https://go.test", instanceId: "inst-uuid-9" },
      credentialsRef: "WA_GO_TEST",
      deps,
    });
    expect(engine.providerName).toBe("evolution-go");
  });

  it("throws VALIDATION_ERROR when instanceId is missing", () => {
    expect(() =>
      buildWhatsAppEngine({
        engine: "evolution-go",
        accountId: "a",
        providerConfig: { baseUrl: "https://go.test" },
        credentialsRef: "WA_GO_TEST",
        deps,
      }),
    ).toThrowError(/instanceId/);
  });

  it("getEngineCapabilities('evolution-go') has no templates", () => {
    expect(getEngineCapabilities("evolution-go").supportsTemplates).toBe(false);
  });
});
