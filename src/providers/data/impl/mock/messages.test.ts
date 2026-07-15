import { describe, it, expect } from "vitest";
import { mockMessagesProvider } from "./messages";
import { resetMockStorePerFile } from "@/mocks/test-setup";

resetMockStorePerFile();

describe("mockMessagesProvider.resolveMediaUrls", () => {
  it("passes through absolute refs and nulls non-navigable ones", async () => {
    const abs = "https://picsum.photos/seed/x/10/10";
    const map = await mockMessagesProvider.resolveMediaUrls([abs, "conversations/c/m/x.bin", ""]);
    expect(map[abs]).toBe(abs);
    expect(map["conversations/c/m/x.bin"]).toBeNull();
    expect(map[""]).toBeNull();
  });
});

describe("mockMessagesProvider.retryTranscription", () => {
  it("resolves without throwing (mock audio never reaches a failed transcription state)", async () => {
    await expect(mockMessagesProvider.retryTranscription("m1")).resolves.toBeUndefined();
  });
});
