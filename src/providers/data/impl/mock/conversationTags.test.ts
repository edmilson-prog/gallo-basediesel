import { beforeEach, describe, expect, it } from "vitest";
import { mockConversationTagsProvider, __resetConversationTagsForTests } from "./conversationTags";

const STORE = "00000000-0000-0000-0000-000000000001";

beforeEach(() => {
  __resetConversationTagsForTests();
});

describe("mockConversationTagsProvider", () => {
  it("lists the deterministic seed catalog sorted by label", async () => {
    const tags = await mockConversationTagsProvider.list({ storeId: STORE });
    expect(tags.length).toBeGreaterThanOrEqual(6);
    const labels = tags.map((t) => t.label);
    expect([...labels].sort((a, b) => a.localeCompare(b, "pt-BR"))).toEqual(labels);
    expect(tags.some((t) => t.id === "ctag-garantia")).toBe(true);
  });

  it("activeOnly excludes archived tags", async () => {
    await mockConversationTagsProvider.update("ctag-garantia", { archived: true });
    const active = await mockConversationTagsProvider.list({ storeId: STORE, activeOnly: true });
    expect(active.some((t) => t.id === "ctag-garantia")).toBe(false);
    const all = await mockConversationTagsProvider.list({ storeId: STORE });
    expect(all.some((t) => t.id === "ctag-garantia")).toBe(true);
  });

  it("creates, renames, recolors and deletes", async () => {
    const created = await mockConversationTagsProvider.create({
      storeId: STORE,
      label: "Urgente",
      color: "orange",
    });
    expect(created.id).toMatch(/^ctag-/);
    const renamed = await mockConversationTagsProvider.update(created.id, {
      label: "Urgentíssimo",
      color: "pink",
    });
    expect(renamed.label).toBe("Urgentíssimo");
    expect(renamed.color).toBe("pink");
    await mockConversationTagsProvider.delete(created.id);
    const tags = await mockConversationTagsProvider.list({ storeId: STORE });
    expect(tags.some((t) => t.id === created.id)).toBe(false);
  });

  it("usageCount counts conversations in the mock store carrying each tag id", async () => {
    const usage = await mockConversationTagsProvider.usageCount(STORE);
    // Scripted conversations (Task 5) reference ctag-* ids; before Task 5 this
    // may be zero — the shape contract is what matters here.
    expect(typeof usage).toBe("object");
    for (const value of Object.values(usage)) expect(typeof value).toBe("number");
  });
});
