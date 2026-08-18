import { describe, it, expect } from "vitest";
import { leadsApi } from "./leads";
import { getMockState } from "../store/mockStore";
import { upsert } from "../store/mutations";
import { resetMockStorePerFile } from "@/mocks/test-setup";
import type { IConversation, ILead } from "@/shared/types";

resetMockStorePerFile();

describe("leadsApi.list — excludeLost", () => {
  it("excludes leads with a lossReason set when excludeLost is true", async () => {
    const seed = getMockState().leads[0];
    if (!seed) throw new Error("mock seed has no leads to test against");

    const activeLead: ILead = {
      ...seed,
      id: "lead-test-excludeLost-active",
      lossReason: undefined,
      convertedToCustomerId: undefined,
    };
    const lostLead: ILead = {
      ...seed,
      id: "lead-test-excludeLost-lost",
      lossReason: "Sem interesse",
    };
    upsert("leads", activeLead);
    upsert("leads", lostLead);

    const withLost = await leadsApi.list({ storeId: seed.storeId, pageSize: 1000 });
    expect(withLost.data.some((l) => l.id === activeLead.id)).toBe(true);
    expect(withLost.data.some((l) => l.id === lostLead.id)).toBe(true);

    const excludingLost = await leadsApi.list({
      storeId: seed.storeId,
      pageSize: 1000,
      excludeLost: true,
    });
    expect(excludingLost.data.some((l) => l.id === activeLead.id)).toBe(true);
    expect(excludingLost.data.some((l) => l.id === lostLead.id)).toBe(false);
  });
});

describe("leadsApi.update — lead conversion re-anchors conversations", () => {
  it("re-anchors the lead's conversations to the customer, archiving conflicting open ones", async () => {
    const state = getMockState();
    const leadSeed = state.leads[0];
    const convSeed = state.conversations[0];
    if (!leadSeed || !convSeed) throw new Error("mock seed missing leads/conversations");

    const lead: ILead = {
      ...leadSeed,
      id: "lead-test-reanchor",
      convertedToCustomerId: undefined,
    };
    upsert("leads", lead);

    const accountA = "wa-test-reanchor-a";
    const accountB = "wa-test-reanchor-b";
    const customerId = "customer-test-reanchor";
    const base: IConversation = {
      ...convSeed,
      customerId: undefined,
      leadId: lead.id,
      assignedSellerId: undefined,
      isSdrActive: false,
    };
    // Open lead conversation on account A (no conflict — must stay open).
    upsert("conversations", {
      ...base,
      id: "conv-reanchor-open",
      whatsappAccountId: accountA,
      status: "aguardando",
      lastMessageAt: "2026-07-23T10:00:00.000Z",
    });
    // Closed lead conversation (history — must re-anchor keeping its status).
    upsert("conversations", {
      ...base,
      id: "conv-reanchor-closed",
      whatsappAccountId: accountA,
      status: "resolvida",
      lastMessageAt: "2026-07-20T10:00:00.000Z",
    });
    // Open lead conversation on account B where the destination customer
    // ALREADY has an open thread — must archive (unique-guard semantics).
    upsert("conversations", {
      ...base,
      id: "conv-reanchor-conflict",
      whatsappAccountId: accountB,
      status: "em_andamento",
      lastMessageAt: "2026-07-23T11:00:00.000Z",
    });
    upsert("conversations", {
      ...base,
      id: "conv-customer-open",
      customerId,
      leadId: undefined,
      whatsappAccountId: accountB,
      status: "aguardando",
      lastMessageAt: "2026-07-23T09:00:00.000Z",
    });

    await leadsApi.update(lead.id, { convertedToCustomerId: customerId });

    const byId = (id: string) => {
      const conv = getMockState().conversations.find((c) => c.id === id);
      if (!conv) throw new Error(`conversation ${id} missing from store`);
      return conv;
    };
    expect(byId("conv-reanchor-open")).toMatchObject({
      customerId,
      leadId: undefined,
      status: "aguardando",
    });
    expect(byId("conv-reanchor-closed")).toMatchObject({
      customerId,
      leadId: undefined,
      status: "resolvida",
    });
    expect(byId("conv-reanchor-conflict")).toMatchObject({
      customerId,
      leadId: undefined,
      status: "arquivada",
      assignedSellerId: undefined,
    });
    // The customer's own pre-existing thread is untouched.
    expect(byId("conv-customer-open").status).toBe("aguardando");
  });

  it("keeps only the newest open conversation per account among the lead's own", async () => {
    const state = getMockState();
    const leadSeed = state.leads[0];
    const convSeed = state.conversations[0];
    if (!leadSeed || !convSeed) throw new Error("mock seed missing leads/conversations");

    const lead: ILead = {
      ...leadSeed,
      id: "lead-test-reanchor-race",
      convertedToCustomerId: undefined,
    };
    upsert("leads", lead);

    const account = "wa-test-reanchor-race";
    const customerId = "customer-test-reanchor-race";
    const base: IConversation = {
      ...convSeed,
      customerId: undefined,
      leadId: lead.id,
      assignedSellerId: undefined,
      isSdrActive: false,
      whatsappAccountId: account,
    };
    upsert("conversations", {
      ...base,
      id: "conv-race-old",
      status: "aguardando",
      lastMessageAt: "2026-07-01T10:00:00.000Z",
    });
    upsert("conversations", {
      ...base,
      id: "conv-race-new",
      status: "aguardando",
      lastMessageAt: "2026-07-23T10:00:00.000Z",
    });

    await leadsApi.update(lead.id, { convertedToCustomerId: customerId });

    const convs = getMockState().conversations;
    expect(convs.find((c) => c.id === "conv-race-new")).toMatchObject({
      customerId,
      status: "aguardando",
    });
    expect(convs.find((c) => c.id === "conv-race-old")).toMatchObject({
      customerId,
      status: "arquivada",
    });
  });
});
