import { describe, expect, it } from "vitest";
import type { IAssetLibraryItem } from "@/shared/types";
import { planComboSend } from "./comboSend";

function asset(over: Partial<IAssetLibraryItem>): IAssetLibraryItem {
  return {
    id: "a1",
    storeId: "store-matriz",
    division: "parts",
    title: "Catálogo Volvo",
    category: "catalogo",
    kind: "document",
    version: 1,
    status: "published",
    sensitivity: "normal",
    createdBy: "seller-1",
    createdAt: "2026-06-01T00:00:00.000Z",
    updatedAt: "2026-06-01T00:00:00.000Z",
    ...over,
  };
}

describe("planComboSend", () => {
  it("preserves order of sendable items", () => {
    const items = [asset({ id: "a1" }), asset({ id: "a2" }), asset({ id: "a3" })];
    const plan = planComboSend(items, { role: "Vendedor" });
    expect(plan.sendable).toEqual(["a1", "a2", "a3"]);
    expect(plan.skipped).toEqual([]);
  });

  it("skips unpublished items with a reason (does not abort the combo)", () => {
    const items = [asset({ id: "a1" }), asset({ id: "a2", status: "draft" }), asset({ id: "a3" })];
    const plan = planComboSend(items, { role: "Vendedor" });
    expect(plan.sendable).toEqual(["a1", "a3"]);
    expect(plan.skipped).toEqual([{ assetId: "a2", ok: false, reason: "unpublished" }]);
  });

  it("skips a sensitive item for a Vendedor (no permission)", () => {
    const items = [asset({ id: "a1" }), asset({ id: "a2", category: "tabela_preco" })];
    const plan = planComboSend(items, { role: "Vendedor" });
    expect(plan.sendable).toEqual(["a1"]);
    expect(plan.skipped).toEqual([{ assetId: "a2", ok: false, reason: "sensitive_no_permission" }]);
  });

  it("allows a sensitive item for an Owner", () => {
    const items = [asset({ id: "a2", category: "tabela_preco" })];
    const plan = planComboSend(items, { role: "Owner" });
    expect(plan.sendable).toEqual(["a2"]);
    expect(plan.skipped).toEqual([]);
  });

  it("skips everything gracefully for an empty list", () => {
    expect(planComboSend([], { role: "Owner" })).toEqual({ sendable: [], skipped: [] });
  });
});
