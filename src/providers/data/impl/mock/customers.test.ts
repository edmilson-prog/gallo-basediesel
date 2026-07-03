import { describe, expect, it } from "vitest";
import type { ICustomerB2B, ICustomerB2C } from "@/shared/types";
import { customersApi } from "@/mocks";
import { mockCustomersProvider } from "./customers";

/**
 * renameContact mirrors the supabase SECURITY DEFINER RPC: it writes ONLY the
 * display name into the variant field resolved from the row's own `type`
 * (full_name for B2C / nome_fantasia for B2B) and never touches whatsapp_name
 * (webhook-owned) or the other variant's fields.
 */
describe("mockCustomersProvider.renameContact", () => {
  it("B2C: writes fullName, preserves type, whatsappName and phone", async () => {
    const { data } = await customersApi.list({ type: "B2C", pageSize: 1 });
    const target = data[0];
    if (!target) throw new Error("seed has no B2C customer");
    // Seed a WhatsApp push name to prove the rename leaves it untouched.
    await customersApi.update(target.id, { whatsappName: "Push B2C" });
    const before = await customersApi.get(target.id);

    const updated = (await mockCustomersProvider.renameContact(
      target.id,
      "Novo Nome C",
    )) as ICustomerB2C;

    expect(updated.type).toBe("B2C");
    expect(updated.fullName).toBe("Novo Nome C");
    expect(updated.whatsappName).toBe("Push B2C");
    expect(updated.phone).toBe(before.phone);
    expect(updated.id).toBe(before.id);
  });

  it("B2B: writes nomeFantasia and leaves razaoSocial untouched", async () => {
    const { data } = await customersApi.list({ type: "B2B", pageSize: 1 });
    const target = data[0];
    if (!target) throw new Error("seed has no B2B customer");
    const before = (await customersApi.get(target.id)) as ICustomerB2B;

    const updated = (await mockCustomersProvider.renameContact(
      target.id,
      "Nova Fantasia",
    )) as ICustomerB2B;

    expect(updated.type).toBe("B2B");
    expect(updated.nomeFantasia).toBe("Nova Fantasia");
    expect(updated.razaoSocial).toBe(before.razaoSocial);
  });
});
