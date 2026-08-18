import { describe, it, expect } from "vitest";
import { mockActivityProvider } from "./activity";

describe("mockActivityProvider.getCustomerTimeline", () => {
  it("returns a well-formed payload for an unknown customer", async () => {
    const payload = await mockActivityProvider.getCustomerTimeline("does-not-exist");
    expect(payload.customerId).toBe("does-not-exist");
    expect(payload.conversations).toEqual([]);
    expect(typeof payload.generatedAt).toBe("string");
  });
});
