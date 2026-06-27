import { describe, expect, it } from "vitest";
import type { IWhatsAppAccount } from "@/shared/types";
import { isEvolutionAccountConfigured, isEvolutionFamily } from "./whatsappProvider";

type AccountConfig = Pick<IWhatsAppAccount, "provider" | "providerConfig">;

describe("isEvolutionFamily", () => {
  it("is true for evolution", () => {
    expect(isEvolutionFamily("evolution")).toBe(true);
  });
  it("is true for evolution-go", () => {
    expect(isEvolutionFamily("evolution-go")).toBe(true);
  });
  it("is false for meta", () => {
    expect(isEvolutionFamily("meta")).toBe(false);
  });
});

describe("isEvolutionAccountConfigured", () => {
  it("classic Evolution: ready only with a baseUrl", () => {
    expect(
      isEvolutionAccountConfigured({
        provider: "evolution",
        providerConfig: { baseUrl: "https://evo.host", instanceName: "comercial" },
      } as AccountConfig),
    ).toBe(true);
    expect(
      isEvolutionAccountConfigured({
        provider: "evolution",
        providerConfig: { instanceName: "comercial" },
      } as AccountConfig),
    ).toBe(false);
  });

  it("Evolution Go: ready with instanceId even though baseUrl lives in the registry (not here)", () => {
    expect(
      isEvolutionAccountConfigured({
        provider: "evolution-go",
        providerConfig: { instanceId: "ef16857e-901f-4da6-bcef-4b9096f50693" },
      } as AccountConfig),
    ).toBe(true);
    // Unpaired Go account: no instanceId yet → not pollable.
    expect(
      isEvolutionAccountConfigured({
        provider: "evolution-go",
        providerConfig: {},
      } as AccountConfig),
    ).toBe(false);
    expect(
      isEvolutionAccountConfigured({
        provider: "evolution-go",
        providerConfig: undefined,
      } as AccountConfig),
    ).toBe(false);
  });

  it("non-Evolution providers are never configured here", () => {
    expect(
      isEvolutionAccountConfigured({
        provider: "meta",
        providerConfig: { phoneNumberId: "123" },
      } as AccountConfig),
    ).toBe(false);
  });
});
