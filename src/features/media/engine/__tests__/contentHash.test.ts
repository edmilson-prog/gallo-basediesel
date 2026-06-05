import { describe, expect, it } from "vitest";
import { contentHash } from "../contentHash";

describe("contentHash", () => {
  it("is deterministic for the same input", () => {
    expect(contentHash("nota-123|45678")).toBe(contentHash("nota-123|45678"));
  });
  it("differs for different inputs", () => {
    expect(contentHash("a")).not.toBe(contentHash("b"));
  });
  it("returns a stable, non-empty hex-ish string", () => {
    const h = contentHash("msg-00042|image/jpeg|81234");
    expect(h).toMatch(/^h[0-9a-z]+$/);
    expect(h.length).toBeGreaterThan(4);
  });
});
