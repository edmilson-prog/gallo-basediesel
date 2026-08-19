import { describe, expect, it } from "vitest";
import type { ILead, ILeadStage } from "@/shared/types";
import type { ICnpjCompany } from "@/features/customers/utils/minhaReceitaMapper";
import {
  buildDocumentSaveChanges,
  deriveReceitaLookupState,
  mergeLeadAddress,
  planReceitaAutofill,
  receitaCompanyName,
} from "./receitaAutofill";

/** Math-valid, fictitious. */
const CNPJ = "11222333000181";
const OTHER_CNPJ = "30345353000194";

const STAGE: ILeadStage = { id: "stage-novo", name: "Novo", order: 0, color: "#888888" };

function makeLead(overrides: Partial<ILead> = {}): ILead {
  return {
    id: "lead-0001",
    storeId: "store-1",
    sellerId: "seller-1",
    name: "Fiuza",
    phone: "+55 (49) 93100-77",
    stage: STAGE,
    temperature: "morno",
    origin: "whatsapp",
    conversations: [],
    tags: [],
    createdAt: "2026-08-19T12:00:00.000Z",
    updatedAt: "2026-08-19T12:00:00.000Z",
    ...overrides,
  };
}

function makeCompany(overrides: Partial<ICnpjCompany> = {}): ICnpjCompany {
  return {
    cnpj: "30345353000194",
    razaoSocial: "TRANSPORTES FIUZA LTDA",
    nomeFantasia: "FIUZA TRANSPORTES",
    situacaoCadastral: "ATIVA",
    email: "contato@fiuza.com.br",
    address: {
      street: "AVENIDA BRASIL",
      number: "65",
      district: "CENTRO",
      city: "Frederico Westphalen",
      state: "RS",
      zipCode: "98400-000",
    },
    ...overrides,
  };
}

describe("deriveReceitaLookupState", () => {
  const settled = (over: Partial<Parameters<typeof deriveReceitaLookupState>[0]> = {}) =>
    deriveReceitaLookupState({
      typed: CNPJ,
      requestedCnpj: CNPJ,
      status: "success",
      loadedCnpj: CNPJ,
      ...over,
    });

  it("stays idle for anything that is not a complete, valid CNPJ", () => {
    expect(settled({ typed: "" })).toBe("idle");
    expect(settled({ typed: "112223330001" })).toBe("idle");
    // A CPF: 11 digits, no public lookup to run.
    expect(settled({ typed: "529.982.247-25" })).toBe("idle");
    // 14 digits, bad check digits.
    expect(settled({ typed: "11222333000182" })).toBe("idle");
  });

  it("reads a masked CNPJ the same as a bare one", () => {
    expect(settled({ typed: "11.222.333/0001-81" })).toBe("found");
  });

  it("checks while nothing has been asked about the number on screen", () => {
    expect(settled({ requestedCnpj: null, status: "idle", loadedCnpj: null })).toBe("checking");
  });

  it("checks while the request is in flight", () => {
    expect(settled({ status: "loading", loadedCnpj: null })).toBe("checking");
  });

  it("refuses a success whose company belongs to a different CNPJ", () => {
    expect(settled({ loadedCnpj: OTHER_CNPJ })).toBe("checking");
    expect(settled({ loadedCnpj: null })).toBe("checking");
  });

  it("reports the two non-blocking failures apart", () => {
    expect(settled({ status: "invalid", loadedCnpj: null })).toBe("notfound");
    expect(settled({ status: "error", loadedCnpj: null })).toBe("offline");
  });

  // The staleness trap, and the reason the gate is `requestedCnpj` rather than
  // the debounced field value: a 404 or a network error carries no CNPJ of its
  // own, so a status left over from the PREVIOUS number would otherwise be
  // reported against the one now on screen.
  it("never reports a leftover verdict against a number it was not asked about", () => {
    for (const status of ["invalid", "error", "success"] as const) {
      expect(settled({ requestedCnpj: OTHER_CNPJ, status, loadedCnpj: OTHER_CNPJ })).toBe(
        "checking",
      );
    }
  });
});

describe("receitaCompanyName", () => {
  it("prefers the nome fantasia — that is what the CRM displays", () => {
    expect(receitaCompanyName(makeCompany())).toBe("FIUZA TRANSPORTES");
  });

  it("falls back to the razão social when there is no fantasia", () => {
    expect(receitaCompanyName(makeCompany({ nomeFantasia: "   " }))).toBe("TRANSPORTES FIUZA LTDA");
  });

  it("returns null when the Receita answered with neither", () => {
    expect(receitaCompanyName(makeCompany({ nomeFantasia: "", razaoSocial: "" }))).toBeNull();
  });
});

describe("mergeLeadAddress", () => {
  it("carries the Receita address across field for field when there is none", () => {
    expect(mergeLeadAddress(undefined, makeCompany().address!)).toEqual({
      street: "AVENIDA BRASIL",
      number: "65",
      district: "CENTRO",
      city: "Frederico Westphalen",
      state: "RS",
      zipCode: "98400-000",
    });
  });

  it("keeps the complement when the Receita has one", () => {
    const address = mergeLeadAddress(undefined, {
      ...makeCompany().address!,
      complement: "SALA 2",
    });
    expect(address.complement).toBe("SALA 2");
  });

  // The checklist counts an address on city/UF alone, so a record holding only
  // a street and a CEP reads as unanswered — replacing it wholesale would throw
  // away two fields somebody typed.
  it("never discards a subfield the lead already had", () => {
    const merged = mergeLeadAddress(
      {
        street: "Rua Particular",
        number: "1200",
        district: "",
        city: "",
        state: "",
        zipCode: "98400-123",
      },
      makeCompany().address!,
    );
    expect(merged.street).toBe("Rua Particular");
    expect(merged.number).toBe("1200");
    expect(merged.zipCode).toBe("98400-123");
    // …and still fills in what was missing.
    expect(merged.city).toBe("Frederico Westphalen");
    expect(merged.district).toBe("CENTRO");
  });
});

/** The rows a plan fills, as ids — the shape most assertions care about. */
const ids = (plan: ReturnType<typeof planReceitaAutofill>) => plan.fields.map((f) => f.id);

describe("planReceitaAutofill", () => {
  it("fills e-mail and address on a lead that has neither", () => {
    const plan = planReceitaAutofill(makeLead(), makeCompany());
    expect(ids(plan)).toEqual(["email", "address"]);
    expect(plan.changes.email).toBe("contato@fiuza.com.br");
    expect(plan.changes.address?.city).toBe("Frederico Westphalen");
  });

  it("carries a readable value for every row it fills, so nothing is written blind", () => {
    const plan = planReceitaAutofill(makeLead(), makeCompany());
    expect(plan.fields).toEqual([
      { id: "email", value: "contato@fiuza.com.br" },
      { id: "address", value: "AVENIDA BRASIL · Frederico Westphalen/RS" },
    ]);
  });

  // The open Receita dataset carries placeholders in this column. The e-mail
  // row of the same editor refuses them by hand; autofill must not walk them in
  // through the side door, because it writes without showing a form field.
  it("refuses an e-mail the editor's own row would reject", () => {
    for (const email of ["NAOPOSSUI@NAOTEM", "sem email", "contato@", "@fiuza.com.br", "a@b.c"]) {
      const plan = planReceitaAutofill(makeLead(), makeCompany({ email }));
      expect(ids(plan)).not.toContain("email");
      expect(plan.changes.email).toBeUndefined();
    }
  });

  it("never overwrites what the lead already carries", () => {
    const lead = makeLead({
      email: "vendas@cliente.com.br",
      address: {
        street: "",
        number: "",
        district: "",
        city: "Palmitinho",
        state: "RS",
        zipCode: "",
      },
    });
    const plan = planReceitaAutofill(lead, makeCompany());
    expect(plan.fields).toEqual([]);
    expect(plan.changes).toEqual({});
  });

  // The invariant that protects every column the plan has no business touching:
  // phone, tags, document, temperature, stage…
  it("only ever plans the three rows it is allowed to fill", () => {
    const plan = planReceitaAutofill(makeLead({ name: "5549931007" }), makeCompany());
    expect(Object.keys(plan.changes).sort()).toEqual(["address", "email", "name"]);
  });

  // A blank-but-present address object is what the field editor writes when a
  // seller opens the address popover and saves nothing — it must not read as
  // "already answered", because the checklist doesn't count it either.
  it("treats an address with no city and no UF as unanswered", () => {
    const lead = makeLead({
      address: { street: "", number: "", district: "", city: "  ", state: " ", zipCode: "" },
    });
    expect(ids(planReceitaAutofill(lead, makeCompany()))).toContain("address");
  });

  it("fills the name when the lead has none worth keeping", () => {
    const plan = planReceitaAutofill(makeLead({ name: "5549931007" }), makeCompany());
    expect(plan.fields[0]?.id).toBe("name");
    expect(plan.changes.name).toBe("FIUZA TRANSPORTES");
    // Filled, so there is nothing left to offer.
    expect(plan.nameSuggestion).toBeNull();
  });

  // The WhatsApp push name is a real name by the checklist's rules, so it is
  // never overwritten silently — the company name is OFFERED instead.
  it("offers the company name when the lead already has one", () => {
    const plan = planReceitaAutofill(makeLead({ name: "Fiuza" }), makeCompany());
    expect(plan.changes.name).toBeUndefined();
    expect(ids(plan)).not.toContain("name");
    expect(plan.nameSuggestion).toBe("FIUZA TRANSPORTES");
  });

  it("offers nothing when the lead's name already is the company name", () => {
    const plan = planReceitaAutofill(makeLead({ name: "  fiuza transportes " }), makeCompany());
    expect(plan.nameSuggestion).toBeNull();
  });

  it("plans nothing at all when the Receita answered with empty fields", () => {
    const company = makeCompany({
      nomeFantasia: "",
      razaoSocial: "",
      email: undefined,
      address: undefined,
    });
    const plan = planReceitaAutofill(makeLead({ name: "5549931007" }), company);
    expect(plan.fields).toEqual([]);
    expect(plan.changes).toEqual({});
    expect(plan.nameSuggestion).toBeNull();
  });
});

describe("buildDocumentSaveChanges", () => {
  const DIGITS = "30345353000194";

  it("writes just the document when there is no plan", () => {
    expect(buildDocumentSaveChanges(DIGITS, null, false)).toEqual({ document: DIGITS });
  });

  it("merges the plan in alongside the document", () => {
    const plan = planReceitaAutofill(makeLead(), makeCompany());
    const changes = buildDocumentSaveChanges(DIGITS, plan, false);
    expect(changes.document).toBe(DIGITS);
    expect(changes.email).toBe("contato@fiuza.com.br");
    expect(changes.address?.city).toBe("Frederico Westphalen");
  });

  // `LeadPanelBody.saveField` reads `Object.keys(changes)[0]` to pick the row
  // that spins and to name the audit entry. A plan field in that slot would
  // spin the e-mail row while the seller is saving a document.
  it("keeps the document as the FIRST key", () => {
    const plan = planReceitaAutofill(makeLead(), makeCompany());
    expect(Object.keys(buildDocumentSaveChanges(DIGITS, plan, false))[0]).toBe("document");
  });

  // The row exists to write the document — nothing a plan carries, now or after
  // somebody widens `planReceitaAutofill`, may take that slot.
  it("refuses to let a plan overwrite the document", () => {
    const rogue = {
      changes: { document: "11222333000181", email: "x@y.com.br" },
      fields: [],
      nameSuggestion: null,
    };
    const changes = buildDocumentSaveChanges(DIGITS, rogue, false);
    expect(changes.document).toBe(DIGITS);
    expect(changes.email).toBe("x@y.com.br");
  });

  it("applies the offered name only once the seller accepts it", () => {
    const plan = planReceitaAutofill(makeLead({ name: "Fiuza" }), makeCompany());
    expect(buildDocumentSaveChanges(DIGITS, plan, false).name).toBeUndefined();
    expect(buildDocumentSaveChanges(DIGITS, plan, true).name).toBe("FIUZA TRANSPORTES");
  });

  it("has no name to apply when none was offered, however the flag is set", () => {
    const plan = planReceitaAutofill(makeLead({ name: "  fiuza transportes " }), makeCompany());
    expect(plan.nameSuggestion).toBeNull();
    expect(buildDocumentSaveChanges(DIGITS, plan, true).name).toBeUndefined();
  });
});
