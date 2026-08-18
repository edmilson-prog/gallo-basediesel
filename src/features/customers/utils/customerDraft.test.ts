import { describe, expect, it } from "vitest";
import type { ICustomerB2B, ICustomerB2C } from "@/shared/types";
import { CUSTOMER_STRINGS } from "../i18n/pt-BR";
import type { ICnpjCompany } from "../hooks/useMinhaReceita";
import {
  applyCnpjCompanyToDraft,
  buildCustomerPatch,
  formatCep,
  toCustomerDraft,
  validateCustomerDraft,
} from "./customerDraft";

const ERR = CUSTOMER_STRINGS.overview.cadastrais.errors;

// 11.222.333/0001-81 and 529.982.247-25 pass the official check digits.
const VALID_CNPJ = "11222333000181";
const VALID_CPF = "52998224725";

function makeB2B(overrides: Partial<ICustomerB2B> = {}): ICustomerB2B {
  return {
    id: "cust-b2b-1",
    storeId: "store-1",
    type: "B2B",
    cnpj: VALID_CNPJ,
    razaoSocial: "RD Diesel Ltda",
    nomeFantasia: "RD Diesel",
    contactName: "Ricardo",
    phone: "5555999990000",
    email: "contato@rddiesel.com.br",
    sellerId: "seller-1",
    status: "ativo",
    tags: [],
    notes: [],
    address: {
      street: "Av. Brasil",
      number: "100",
      district: "Centro",
      city: "Frederico Westphalen",
      state: "RS",
      zipCode: "98400-000",
    },
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function makeB2C(overrides: Partial<ICustomerB2C> = {}): ICustomerB2C {
  return {
    id: "cust-b2c-1",
    storeId: "store-1",
    type: "B2C",
    cpf: VALID_CPF,
    fullName: "João da Silva",
    phone: "5555988887777",
    sellerId: "seller-1",
    status: "ativo",
    tags: [],
    notes: [],
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("formatCep", () => {
  it("masks 8 digits as 12345-678 and truncates the excess", () => {
    expect(formatCep("98400000")).toBe("98400-000");
    expect(formatCep("98400-000extra")).toBe("98400-000");
    expect(formatCep("984")).toBe("984");
  });
});

describe("toCustomerDraft", () => {
  it("snapshots a B2B customer with formatted document and address", () => {
    const draft = toCustomerDraft(makeB2B());
    expect(draft.razaoSocial).toBe("RD Diesel Ltda");
    expect(draft.cnpj).toBe("11.222.333/0001-81");
    expect(draft.fullName).toBe("");
    expect(draft.cpf).toBe("");
    expect(draft.street).toBe("Av. Brasil");
    expect(draft.zipCode).toBe("98400-000");
  });

  it("snapshots a B2C customer without address as empty strings", () => {
    const draft = toCustomerDraft(makeB2C());
    expect(draft.fullName).toBe("João da Silva");
    expect(draft.cpf).toBe("529.982.247-25");
    expect(draft.razaoSocial).toBe("");
    expect(draft.street).toBe("");
    expect(draft.email).toBe("");
  });
});

describe("validateCustomerDraft", () => {
  it("accepts an untouched B2B draft", () => {
    expect(validateCustomerDraft(toCustomerDraft(makeB2B()), "B2B")).toEqual({});
  });

  it("requires razão social on B2B and nome completo on B2C", () => {
    const b2b = { ...toCustomerDraft(makeB2B()), razaoSocial: "  " };
    expect(validateCustomerDraft(b2b, "B2B").razaoSocial).toBe(ERR.razaoSocialRequired);
    const b2c = { ...toCustomerDraft(makeB2C()), fullName: "" };
    expect(validateCustomerDraft(b2c, "B2C").fullName).toBe(ERR.fullNameRequired);
  });

  it("rejects a bad checksum but allows an empty document", () => {
    const bad = { ...toCustomerDraft(makeB2B()), cnpj: "11.111.111/1111-11" };
    expect(validateCustomerDraft(bad, "B2B").cnpj).toBe(ERR.invalidCnpj);
    const empty = { ...toCustomerDraft(makeB2B()), cnpj: "" };
    expect(validateCustomerDraft(empty, "B2B").cnpj).toBeUndefined();
    const badCpf = { ...toCustomerDraft(makeB2C()), cpf: "111.111.111-11" };
    expect(validateCustomerDraft(badCpf, "B2C").cpf).toBe(ERR.invalidCpf);
  });

  it("rejects a malformed email but allows an empty one", () => {
    const bad = { ...toCustomerDraft(makeB2B()), email: "not-an-email" };
    expect(validateCustomerDraft(bad, "B2B").email).toBe(ERR.invalidEmail);
    const empty = { ...toCustomerDraft(makeB2B()), email: "" };
    expect(validateCustomerDraft(empty, "B2B").email).toBeUndefined();
  });

  it("validates the address only when some field is filled", () => {
    const none = toCustomerDraft(makeB2C());
    expect(validateCustomerDraft(none, "B2C")).toEqual({});

    const partial = { ...none, city: "Iraí" };
    const errors = validateCustomerDraft(partial, "B2C");
    expect(errors.street).toBe(ERR.streetRequired);
    expect(errors.state).toBe(ERR.invalidState);

    const badZip = {
      ...none,
      street: "Rua A",
      city: "Iraí",
      state: "RS",
      zipCode: "984",
    };
    expect(validateCustomerDraft(badZip, "B2C").zipCode).toBe(ERR.invalidZip);
  });
});

describe("buildCustomerPatch", () => {
  it("returns an empty patch for an untouched draft (B2B and B2C)", () => {
    const b2b = makeB2B();
    expect(buildCustomerPatch(b2b, toCustomerDraft(b2b))).toEqual({});
    const b2c = makeB2C();
    expect(buildCustomerPatch(b2c, toCustomerDraft(b2c))).toEqual({});
  });

  it("ships variant fields together with the type discriminant", () => {
    const customer = makeB2B();
    const draft = { ...toCustomerDraft(customer), razaoSocial: "RD Diesel SA" };
    expect(buildCustomerPatch(customer, draft)).toEqual({
      type: "B2B",
      razaoSocial: "RD Diesel SA",
    });
  });

  it("does not attach type for common-field-only changes", () => {
    const customer = makeB2B();
    const draft = { ...toCustomerDraft(customer), email: "novo@rddiesel.com.br" };
    expect(buildCustomerPatch(customer, draft)).toEqual({ email: "novo@rddiesel.com.br" });
  });

  it("lowercases and trims the email", () => {
    const customer = makeB2C({ email: undefined });
    const draft = { ...toCustomerDraft(customer), email: "  Joao@Email.COM " };
    expect(buildCustomerPatch(customer, draft)).toEqual({ email: "joao@email.com" });
  });

  it("emits a cleared email with the key present and undefined", () => {
    const customer = makeB2B();
    const patch = buildCustomerPatch(customer, { ...toCustomerDraft(customer), email: "" });
    expect("email" in patch).toBe(true);
    expect(patch.email).toBeUndefined();
  });

  it("emits a cleared address with the key present and undefined", () => {
    const customer = makeB2B();
    const draft = {
      ...toCustomerDraft(customer),
      street: "",
      number: "",
      complement: "",
      district: "",
      city: "",
      state: "",
      zipCode: "",
    };
    const patch = buildCustomerPatch(customer, draft);
    expect("address" in patch).toBe(true);
    expect(patch.address).toBeUndefined();
  });

  it("normalizes a new address (uppercase UF, masked CEP, no empty complement)", () => {
    const customer = makeB2C();
    const draft = {
      ...toCustomerDraft(customer),
      street: " Rua Sete ",
      number: "45",
      district: "Centro",
      city: "Iraí",
      state: "rs",
      zipCode: "98460000",
    };
    expect(buildCustomerPatch(customer, draft).address).toEqual({
      street: "Rua Sete",
      number: "45",
      complement: undefined,
      district: "Centro",
      city: "Iraí",
      state: "RS",
      zipCode: "98460-000",
    });
  });

  it("stores documents as bare digits and detects masked-only edits as no-ops", () => {
    const customer = makeB2B();
    const masked = { ...toCustomerDraft(customer), cnpj: "11.222.333/0001-81" };
    expect(buildCustomerPatch(customer, masked)).toEqual({});

    const b2c = makeB2C({ cpf: "" });
    const draft = { ...toCustomerDraft(b2c), cpf: "529.982.247-25" };
    expect(buildCustomerPatch(b2c, draft)).toEqual({ type: "B2C", cpf: VALID_CPF });
  });

  it("never wipes the required display name defensively", () => {
    const customer = makeB2C();
    const draft = { ...toCustomerDraft(customer), fullName: "   " };
    expect(buildCustomerPatch(customer, draft)).toEqual({});
  });

  it("does not rewrite an unchanged mixed-case email on open-and-save", () => {
    const customer = makeB2C({ email: "Joao@Email.com" });
    expect(buildCustomerPatch(customer, toCustomerDraft(customer))).toEqual({});
  });

  it("treats an imported address with missing keys / lowercase UF as unchanged", () => {
    // DINTEC-imported JSONB may lack keys at runtime and store a lowercase UF.
    const dirty = makeB2B({
      address: {
        street: "Av. Brasil",
        city: "Frederico Westphalen",
        state: "rs",
        zipCode: "98400000",
      } as unknown as ICustomerB2B["address"],
    });
    const patch = buildCustomerPatch(dirty, toCustomerDraft(dirty));
    expect("address" in patch).toBe(false);
  });
});

describe("applyCnpjCompanyToDraft", () => {
  const company: ICnpjCompany = {
    cnpj: "49786918000105",
    razaoSocial: "RD Diesel Comércio de Peças Ltda",
    nomeFantasia: "RD DIESEL",
    situacaoCadastral: "ATIVA",
    address: {
      street: "Rua das Indústrias",
      number: "500",
      complement: "Galpão 2",
      district: "Distrito Industrial",
      city: "Chapecó",
      state: "sc",
      zipCode: "89805-000",
    },
  };

  it("overwrites razão social and nome fantasia from the company", () => {
    const draft = { ...toCustomerDraft(makeB2B()), razaoSocial: "antigo", nomeFantasia: "old" };
    const next = applyCnpjCompanyToDraft(draft, company);
    expect(next.razaoSocial).toBe("RD Diesel Comércio de Peças Ltda");
    expect(next.nomeFantasia).toBe("RD DIESEL");
  });

  it("keeps the current nome fantasia when the company has none", () => {
    const draft = { ...toCustomerDraft(makeB2B()), nomeFantasia: "Apelido do vendedor" };
    const next = applyCnpjCompanyToDraft(draft, { ...company, nomeFantasia: "  " });
    expect(next.nomeFantasia).toBe("Apelido do vendedor");
  });

  it("fills the address (uppercase UF, masked CEP) when present", () => {
    const next = applyCnpjCompanyToDraft(toCustomerDraft(makeB2C()), company);
    expect(next.street).toBe("Rua das Indústrias");
    expect(next.number).toBe("500");
    expect(next.complement).toBe("Galpão 2");
    expect(next.district).toBe("Distrito Industrial");
    expect(next.city).toBe("Chapecó");
    expect(next.state).toBe("SC");
    expect(next.zipCode).toBe("89805-000");
  });

  it("keeps the current address when the company has none", () => {
    const draft = toCustomerDraft(makeB2B());
    const next = applyCnpjCompanyToDraft(draft, { ...company, address: undefined });
    expect(next.street).toBe(draft.street);
    expect(next.city).toBe(draft.city);
    expect(next.zipCode).toBe(draft.zipCode);
  });

  it("never touches cnpj, contact, email, or B2C document fields", () => {
    const draft = {
      ...toCustomerDraft(makeB2B()),
      cnpj: "49.786.918/0001-05",
      contactName: "Fulano",
      email: "x@y.com",
      cpf: "529.982.247-25",
      fullName: "João",
    };
    const next = applyCnpjCompanyToDraft(draft, company);
    expect(next.cnpj).toBe("49.786.918/0001-05");
    expect(next.contactName).toBe("Fulano");
    expect(next.email).toBe("x@y.com");
    expect(next.cpf).toBe("529.982.247-25");
    expect(next.fullName).toBe("João");
  });
});
