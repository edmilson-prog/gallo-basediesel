import { describe, it, expect } from "vitest";
import { mockMessagesProvider } from "./messages";

describe("mockMessagesProvider.resolveMediaUrls", () => {
  it("passes through absolute refs and nulls non-navigable ones", async () => {
    const abs = "https://picsum.photos/seed/x/10/10";
    const map = await mockMessagesProvider.resolveMediaUrls([abs, "conversations/c/m/x.bin", ""]);
    expect(map[abs]).toBe(abs);
    expect(map["conversations/c/m/x.bin"]).toBeNull();
    expect(map[""]).toBeNull();
  });
});
