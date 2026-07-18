import { describe, expect, it } from "vitest";
import { computeWahaHmac, verifyWahaHmac } from "./hmac";

describe("computeWahaHmac / verifyWahaHmac", () => {
  it("computes a stable lowercase hex HMAC-SHA512 digest", async () => {
    const digest = await computeWahaHmac('{"event":"message"}', "secret123");
    expect(digest).toMatch(/^[0-9a-f]{128}$/);
    // Same input → same digest (deterministic).
    expect(await computeWahaHmac('{"event":"message"}', "secret123")).toBe(digest);
  });

  it("verifies a matching signature", async () => {
    const body = '{"event":"session.status"}';
    const digest = await computeWahaHmac(body, "topsecret");
    expect(await verifyWahaHmac(body, "topsecret", digest)).toBe(true);
  });

  it("rejects a wrong signature", async () => {
    const body = '{"event":"message"}';
    await computeWahaHmac(body, "topsecret");
    expect(await verifyWahaHmac(body, "topsecret", "0".repeat(128))).toBe(false);
  });

  it("rejects a missing header value", async () => {
    expect(await verifyWahaHmac("{}", "topsecret", null)).toBe(false);
  });

  it("never throws on a malformed header value", async () => {
    await expect(verifyWahaHmac("{}", "topsecret", "not-hex")).resolves.toBe(false);
  });
});
