import { describe, expect, it } from "vitest";
import type { ILead, ILeadStage } from "@/shared/types";
import {
  documentCustomerType,
  formatConversionDocument,
  getConversionReadiness,
  isConversionDocument,
  isConversionName,
  isPersonalLead,
  togglePersonalTag,
} from "./conversionReadiness";

/** Math-valid, fictitious — same class of fixture the mock generators produce. */
const VALID_CPF = "52998224725";
const VALID_CNPJ = "11222333000181";

const STAGE: ILeadStage = { id: "stage-novo", name: "Novo", order: 0, color: "#888888" };

function makeLead(overrides: Partial<ILead> = {}): ILead {
  return {
    id: "lead-0001",
    storeId: "store-1",
    sellerId: "seller-1",
    name: "Lucas Andrade Ferreira",
    phone: "+55 (19) 99324-9725",
    stage: STAGE,
    temperature: "frio",
    origin: "whatsapp",
    conversations: [],
    tags: [],
    createdAt: "2026-07-18T21:23:00.000Z",
    updatedAt: "2026-07-18T21:23:00.000Z",
    ...overrides,
  };
}

describe("isConversionDocument", () => {
  it("accepts a valid CPF and a valid CNPJ, masked or bare", () => {
    expect(isConversionDocument(VALID_CPF)).toBe(true);
    expect(isConversionDocument("529.982.247-25")).toBe(true);
    expect(isConversionDocument(VALID_CNPJ)).toBe(true);
    expect(isConversionDocument("11.222.333/0001-81")).toBe(true);
  });

  it("refuses check-digit failures — the modal would bounce them", () => {
    expect(isConversionDocument("52998224726")).toBe(false);
    expect(isConversionDocument("11222333000182")).toBe(false);
  });

  it("refuses anything that is not 11 or 14 digits", () => {
    expect(isConversionDocument(undefined)).toBe(false);
    expect(isConversionDocument("")).toBe(false);
    expect(isConversionDocument("5299822472")).toBe(false);
    expect(isConversionDocument("112223330001812")).toBe(false);
  });
});

describe("documentCustomerType", () => {
  it("maps length to the type the conversion modal should open as", () => {
    expect(documentCustomerType(VALID_CPF)).toBe("B2C");
    expect(documentCustomerType(VALID_CNPJ)).toBe("B2B");
    expect(documentCustomerType("nope")).toBeNull();
  });
});

describe("formatConversionDocument", () => {
  it("masks by length", () => {
    expect(formatConversionDocument(VALID_CPF)).toBe("529.982.247-25");
    expect(formatConversionDocument(VALID_CNPJ)).toBe("11.222.333/0001-81");
  });
});

describe("isConversionName", () => {
  it("accepts a single-word name — a company can legitimately have one", () => {
    expect(isConversionName("Transbrasa", "5519993249725")).toBe(true);
  });

  it("refuses an empty name", () => {
    expect(isConversionName("", "5519993249725")).toBe(false);
    expect(isConversionName("   ", "5519993249725")).toBe(false);
    expect(isConversionName(undefined)).toBe(false);
  });

  it("refuses the phone number wearing a name's clothes", () => {
    expect(isConversionName("+55 (19) 99324-9725", "5519993249725")).toBe(false);
    expect(isConversionName("5519993249725", "5519993249725")).toBe(false);
    expect(isConversionName("19993249725")).toBe(false);
  });

  it("keeps a name that merely contains digits", () => {
    expect(isConversionName("Oficina 24h", "5519993249725")).toBe(true);
  });
});

describe("personal contacts", () => {
  it("recognises the tag whatever case or padding it was written in", () => {
    expect(isPersonalLead({ tags: ["pessoal"] })).toBe(true);
    expect(isPersonalLead({ tags: ["Pessoal"] })).toBe(true);
    expect(isPersonalLead({ tags: [" PESSOAL "] })).toBe(true);
    expect(isPersonalLead({ tags: ["pessoa"] })).toBe(false);
    expect(isPersonalLead({ tags: [] })).toBe(false);
  });

  it("adds the tag without disturbing the others", () => {
    expect(togglePersonalTag(["vip", "frota"])).toEqual(["vip", "frota", "pessoal"]);
  });

  it("removes it — including a differently-cased copy — and keeps the rest", () => {
    expect(togglePersonalTag(["vip", "Pessoal", "frota"])).toEqual(["vip", "frota"]);
  });

  it("round-trips back to the original set", () => {
    const original = ["vip", "frota"];
    expect(togglePersonalTag(togglePersonalTag(original))).toEqual(original);
  });
});

describe("getConversionReadiness", () => {
  it("lists the five fields in the order the panel renders them", () => {
    const readiness = getConversionReadiness(makeLead());
    expect(readiness.fields.map((f) => f.id)).toEqual([
      "phone",
      "name",
      "document",
      "email",
      "address",
    ]);
    expect(readiness.total).toBe(5);
  });

  it("marks phone/name/document required and email/address optional", () => {
    const readiness = getConversionReadiness(makeLead());
    const required = readiness.fields.filter((f) => f.required).map((f) => f.id);
    expect(required).toEqual(["phone", "name", "document"]);
  });

  it("is not ready while the document is missing, and names what is missing", () => {
    const readiness = getConversionReadiness(makeLead());
    expect(readiness.ready).toBe(false);
    expect(readiness.missingRequired.map((f) => f.id)).toEqual(["document"]);
    // phone + name of five.
    expect(readiness.filledCount).toBe(2);
    expect(readiness.percent).toBe(40);
  });

  it("is ready on name + valid document, even with no email and no address", () => {
    const readiness = getConversionReadiness(makeLead({ document: VALID_CPF }));
    expect(readiness.ready).toBe(true);
    expect(readiness.missingRequired).toEqual([]);
    expect(readiness.filledCount).toBe(3);
    expect(readiness.percent).toBe(60);
  });

  it("is NOT ready on a document that fails its check digits", () => {
    const readiness = getConversionReadiness(makeLead({ document: "52998224726" }));
    expect(readiness.ready).toBe(false);
    expect(readiness.missingRequired.map((f) => f.id)).toEqual(["document"]);
  });

  it("reaches 100% with every field answered", () => {
    const readiness = getConversionReadiness(
      makeLead({
        document: VALID_CNPJ,
        email: "lucas@pecasparceiro.com.br",
        address: {
          street: "Rua das Peças",
          number: "120",
          district: "Centro",
          city: "Campinas",
          state: "SP",
          zipCode: "13010-000",
        },
      }),
    );
    expect(readiness.percent).toBe(100);
    expect(readiness.ready).toBe(true);
    expect(readiness.fields.find((f) => f.id === "address")?.value).toBe("Campinas / SP");
    expect(readiness.fields.find((f) => f.id === "document")?.value).toBe("11.222.333/0001-81");
  });

  it("flags a one-word name as probably the WhatsApp push name, without blocking", () => {
    const readiness = getConversionReadiness(makeLead({ name: "Lucas", document: VALID_CPF }));
    const name = readiness.fields.find((f) => f.id === "name");
    expect(name?.filled).toBe(true);
    expect(name?.hint).toBe("whatsappName");
    expect(readiness.ready).toBe(true);
  });

  it("blocks when the lead's name is only its own number", () => {
    const readiness = getConversionReadiness(
      makeLead({ name: "+55 (19) 99324-9725", document: VALID_CPF }),
    );
    expect(readiness.ready).toBe(false);
    expect(readiness.missingRequired.map((f) => f.id)).toEqual(["name"]);
  });

  it("treats a blank email as absent rather than answered", () => {
    const readiness = getConversionReadiness(makeLead({ email: "   " }));
    expect(readiness.fields.find((f) => f.id === "email")?.filled).toBe(false);
  });
});
