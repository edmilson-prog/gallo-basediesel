import { describe, expect, it } from "vitest";
import { buildDisconnectBannerCopy } from "./useWhatsAppConnectionStatus";

describe("buildDisconnectBannerCopy", () => {
  it("names the account when a single one is down", () => {
    expect(buildDisconnectBannerCopy(["GALLO Campanhas"])).toEqual({
      headline: 'WhatsApp "GALLO Campanhas" desconectado.',
      cta: "Reconectar",
    });
  });

  it("aggregates with a count when 2+ are down", () => {
    expect(buildDisconnectBannerCopy(["A", "B"])).toEqual({
      headline: "2 números de WhatsApp desconectados.",
      cta: "Ver e reconectar",
    });
  });
});
