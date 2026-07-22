import { describe, expect, it } from "vitest";
import { DEFAULT_COPILOT_ASSISTANT_SETTINGS } from "../config/defaults";
import { shouldMountCopilot, type ICopilotMountConversation } from "./shouldMountCopilot";

const CUSTOMER_CONV: ICopilotMountConversation = {
  customerId: "cus-1",
  leadId: null,
  whatsappAccountId: "acc-1",
};
const LEAD_CONV: ICopilotMountConversation = {
  customerId: null,
  leadId: "lead-1",
  whatsappAccountId: "acc-1",
};

describe("shouldMountCopilot", () => {
  it("monta na conversa de cliente com os defaults", () => {
    expect(
      shouldMountCopilot({
        settings: DEFAULT_COPILOT_ASSISTANT_SETTINGS,
        conversation: CUSTOMER_CONV,
        role: "Vendedor",
      }),
    ).toBe(true);
  });

  it("monta na conversa de lead com os defaults — corrige o gap dos 85%", () => {
    expect(
      shouldMountCopilot({
        settings: DEFAULT_COPILOT_ASSISTANT_SETTINGS,
        conversation: LEAD_CONV,
        role: "Vendedor",
      }),
    ).toBe(true);
  });

  it("não monta quando o assistente está desligado", () => {
    expect(
      shouldMountCopilot({
        settings: { ...DEFAULT_COPILOT_ASSISTANT_SETTINGS, enabled: false },
        conversation: CUSTOMER_CONV,
        role: "Vendedor",
      }),
    ).toBe(false);
  });

  it("respeita reach='customer_only'", () => {
    const settings = { ...DEFAULT_COPILOT_ASSISTANT_SETTINGS, reach: "customer_only" as const };
    expect(shouldMountCopilot({ settings, conversation: CUSTOMER_CONV, role: "Vendedor" })).toBe(
      true,
    );
    expect(shouldMountCopilot({ settings, conversation: LEAD_CONV, role: "Vendedor" })).toBe(false);
  });

  it("respeita reach='lead_only'", () => {
    const settings = { ...DEFAULT_COPILOT_ASSISTANT_SETTINGS, reach: "lead_only" as const };
    expect(shouldMountCopilot({ settings, conversation: CUSTOMER_CONV, role: "Vendedor" })).toBe(
      false,
    );
    expect(shouldMountCopilot({ settings, conversation: LEAD_CONV, role: "Vendedor" })).toBe(true);
  });

  it("accountIds vazio significa todas as contas", () => {
    expect(
      shouldMountCopilot({
        settings: { ...DEFAULT_COPILOT_ASSISTANT_SETTINGS, accountIds: [] },
        conversation: CUSTOMER_CONV,
        role: "Vendedor",
      }),
    ).toBe(true);
  });

  it("filtra por conta quando accountIds está preenchido", () => {
    const settings = { ...DEFAULT_COPILOT_ASSISTANT_SETTINGS, accountIds: ["acc-outra"] };
    expect(shouldMountCopilot({ settings, conversation: CUSTOMER_CONV, role: "Vendedor" })).toBe(
      false,
    );
    expect(
      shouldMountCopilot({
        settings: { ...settings, accountIds: ["acc-1"] },
        conversation: CUSTOMER_CONV,
        role: "Vendedor",
      }),
    ).toBe(true);
  });

  it("filtra por papel", () => {
    expect(
      shouldMountCopilot({
        settings: DEFAULT_COPILOT_ASSISTANT_SETTINGS,
        conversation: CUSTOMER_CONV,
        role: "VendedorExterno",
      }),
    ).toBe(false);
  });

  it("não monta em conversa sem cliente e sem lead", () => {
    expect(
      shouldMountCopilot({
        settings: DEFAULT_COPILOT_ASSISTANT_SETTINGS,
        conversation: { customerId: null, leadId: null, whatsappAccountId: "acc-1" },
        role: "Vendedor",
      }),
    ).toBe(false);
  });
});
