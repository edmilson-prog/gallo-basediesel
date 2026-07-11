import { beforeEach, describe, expect, it } from "vitest";
import { __resetMockWahaServers, mockWahaServersProvider } from "./wahaServers";

describe("mockWahaServersProvider", () => {
  beforeEach(() => {
    __resetMockWahaServers();
  });

  it("lists the seeded server", async () => {
    const servers = await mockWahaServersProvider.list();
    expect(servers).toHaveLength(1);
    expect(servers[0].name).toBe("Servidor WAHA (demonstração)");
  });

  it("creates a new server", async () => {
    const created = await mockWahaServersProvider.create({
      name: "Servidor real",
      baseUrl: "https://waha.ailainteligente.com.br",
      apiKeyRef: "WAHA_PROD_API_KEY",
    });
    expect(created.id).toBeTruthy();
    const servers = await mockWahaServersProvider.list();
    expect(servers).toHaveLength(2);
  });

  it("updates name and baseUrl", async () => {
    const updated = await mockWahaServersProvider.update("00000000-0000-0000-0000-000000wahad", {
      name: "Renomeado",
    });
    expect(updated.name).toBe("Renomeado");
    expect(updated.updatedAt).toBeTruthy();
  });

  it("sets and clears the webhook HMAC ref", async () => {
    const withHmac = await mockWahaServersProvider.setWebhookHmacRef(
      "00000000-0000-0000-0000-000000wahad",
      "WAHA_SERVER_DEMO_HMAC_2",
    );
    expect(withHmac.webhookHmacRef).toBe("WAHA_SERVER_DEMO_HMAC_2");
    const cleared = await mockWahaServersProvider.setWebhookHmacRef(
      "00000000-0000-0000-0000-000000wahad",
      null,
    );
    expect(cleared.webhookHmacRef).toBeUndefined();
  });

  it("removes a server", async () => {
    await mockWahaServersProvider.remove("00000000-0000-0000-0000-000000wahad");
    const servers = await mockWahaServersProvider.list();
    expect(servers).toHaveLength(0);
  });
});
