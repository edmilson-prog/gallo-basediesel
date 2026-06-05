import { describe, expect, it } from "vitest";
import type { IMediaAsset } from "@/shared/types";
import { canViewSensitive, statusChipPriority } from "../sensitiveAccess";

function asset(over: Partial<IMediaAsset>): IMediaAsset {
  return {
    id: "media-1",
    storeId: "store-matriz",
    kind: "image",
    mimeType: "image/jpeg",
    sizeBytes: 1000,
    authorType: "customer",
    direction: "in",
    createdAt: "2026-06-01T00:00:00.000Z",
    storageRef: "ref-x",
    persisted: true,
    sensitivity: "normal",
    ...over,
  };
}

describe("canViewSensitive", () => {
  it("allows Owner and Gestor", () => {
    expect(canViewSensitive({ role: "Owner" })).toBe(true);
    expect(canViewSensitive({ role: "Gestor" })).toBe(true);
  });
  it("denies Vendedor and SDR", () => {
    expect(canViewSensitive({ role: "Vendedor" })).toBe(false);
    expect(canViewSensitive({ role: "SDR" })).toBe(false);
  });
  it("denies an anonymous user", () => {
    expect(canViewSensitive(null)).toBe(false);
  });
});

describe("statusChipPriority (D-13: failure > sensitive-lock > expiring > none)", () => {
  const NOW = new Date("2026-06-05T12:00:00.000Z");
  it("ranks a failed (non-persisted) asset highest", () => {
    const chip = statusChipPriority(asset({ persisted: false, sensitivity: "sensitive" }), { role: "Vendedor" }, NOW);
    expect(chip).toBe("failure");
  });
  it("ranks sensitive-lock above expiring for a restricted role", () => {
    const chip = statusChipPriority(
      asset({ sensitivity: "sensitive", sourceExpiresAt: "2026-06-06T12:00:00.000Z" }),
      { role: "Vendedor" },
      NOW,
    );
    expect(chip).toBe("sensitive");
  });
  it("does not lock a sensitive asset for an allowed role — falls to expiring", () => {
    const chip = statusChipPriority(
      asset({ sensitivity: "sensitive", sourceExpiresAt: "2026-06-06T12:00:00.000Z" }),
      { role: "Owner" },
      NOW,
    );
    expect(chip).toBe("expiring");
  });
  it("returns 'none' for a healthy, persisted, non-expiring asset", () => {
    expect(statusChipPriority(asset({}), { role: "Owner" }, NOW)).toBe("none");
  });
});
