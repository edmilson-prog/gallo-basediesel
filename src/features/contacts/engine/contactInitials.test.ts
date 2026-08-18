import { describe, expect, it } from "vitest";
import { contactInitials } from "./contactInitials";

describe("contactInitials", () => {
  it("takes the first letter of the first two meaningful words", () => {
    expect(contactInitials("Adair Antonello")).toBe("AA");
    expect(contactInitials("Marlene Kuhn")).toBe("MK");
  });

  it("skips short connectors when picking the second word", () => {
    expect(contactInitials("Cláudio de Périco")).toBe("CP");
  });

  it("falls back to a single letter for a one-word name", () => {
    expect(contactInitials("Jonas")).toBe("J");
  });

  it("ignores parentheses", () => {
    expect(contactInitials("(Jonas) Bomba")).toBe("JB");
  });

  it("returns # for a bare phone number", () => {
    expect(contactInitials("(55) 99401-8876")).toBe("#");
    expect(contactInitials("+55 55 99401 8876")).toBe("#");
  });

  it("returns # for an empty or blank name", () => {
    expect(contactInitials("")).toBe("#");
    expect(contactInitials("   ")).toBe("#");
  });

  it("keeps a two-letter first name", () => {
    expect(contactInitials("Zé Antonello")).toBe("ZA");
  });

  it("keeps a two-letter surname", () => {
    expect(contactInitials("Ana Sá")).toBe("AS");
  });
});
