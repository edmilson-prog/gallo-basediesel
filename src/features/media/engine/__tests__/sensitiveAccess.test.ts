import { describe, expect, it } from "vitest";
import type { IMediaAsset, IMediaClassification } from "@/shared/types";
import { canViewSensitive, isSensitiveClassification, statusChipPriority } from "../sensitiveAccess";

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

describe("isSensitiveClassification (RF-021)", () => {
  it("flags nota_fiscal and comprovante as sensitive", () => {
    expect(isSensitiveClassification("nota_fiscal")).toBe(true);
    expect(isSensitiveClassification("comprovante")).toBe(true);
  });
  it("does not flag non-sensitive classes", () => {
    expect(isSensitiveClassification("peca")).toBe(false);
    expect(isSensitiveClassification("chassi_placa")).toBe(false);
    expect(isSensitiveClassification("catalogo")).toBe(false);
    expect(isSensitiveClassification("outro")).toBe(false);
    expect(isSensitiveClassification(undefined)).toBe(false);
  });
});

/**
 * Mirrors the exact derivation used by useMediaActions.setClassification: a
 * sensitive class forces "sensitive"; otherwise the asset's current sensitivity
 * is preserved (NEVER a silent downgrade of a manually-sensitised asset).
 */
function deriveReclassifiedSensitivity(
  currentSensitivity: IMediaAsset["sensitivity"],
  next: IMediaClassification,
): IMediaAsset["sensitivity"] {
  return isSensitiveClassification(next) ? "sensitive" : currentSensitivity;
}

describe("reclassification sensitivity derivation (RF-021, no downgrade)", () => {
  it("flips a normal asset to sensitive when reclassified to comprovante", () => {
    expect(deriveReclassifiedSensitivity("normal", "comprovante")).toBe("sensitive");
  });
  it("flips a normal asset to sensitive when reclassified to nota_fiscal", () => {
    expect(deriveReclassifiedSensitivity("normal", "nota_fiscal")).toBe("sensitive");
  });
  it("keeps a manually-sensitised asset sensitive when reclassified to a non-sensitive class", () => {
    expect(deriveReclassifiedSensitivity("sensitive", "peca")).toBe("sensitive");
  });
  it("leaves a normal asset normal when reclassified to a non-sensitive class", () => {
    expect(deriveReclassifiedSensitivity("normal", "peca")).toBe("normal");
  });
});

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
