import { describe, expect, it } from "vitest";
import { customerPatchToRow } from "./customers";

describe("customerPatchToRow", () => {
  it("maps a cleared email (key present, undefined) to null", () => {
    expect(customerPatchToRow({ email: undefined })).toEqual({ email: null });
  });

  it("maps a cleared address (key present, undefined) to null", () => {
    expect(customerPatchToRow({ address: undefined })).toEqual({ address: null });
  });

  it("omits email/address entirely when the key is absent", () => {
    expect(customerPatchToRow({ status: "ativo" })).toEqual({ status: "ativo" });
  });

  it("maps a credit limit of zero, which means credit blocked, not absent", () => {
    expect(customerPatchToRow({ creditLimit: 0 })).toEqual({ credit_limit: 0 });
  });

  it("maps a cleared credit limit (key present, undefined) to null", () => {
    expect(customerPatchToRow({ creditLimit: undefined })).toEqual({ credit_limit: null });
  });

  it("never writes the read-only DINTEC credit snapshot", () => {
    expect(customerPatchToRow({ dintecCreditLimit: 9999 })).toEqual({});
  });

  it("maps variant fields only in the presence of the type discriminant", () => {
    expect(customerPatchToRow({ type: "B2B", razaoSocial: "ACME" })).toEqual({
      type: "B2B",
      razao_social: "ACME",
    });
    expect(customerPatchToRow({ razaoSocial: "ACME" } as never)).toEqual({});
  });
});
