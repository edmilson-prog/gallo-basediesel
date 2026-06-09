import { describe, expect, it } from "vitest";
import type { ICartItem } from "@/features/storefront/store/cartStore";
import { buildHandoffMessage } from "./handoffMessage";

const items: ICartItem[] = [
  {
    partId: "p1",
    partName: "Filtro de óleo",
    partSku: "SKU-1",
    partOemCode: "OEM-1",
    unitPrice: 25,
    quantity: 2,
  },
  {
    partId: "p2",
    partName: "Correia dentada",
    partSku: "SKU-2",
    unitPrice: 120,
    quantity: 1,
  },
];

describe("buildHandoffMessage", () => {
  it("lists every cart line with quantity and a code", () => {
    const msg = buildHandoffMessage(items, 170);
    expect(msg).toContain("2× Filtro de óleo (cód. OEM-1)");
    // Falls back to the SKU when there is no OEM code.
    expect(msg).toContain("1× Correia dentada (cód. SKU-2)");
  });

  it("includes the subtotal line", () => {
    const msg = buildHandoffMessage(items, 170);
    expect(msg).toContain("Subtotal:");
  });

  it("omits the contact block when no contact is given", () => {
    const msg = buildHandoffMessage(items, 170);
    expect(msg).not.toContain("Meus dados");
  });

  it("includes only the contact fields that are filled", () => {
    const msg = buildHandoffMessage(items, 170, { name: "João" });
    expect(msg).toContain("Meus dados:");
    expect(msg).toContain("Nome: João");
    expect(msg).not.toContain("WhatsApp:");
  });

  it("trims contact fields and includes both when present", () => {
    const msg = buildHandoffMessage(items, 170, { name: "  Ana  ", phone: " (55) 99999-0000 " });
    expect(msg).toContain("Nome: Ana");
    expect(msg).toContain("WhatsApp: (55) 99999-0000");
  });

  it("uses the provided store name in the greeting", () => {
    const msg = buildHandoffMessage(items, 170, {}, "GALLO PARTS");
    expect(msg).toContain("na GALLO PARTS:");
  });
});
