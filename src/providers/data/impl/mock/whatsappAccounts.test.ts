import { describe, it, expect } from "vitest";
import { mockWhatsAppAccountsProvider } from "./whatsappAccounts";
import { resetMockStorePerFile } from "@/mocks/test-setup";

resetMockStorePerFile();

describe("mockWhatsAppAccountsProvider.create", () => {
  it("persists a new instance and returns it with id/createdAt", async () => {
    const created = await mockWhatsAppAccountsProvider.create({
      storeId: "00000000-0000-0000-0000-000000000001",
      label: "Comercial Volvo",
      phoneNumber: "",
      provider: "evolution",
      credentialsRef: "evo-comercial-volvo",
      status: "pending",
      capabilities: {
        supportsTemplatesHsm: false,
        supportsInteractiveButtons: false,
        supportsLists: false,
        supportsReactions: true,
        supportsProactiveMessaging: true,
        supportsReadStatusInGroups: true,
      },
      providerConfig: { baseUrl: "https://evo.example", instanceName: "comercial-volvo-a3f" },
      currentState: "healthy",
      failoverPolicy: "disabled",
      isFailoverActive: false,
      purpose: "atendimento",
    });
    expect(created.id).toMatch(/^wa-/);
    expect(created.createdAt).toBeTruthy();
    const list = await mockWhatsAppAccountsProvider.list();
    expect(list.some((a) => a.id === created.id)).toBe(true);
  });

  it("preserves goServerId on create (evolution-go path)", async () => {
    const created = await mockWhatsAppAccountsProvider.create({
      storeId: "00000000-0000-0000-0000-000000000001",
      label: "Go Test",
      phoneNumber: "",
      provider: "evolution-go",
      credentialsRef: "evo-go-test",
      status: "pending",
      capabilities: {
        supportsTemplatesHsm: false,
        supportsInteractiveButtons: false,
        supportsLists: false,
        supportsReactions: true,
        supportsProactiveMessaging: true,
        supportsReadStatusInGroups: true,
      },
      currentState: "healthy",
      failoverPolicy: "disabled",
      isFailoverActive: false,
      purpose: "atendimento",
      goServerId: "srv-abc123",
    });
    expect(created.goServerId).toBe("srv-abc123");
  });

  it("replaceAccessRules round-trips", async () => {
    const rules = await mockWhatsAppAccountsProvider.replaceAccessRules("wa-evo-campanhas", [
      { kind: "role", targetValue: "seller_internal" },
    ]);
    expect(rules).toHaveLength(1);
    const read = await mockWhatsAppAccountsProvider.getAccessRules("wa-evo-campanhas");
    expect(read[0]?.targetValue).toBe("seller_internal");
  });
});
