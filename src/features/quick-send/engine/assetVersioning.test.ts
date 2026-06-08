import { describe, expect, it } from "vitest";
import type { IAssetLibraryItem } from "@/shared/types";
import { pickSendableVersion, bumpVersion } from "./assetVersioning";

function asset(over: Partial<IAssetLibraryItem>): IAssetLibraryItem {
  return {
    id: "a1",
    storeId: "00000000-0000-0000-0000-000000000001",
    division: "parts",
    title: "Catálogo Volvo",
    category: "catalogo",
    kind: "document",
    storageRef: "ref-v1",
    version: 1,
    status: "published",
    sensitivity: "normal",
    createdBy: "seller-1",
    createdAt: "2026-06-01T00:00:00.000Z",
    updatedAt: "2026-06-01T00:00:00.000Z",
    ...over,
  };
}

describe("pickSendableVersion", () => {
  it("returns the item when published", () => {
    const a = asset({ status: "published" });
    expect(pickSendableVersion(a)).toBe(a);
  });
  it("returns null for draft", () => {
    expect(pickSendableVersion(asset({ status: "draft" }))).toBeNull();
  });
  it("returns null for archived", () => {
    expect(pickSendableVersion(asset({ status: "archived" }))).toBeNull();
  });
});

describe("bumpVersion", () => {
  it("moves current to previousVersion and increments version", () => {
    const a = asset({ version: 1, storageRef: "ref-v1" });
    const next = bumpVersion(a, { storageRef: "ref-v2", url: undefined });
    expect(next.version).toBe(2);
    expect(next.storageRef).toBe("ref-v2");
    expect(next.previousVersion).toEqual({
      version: 1,
      storageRef: "ref-v1",
      url: undefined,
      updatedAt: a.updatedAt,
    });
  });
  it("does not mutate the input item", () => {
    const a = asset({ version: 1 });
    bumpVersion(a, { storageRef: "ref-v2" });
    expect(a.version).toBe(1);
    expect(a.previousVersion).toBeUndefined();
  });
});
