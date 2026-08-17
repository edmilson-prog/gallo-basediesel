import { describe, expect, it } from "vitest";
import { canSaveSupplier, resolveSupplierDocState } from "./supplierForm";

const base = {
  digits: "",
  pending: false,
  cnpjStatus: "idle" as const,
  duplicateFound: false,
};

describe("resolveSupplierDocState", () => {
  it("is idle with nothing typed", () => {
    expect(resolveSupplierDocState(base)).toBe("idle");
  });

  it("is typing while the document is incomplete", () => {
    expect(resolveSupplierDocState({ ...base, digits: "330001" })).toBe("typing");
  });

  it("is invalid when the check digits do not add up", () => {
    expect(resolveSupplierDocState({ ...base, digits: "33000167000100" })).toBe("invalid");
  });

  it("is loading while a lookup is in flight", () => {
    expect(
      resolveSupplierDocState({ ...base, digits: "33000167000101", cnpjStatus: "loading" }),
    ).toBe("loading");
  });

  it("is loading while the debounce has not caught up", () => {
    expect(
      resolveSupplierDocState({
        ...base,
        digits: "33000167000101",
        pending: true,
        cnpjStatus: "success",
      }),
    ).toBe("loading");
  });

  it("lets a duplicate outrank a successful lookup", () => {
    expect(
      resolveSupplierDocState({
        ...base,
        digits: "33000167000101",
        cnpjStatus: "success",
        duplicateFound: true,
      }),
    ).toBe("duplicate");
  });

  it("is error when the Receita mirror is unreachable", () => {
    expect(
      resolveSupplierDocState({ ...base, digits: "33000167000101", cnpjStatus: "error" }),
    ).toBe("error");
  });
});

describe("canSaveSupplier", () => {
  it("allows saving with a name and no document at all", () => {
    expect(canSaveSupplier({ name: "Retífica Alto Uruguai", docState: "idle" })).toBe(true);
  });

  it("blocks a name shorter than three characters", () => {
    expect(canSaveSupplier({ name: "AB", docState: "idle" })).toBe(false);
  });

  it("blocks while a lookup is in flight", () => {
    expect(canSaveSupplier({ name: "Fornecedor", docState: "loading" })).toBe(false);
  });

  it("blocks a duplicate CNPJ", () => {
    expect(canSaveSupplier({ name: "Fornecedor", docState: "duplicate" })).toBe(false);
  });

  it("blocks an invalid CNPJ", () => {
    expect(canSaveSupplier({ name: "Fornecedor", docState: "invalid" })).toBe(false);
  });

  it("allows saving when the Receita is unreachable", () => {
    expect(canSaveSupplier({ name: "Fornecedor", docState: "error" })).toBe(true);
  });
});
