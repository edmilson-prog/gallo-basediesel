import { describe, expect, it } from "vitest";
import { DEFAULT_INBOUND_TOAST_SETTINGS } from "@/shared/types";
import { resolveInboundToastSettings } from "./resolveInboundToastSettings";

describe("resolveInboundToastSettings", () => {
  it("falls back to the defaults when the store has no block", () => {
    expect(resolveInboundToastSettings(undefined)).toEqual(DEFAULT_INBOUND_TOAST_SETTINGS);
  });

  it("keeps a valid configuration untouched", () => {
    const cfg = { enabled: false, showPreview: false, durationSeconds: 12 };
    expect(resolveInboundToastSettings(cfg)).toEqual(cfg);
  });

  it("clamps a duration below the minimum", () => {
    expect(resolveInboundToastSettings({ ...DEFAULT_INBOUND_TOAST_SETTINGS, durationSeconds: 1 }))
      .toHaveProperty("durationSeconds", 3);
  });

  it("clamps a duration above the maximum", () => {
    expect(resolveInboundToastSettings({ ...DEFAULT_INBOUND_TOAST_SETTINGS, durationSeconds: 600 }))
      .toHaveProperty("durationSeconds", 30);
  });

  it("falls back to the default duration when it is not a number", () => {
    const corrupt = { enabled: true, showPreview: true, durationSeconds: Number.NaN };
    expect(resolveInboundToastSettings(corrupt)).toHaveProperty("durationSeconds", 8);
  });

  it("coerces missing booleans to the defaults, not to false", () => {
    // A legacy blob written before these fields existed must not silently
    // disable the alert for the whole store.
    const partial = { durationSeconds: 10 } as never;
    expect(resolveInboundToastSettings(partial)).toEqual({
      enabled: true,
      showPreview: true,
      durationSeconds: 10,
    });
  });

  it("respects an explicit false", () => {
    const cfg = { enabled: false, showPreview: true, durationSeconds: 8 };
    expect(resolveInboundToastSettings(cfg)).toHaveProperty("enabled", false);
  });
});
