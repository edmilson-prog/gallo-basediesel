import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { getDintecProvider, invalidateDintecProviderCache } from "./factory";
import { MockDintecProvider } from "./mock/MockDintecProvider";

// A developer's .env.local may point VITE_DATA_SOURCE at supabase, so the
// suite pins the provider via the explicit RF-011 gate — the factory must
// then resolve the mock provider for any storeId without touching anything
// external.

describe("getDintecProvider (mock provider)", () => {
  beforeEach(() => {
    vi.stubEnv("VITE_DINTEC_PROVIDER", "mock");
    invalidateDintecProviderCache();
  });

  afterAll(() => {
    vi.unstubAllEnvs();
  });

  it("returns the mock provider for any storeId under the mock gate (RF-011)", async () => {
    const provider = await getDintecProvider("any-store-id");
    expect(provider).toBeInstanceOf(MockDintecProvider);
    expect(provider.providerName).toBe("mock");
  });

  it("caches the instance per storeId (RF-013)", async () => {
    const first = await getDintecProvider("store-a");
    const second = await getDintecProvider("store-a");
    expect(second).toBe(first);
  });

  it("keeps separate instances per storeId (no global singleton)", async () => {
    const a = await getDintecProvider("store-a");
    const b = await getDintecProvider("store-b");
    expect(b).not.toBe(a);
  });

  it("invalidateDintecProviderCache(storeId) drops only that entry", async () => {
    const a = await getDintecProvider("store-a");
    const b = await getDintecProvider("store-b");
    invalidateDintecProviderCache("store-a");
    expect(await getDintecProvider("store-a")).not.toBe(a);
    expect(await getDintecProvider("store-b")).toBe(b);
  });

  it("invalidateDintecProviderCache() clears everything", async () => {
    const a = await getDintecProvider("store-a");
    invalidateDintecProviderCache();
    expect(await getDintecProvider("store-a")).not.toBe(a);
  });

  it("declares the standard MVP capability matrix", async () => {
    const provider = await getDintecProvider("store-a");
    expect(provider.capabilities).toEqual({
      supportsIncremental: false,
      supportsOrderImport: true,
      encodingDetection: true,
      maxBatchSizeMB: 50,
    });
  });
});
