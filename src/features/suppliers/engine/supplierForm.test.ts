import { describe, expect, it } from "vitest";
import {
  canSaveSupplier,
  isSupplierDocLookupPending,
  resolveSupplierDocState,
  supplierDocumentPatchValue,
} from "./supplierForm";

/** Two distinct, checksum-valid CNPJs — used to model "document A, then document B". */
const DOC_A = "33000167000101";
const DOC_B = "11222333000181";

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

describe("isSupplierDocLookupPending", () => {
  it("is not pending when nothing is typed", () => {
    expect(
      isSupplierDocLookupPending({
        digits: "",
        debouncedDigits: "",
        dispatchedForDigits: null,
        cnpjStatus: "idle",
        duplicateChecking: false,
      }),
    ).toBe(false);
  });

  it("is pending while the debounce has not caught up to a complete document", () => {
    expect(
      isSupplierDocLookupPending({
        digits: DOC_A,
        debouncedDigits: DOC_A.slice(0, 13),
        dispatchedForDigits: null,
        cnpjStatus: "idle",
        duplicateChecking: false,
      }),
    ).toBe(true);
  });

  it("is pending in the gap between the debounce settling and the lookup effects dispatching — results describing a document that is no longer live must never read as settled", () => {
    // Document A already resolved to "done" (debounce, dispatch and results
    // all agreed on A). Document B — different, complete, checksum-valid —
    // is now live and debounced, but the effects for B have not run yet:
    // `dispatchedForDigits`, `cnpjStatus` and `duplicateChecking` still
    // describe A. This is the exact one-render race the reviewer flagged.
    expect(
      isSupplierDocLookupPending({
        digits: DOC_B,
        debouncedDigits: DOC_B,
        dispatchedForDigits: DOC_A,
        cnpjStatus: "success",
        duplicateChecking: false,
      }),
    ).toBe(true);
  });

  it("is pending while a dispatched Receita lookup is in flight", () => {
    expect(
      isSupplierDocLookupPending({
        digits: DOC_A,
        debouncedDigits: DOC_A,
        dispatchedForDigits: DOC_A,
        cnpjStatus: "loading",
        duplicateChecking: false,
      }),
    ).toBe(true);
  });

  it("is pending while a dispatched duplicate check is in flight", () => {
    expect(
      isSupplierDocLookupPending({
        digits: DOC_A,
        debouncedDigits: DOC_A,
        dispatchedForDigits: DOC_A,
        cnpjStatus: "success",
        duplicateChecking: true,
      }),
    ).toBe(true);
  });

  it("settles once the dispatched lookups have caught up and resolved", () => {
    expect(
      isSupplierDocLookupPending({
        digits: DOC_A,
        debouncedDigits: DOC_A,
        dispatchedForDigits: DOC_A,
        cnpjStatus: "success",
        duplicateChecking: false,
      }),
    ).toBe(false);
  });

  it("settles — without blocking — once a dispatched Receita outage has resolved", () => {
    expect(
      isSupplierDocLookupPending({
        digits: DOC_A,
        debouncedDigits: DOC_A,
        dispatchedForDigits: DOC_A,
        cnpjStatus: "error",
        duplicateChecking: false,
      }),
    ).toBe(false);
  });
});

describe("document field pipeline (isSupplierDocLookupPending -> resolveSupplierDocState -> canSaveSupplier)", () => {
  it("never reads as done, and never allows saving, while results describe a document that is no longer live", () => {
    const pending = isSupplierDocLookupPending({
      digits: DOC_B,
      debouncedDigits: DOC_B,
      dispatchedForDigits: DOC_A,
      cnpjStatus: "success",
      duplicateChecking: false,
    });
    const docState = resolveSupplierDocState({
      digits: DOC_B,
      pending,
      cnpjStatus: "success",
      // Stale value — actually describes A. If B (live) is itself a
      // duplicate, this stale "false" is exactly what would wrongly let it
      // through without `pending` catching it first.
      duplicateFound: false,
    });
    expect(docState).toBe("loading");
    expect(docState).not.toBe("done");
    expect(canSaveSupplier({ name: "Fornecedor", docState })).toBe(false);
  });

  it("blocks saving once a dispatched, resolved lookup finds a duplicate", () => {
    const pending = isSupplierDocLookupPending({
      digits: DOC_A,
      debouncedDigits: DOC_A,
      dispatchedForDigits: DOC_A,
      cnpjStatus: "success",
      duplicateChecking: false,
    });
    const docState = resolveSupplierDocState({
      digits: DOC_A,
      pending,
      cnpjStatus: "success",
      duplicateFound: true,
    });
    expect(docState).toBe("duplicate");
    expect(canSaveSupplier({ name: "Fornecedor", docState })).toBe(false);
  });

  it("does not block saving once a dispatched Receita outage has resolved", () => {
    const pending = isSupplierDocLookupPending({
      digits: DOC_A,
      debouncedDigits: DOC_A,
      dispatchedForDigits: DOC_A,
      cnpjStatus: "error",
      duplicateChecking: false,
    });
    const docState = resolveSupplierDocState({
      digits: DOC_A,
      pending,
      cnpjStatus: "error",
      duplicateFound: false,
    });
    expect(docState).toBe("error");
    expect(canSaveSupplier({ name: "Fornecedor", docState })).toBe(true);
  });
});

describe("supplierDocumentPatchValue", () => {
  it("clears the document when the field is emptied", () => {
    expect(supplierDocumentPatchValue("")).toBe("");
  });

  it("leaves a previously saved document untouched while it is only partially retyped", () => {
    // The exact regression: a saved CNPJ with a few digits backspaced out is
    // neither "no document" nor a confirmed new one — it must not overwrite
    // whatever is already stored.
    expect(supplierDocumentPatchValue("330001")).toBeUndefined();
    expect(supplierDocumentPatchValue(DOC_A.slice(0, 1))).toBeUndefined();
    expect(supplierDocumentPatchValue(DOC_A.slice(0, 13))).toBeUndefined();
  });

  it("submits the digits once the document is complete", () => {
    expect(supplierDocumentPatchValue(DOC_A)).toBe(DOC_A);
  });
});

describe("canSaveSupplier — create mode", () => {
  // The Tally's `suppliers.cnpj` column is `NOT NULL`: unlike edit (where a
  // supplier already has a row), cadastro must not submit without a fully
  // resolved CNPJ. These cases are additive — the ones above, none of them
  // passing `mode`, cover the unchanged default ("edit") behavior.

  it("blocks with no document at all — the opposite of the edit-mode default", () => {
    expect(canSaveSupplier({ name: "Fornecedor", docState: "idle", mode: "create" })).toBe(false);
  });

  it("blocks while the document is still incomplete", () => {
    expect(canSaveSupplier({ name: "Fornecedor", docState: "typing", mode: "create" })).toBe(false);
  });

  it("blocks while a lookup is in flight", () => {
    expect(canSaveSupplier({ name: "Fornecedor", docState: "loading", mode: "create" })).toBe(
      false,
    );
  });

  it("blocks a duplicate CNPJ", () => {
    expect(canSaveSupplier({ name: "Fornecedor", docState: "duplicate", mode: "create" })).toBe(
      false,
    );
  });

  it("blocks an invalid CNPJ", () => {
    expect(canSaveSupplier({ name: "Fornecedor", docState: "invalid", mode: "create" })).toBe(
      false,
    );
  });

  it("allows once the Receita lookup succeeds", () => {
    expect(canSaveSupplier({ name: "Fornecedor", docState: "done", mode: "create" })).toBe(true);
  });

  it("allows when the Receita is unreachable — an outage must never block a cadastro", () => {
    expect(canSaveSupplier({ name: "Fornecedor", docState: "error", mode: "create" })).toBe(true);
  });

  it("allows when the CNPJ is valid but simply not on file at the Receita", () => {
    expect(canSaveSupplier({ name: "Fornecedor", docState: "notfound", mode: "create" })).toBe(
      true,
    );
  });

  it("still blocks a short name, same as edit mode", () => {
    expect(canSaveSupplier({ name: "AB", docState: "done", mode: "create" })).toBe(false);
  });
});
