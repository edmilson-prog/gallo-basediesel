import { describe, expect, it } from "vitest";
import {
  hasLetter,
  isPlaceholderName,
  phoneKey,
  planContactNameBackfill,
  type IBackfillContact,
  type IBackfillCustomer,
} from "./core";

describe("phoneKey", () => {
  it("strips every non-digit", () => {
    expect(phoneKey("+55 (49) 99999-8888")).toBe("5549999998888");
    expect(phoneKey(undefined)).toBe("");
  });
});

describe("hasLetter / isPlaceholderName", () => {
  it("treats names with any letter (incl. accents) as real", () => {
    expect(hasLetter("João")).toBe(true);
    expect(hasLetter("+5549999998888")).toBe(false);
    expect(hasLetter("")).toBe(false);
    expect(hasLetter(undefined)).toBe(false);
  });

  it("treats empty / digit-only names as placeholders", () => {
    expect(isPlaceholderName("")).toBe(true);
    expect(isPlaceholderName("+55 49 99999-8888")).toBe(true);
    expect(isPlaceholderName("Maria")).toBe(false);
  });
});

describe("planContactNameBackfill", () => {
  const contact = (phone: string, name?: string): IBackfillContact => ({ phone, name });
  const customer = (id: string, phone: string, fullName: string): IBackfillCustomer => ({
    id,
    phone,
    fullName,
  });

  it("renames a phone-named customer to the contact's profile name", () => {
    const renames = planContactNameBackfill(
      [contact("5549999998888", "João Silva")],
      [customer("c1", "+55 49 99999-8888", "+5549999998888")],
    );
    expect(renames).toEqual([
      {
        customerId: "c1",
        phone: "+55 49 99999-8888",
        currentName: "+5549999998888",
        newName: "João Silva",
      },
    ]);
  });

  it("matches across different phone formats (digits only)", () => {
    const renames = planContactNameBackfill(
      [contact("554999998888", "Ana")],
      [customer("c1", "+55 (49) 9999-8888", "")],
    );
    expect(renames).toHaveLength(1);
    expect(renames[0]!.newName).toBe("Ana");
  });

  it("never touches a customer with a human-entered name", () => {
    const renames = planContactNameBackfill(
      [contact("5549999998888", "João Silva")],
      [customer("c1", "5549999998888", "Oficina do Zé")],
    );
    expect(renames).toEqual([]);
  });

  it("skips contacts that have no real name", () => {
    const renames = planContactNameBackfill(
      [contact("5549999998888", ""), contact("5511888887777", undefined)],
      [customer("c1", "5549999998888", ""), customer("c2", "5511888887777", "")],
    );
    expect(renames).toEqual([]);
  });

  it("trims the profile name", () => {
    const renames = planContactNameBackfill(
      [contact("5549999998888", "  Bruno  ")],
      [customer("c1", "5549999998888", "")],
    );
    expect(renames[0]!.newName).toBe("Bruno");
  });

  it("ignores customers/contacts without a phone and short system jids (+0)", () => {
    const renames = planContactNameBackfill(
      [contact("", "NoPhone"), contact("0", "WhatsApp Business"), contact("5549999998888", "Carlos")],
      [
        customer("c1", "", "+000"),
        customer("c2", "+0", "+0"),
        customer("c3", "5549999998888", "5549999998888"),
      ],
    );
    expect(renames).toHaveLength(1);
    expect(renames[0]!.customerId).toBe("c3");
  });

  it("last contact with a real name wins on a duplicate phone", () => {
    const renames = planContactNameBackfill(
      [contact("5549999998888", "Primeiro"), contact("5549999998888", "Segundo")],
      [customer("c1", "5549999998888", "")],
    );
    expect(renames[0]!.newName).toBe("Segundo");
  });
});
