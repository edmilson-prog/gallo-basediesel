import { describe, expect, it } from "vitest";
import type { IContact, ITriageSuggestion } from "@/shared/types";
import { buildTriageSuggestions, type ITriageCandidate } from "./triageSuggestions";

function contact(patch: Partial<IContact> = {}): IContact {
  return {
    id: "ct-1",
    storeId: "st-1",
    // Deliberately name-less by default so each test opts into the signal it
    // is measuring instead of accidentally scoring on the name too.
    name: "😀",
    role: null,
    phone: null,
    phoneDigits: null,
    email: null,
    city: null,
    uf: null,
    customerId: null,
    customerName: null,
    leadId: null,
    ownerSellerId: null,
    ownerName: null,
    tags: [],
    source: "whatsapp",
    optOut: false,
    optOutAt: null,
    optOutBy: null,
    nextContactAt: null,
    nextContactNote: null,
    lastContactAt: null,
    hasWhatsapp: true,
    ignoredAt: null,
    ignoreReason: null,
    ignoredBy: null,
    division: "parts",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...patch,
  };
}

function candidate(patch: Partial<ITriageCandidate> = {}): ITriageCandidate {
  return {
    customerId: "cu-1",
    customerName: "Kroth Terraplanagem",
    phones: [],
    emails: [],
    city: null,
    uf: null,
    ...patch,
  };
}

/** First suggestion, or a failure that names what was expected. */
function first(suggestions: ITriageSuggestion[]): ITriageSuggestion {
  const [suggestion] = suggestions;
  if (!suggestion) throw new Error("esperava ao menos uma sugestão");
  return suggestion;
}

describe("buildTriageSuggestions", () => {
  it("treats a 9th-digit variant of the same line as near-certainty", () => {
    const suggestion = first(
      buildTriageSuggestions(contact({ phone: "+5555996482210" }), [
        candidate({ phones: ["(55) 9648-2210"] }),
      ]),
    );

    expect(suggestion.confidence).toBe(99);
    expect(suggestion.reason).toContain("mesmo telefone já cadastrado neste cliente");
  });

  it("scores an exact e-mail on its own", () => {
    const suggestion = first(
      buildTriageSuggestions(contact({ email: "compras@fronteiraoeste.com.br" }), [
        candidate({ emails: ["Compras@FronteiraOeste.com.br"] }),
      ]),
    );

    expect(suggestion.confidence).toBe(92);
    expect(suggestion.signals).toContain("email");
  });

  it("scores a shared company domain below an exact address", () => {
    const suggestion = first(
      buildTriageSuggestions(contact({ email: "volnei@fronteiraoeste.com.br" }), [
        candidate({ emails: ["compras@fronteiraoeste.com.br"] }),
      ]),
    );

    expect(suggestion.confidence).toBe(70);
    expect(suggestion.reason).toBe("e-mail do domínio fronteiraoeste.com.br");
  });

  it("ignores a shared free-mail host", () => {
    // Half the base is on gmail — this must not be a signal.
    expect(
      buildTriageSuggestions(contact({ email: "gilmar@gmail.com" }), [
        candidate({ emails: ["outra.pessoa@gmail.com"] }),
      ]),
    ).toEqual([]);
  });

  it("matches a person against their company by surname", () => {
    const suggestion = first(
      buildTriageSuggestions(contact({ name: "Diego Kroth" }), [candidate()]),
    );

    // One distinctive word out of two — real evidence, not proof.
    expect(suggestion.confidence).toBe(59);
    expect(suggestion.reason).toBe("“kroth” também está no nome do cliente");
  });

  it("drops a lone surname colliding inside a long name", () => {
    // "lima" matches, but it is 1 of 5 distinctive words — a common surname
    // doing what common surnames do.
    expect(
      buildTriageSuggestions(contact({ name: "Ana Paula Ferreira Souza Lima" }), [
        candidate({ customerId: "cu-9", customerName: "Lima Máquinas" }),
      ]),
    ).toEqual([]);
  });

  it("never creates a suggestion from a matching area code alone", () => {
    expect(
      buildTriageSuggestions(contact({ phone: "+5554996302288" }), [
        candidate({ phones: ["+5554999999999"] }),
      ]),
    ).toEqual([]);
  });

  it("lets a matching area code refine a suggestion that already stands", () => {
    const withoutArea = first(
      buildTriageSuggestions(contact({ name: "Diego Kroth" }), [candidate()]),
    );
    const withArea = first(
      buildTriageSuggestions(contact({ name: "Diego Kroth", phone: "+5555999990000" }), [
        candidate({ phones: ["+5555988887777"] }),
      ]),
    );

    expect(withArea.confidence).toBe(withoutArea.confidence + 4);
    expect(withArea.signals).toContain("areaCode");
    expect(withArea.reason).toContain("mesmo DDD (55)");
  });

  it("does not suggest the customer the contact is already linked to", () => {
    expect(
      buildTriageSuggestions(contact({ name: "Diego Kroth", customerId: "cu-1" }), [candidate()]),
    ).toEqual([]);
  });

  it("ranks by confidence and returns at most three", () => {
    const suggestions = buildTriageSuggestions(
      contact({ name: "Diego Kroth", phone: "+5555996482210", email: "diego@kroth.com.br" }),
      [
        candidate({ customerId: "cu-name", customerName: "Kroth Terraplanagem" }),
        candidate({
          customerId: "cu-phone",
          customerName: "Transportes Fronteira Oeste",
          phones: ["(55) 9648-2210"],
        }),
        candidate({
          customerId: "cu-domain",
          customerName: "Balestrin Agrícola",
          emails: ["compras@kroth.com.br"],
        }),
        candidate({ customerId: "cu-weak", customerName: "Somensi Alimentos" }),
      ],
    );

    expect(suggestions.map((s) => s.customerId)).toEqual(["cu-phone", "cu-domain", "cu-name"]);
    expect(first(suggestions).confidence).toBeGreaterThan(suggestions[1]?.confidence ?? 0);
  });

  it("returns nothing when no candidate raises a signal", () => {
    expect(buildTriageSuggestions(contact(), [candidate()])).toEqual([]);
    expect(buildTriageSuggestions(contact({ name: "Diego Kroth" }), [])).toEqual([]);
  });
});
