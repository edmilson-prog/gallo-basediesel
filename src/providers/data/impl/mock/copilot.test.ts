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
