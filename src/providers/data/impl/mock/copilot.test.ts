import { describe, expect, it } from "vitest";
import { mockCopilotProvider } from "./copilot";
import { conversationsApi } from "@/mocks";
import { resetMockStorePerFile } from "@/mocks/test-setup";

resetMockStorePerFile();

// SEED_STORE_ID = "00000000-0000-0000-0000-000000000001" (mirrors seedStore.ts).
// We call conversationsApi directly (bypassing scopedListParams) because tests
// run without a React context — there is no active store session.
const SEED_STORE_ID = "00000000-0000-0000-0000-000000000001";

describe("mockCopilotProvider — geração de resposta", () => {
  it("isReplyGenerationEnabled é true no mock", async () => {
    expect(await mockCopilotProvider.isReplyGenerationEnabled()).toBe(true);
  });

  it("gera um rascunho não-vazio e determinístico", async () => {
    const conv = (await conversationsApi.list({ pageSize: 100, storeId: SEED_STORE_ID })).data.find(
      (c) => c.customerId,
    );
    expect(conv).toBeTruthy();
    const a = await mockCopilotProvider.generateReply(conv!.id);
    const b = await mockCopilotProvider.generateReply(conv!.id);
    expect(a.length).toBeGreaterThan(0);
    expect(a).toBe(b);
  });
});

describe("getPanelData — conversa de lead", () => {
  it("monta briefing de lead quando não há cliente", async () => {
    const conversation = (
      await conversationsApi.list({ pageSize: 500, storeId: SEED_STORE_ID })
    ).data.find((c) => !c.customerId && c.leadId);
    expect(conversation, "seed precisa ter ao menos uma conversa só de lead").toBeDefined();

    const panel = await mockCopilotProvider.getPanelData(conversation!.id);

    expect(panel.briefing).toBeDefined();
    expect(panel.briefing?.kind).toBe("lead");
    expect(panel.briefing?.leadStage).toBeTruthy();
    expect(panel.briefing?.lifecycleStatus).toBeUndefined();
  });

  it("mantém briefing de cliente quando há cliente", async () => {
    const conversation = (
      await conversationsApi.list({ pageSize: 500, storeId: SEED_STORE_ID })
    ).data.find((c) => c.customerId);
    expect(conversation).toBeDefined();

    const panel = await mockCopilotProvider.getPanelData(conversation!.id);

    expect(panel.briefing?.kind).toBe("customer");
    expect(panel.briefing?.lifecycleStatus).toBeDefined();
  });
});
