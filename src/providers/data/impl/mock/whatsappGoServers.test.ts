import { describe, it, expect, beforeEach } from "vitest";
import { mockWhatsAppGoServersProvider, __resetMockGoServers } from "./whatsappGoServers";

describe("mockWhatsAppGoServersProvider", () => {
  beforeEach(() => __resetMockGoServers());

  it("seeds one demo server", async () => {
    const list = await mockWhatsAppGoServersProvider.list();
    expect(list).toHaveLength(1);
    expect(list[0].name).toBeTruthy();
    expect(list[0].apiKeyRef).toMatch(/^[A-Z][A-Z0-9_]{2,64}$/);
  });

  it("creates, updates and removes", async () => {
    const created = await mockWhatsAppGoServersProvider.create({
      name: "Segundo",
      baseUrl: "https://go2.test",
      apiKeyRef: "WA_GO_SERVER_SEGUNDO_AB",
    });
    expect(created.id).toBeTruthy();
    expect(await mockWhatsAppGoServersProvider.list()).toHaveLength(2);

    const updated = await mockWhatsAppGoServersProvider.update(created.id, {
      baseUrl: "https://go2b.test",
    });
    expect(updated.baseUrl).toBe("https://go2b.test");

    await mockWhatsAppGoServersProvider.remove(created.id);
    expect(await mockWhatsAppGoServersProvider.list()).toHaveLength(1);
  });

  it("throws when updating a missing server", async () => {
    await expect(mockWhatsAppGoServersProvider.update("nope", { name: "x" })).rejects.toThrow(
      /not found/i,
    );
  });
});
