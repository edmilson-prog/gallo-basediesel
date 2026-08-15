import { describe, expect, it } from "vitest";
import {
  canSubmitDocument,
  deriveDocState,
  documentLength,
  isValidDocument,
  offersManualFill,
  type INewCustomerDocInput,
} from "./newCustomerLookup";

/** Real check-digit-valid documents so the checksum branch is exercised for real. */
const VALID_CNPJ = "33000167000101";
const VALID_CPF = "52998224725";

const base: INewCustomerDocInput = {
  type: "B2B",
  digits: VALID_CNPJ,
  pending: false,
  cnpjStatus: "success",
  duplicateFound: false,
  manual: false,
};

const state = (patch: Partial<INewCustomerDocInput> = {}) => deriveDocState({ ...base, ...patch });

describe("documentLength", () => {
  it("is 14 for B2B and 11 for B2C", () => {
    expect(documentLength("B2B")).toBe(14);
    expect(documentLength("B2C")).toBe(11);
  });
});

describe("isValidDocument", () => {
  it("validates the document the type calls for", () => {
    expect(isValidDocument("B2B", VALID_CNPJ)).toBe(true);
    expect(isValidDocument("B2C", VALID_CPF)).toBe(true);
  });

  it("rejects a valid CPF passed as a CNPJ and vice-versa", () => {
    expect(isValidDocument("B2B", VALID_CPF)).toBe(false);
    expect(isValidDocument("B2C", VALID_CNPJ)).toBe(false);
  });
});

describe("deriveDocState — incomplete input", () => {
  it("is idle with nothing typed", () => {
    expect(state({ digits: "" })).toBe("idle");
  });

  it("is typing while the document is incomplete", () => {
    expect(state({ digits: "3300016700" })).toBe("typing");
    expect(state({ type: "B2C", digits: "529982247" })).toBe("typing");
  });

  it("does not report a stale duplicate while still typing", () => {
    expect(state({ digits: "330001", duplicateFound: true })).toBe("typing");
  });
});

describe("deriveDocState — check digits", () => {
  it("is invalid when the check digits don't add up", () => {
    expect(state({ digits: "33000167000199" })).toBe("invalid");
    expect(state({ type: "B2C", digits: "52998224700" })).toBe("invalid");
  });

  it("outranks a duplicate and a successful lookup", () => {
    expect(state({ digits: "33000167000199", duplicateFound: true })).toBe("invalid");
  });
});

describe("deriveDocState — duplicate guard", () => {
  it("reports a duplicate over a successful Receita lookup", () => {
    expect(state({ duplicateFound: true })).toBe("duplicate");
  });

  it("reports a duplicate for a CPF too", () => {
    expect(state({ type: "B2C", digits: VALID_CPF, duplicateFound: true })).toBe("duplicate");
  });

  it("outranks the manual override, so a duplicate can never be forced through", () => {
    expect(state({ duplicateFound: true, manual: true, cnpjStatus: "error" })).toBe("duplicate");
  });
});

describe("deriveDocState — the debounce race", () => {
  it("is loading while the lookups still describe the previous document", () => {
    expect(state({ pending: true })).toBe("loading");
  });

  it("ignores a duplicate flag that belongs to the previous document", () => {
    expect(state({ pending: true, duplicateFound: true })).toBe("loading");
  });

  it("holds a CPF back until the duplicate guard has caught up", () => {
    expect(state({ type: "B2C", digits: VALID_CPF, pending: true })).toBe("loading");
  });
});

describe("deriveDocState — Receita outcomes", () => {
  it("maps the lookup status onto the field state", () => {
    expect(state({ cnpjStatus: "success" })).toBe("done");
    expect(state({ cnpjStatus: "invalid" })).toBe("notfound");
    expect(state({ cnpjStatus: "error" })).toBe("error");
    expect(state({ cnpjStatus: "loading" })).toBe("loading");
  });

  it("treats the gap between debounce and request as loading, not as a pass", () => {
    expect(state({ cnpjStatus: "idle" })).toBe("loading");
  });

  it("accepts a valid CPF with no lookup at all", () => {
    expect(state({ type: "B2C", digits: VALID_CPF, cnpjStatus: "idle" })).toBe("done");
  });

  it("returns manual once the user opts out of the lookup", () => {
    expect(state({ manual: true, cnpjStatus: "invalid" })).toBe("manual");
    expect(state({ manual: true, cnpjStatus: "error" })).toBe("manual");
  });
});

describe("canSubmitDocument", () => {
  it("allows a confirmed document and a manually filled one", () => {
    expect(canSubmitDocument("done")).toBe(true);
    expect(canSubmitDocument("manual")).toBe(true);
  });

  it("blocks every unresolved or rejected state", () => {
    for (const s of [
      "idle",
      "typing",
      "invalid",
      "loading",
      "duplicate",
      "notfound",
      "error",
    ] as const) {
      expect(canSubmitDocument(s)).toBe(false);
    }
  });
});

describe("offersManualFill", () => {
  it("only offers the escape hatch after a failed lookup", () => {
    expect(offersManualFill("notfound")).toBe(true);
    expect(offersManualFill("error")).toBe(true);
    expect(offersManualFill("invalid")).toBe(false);
    expect(offersManualFill("duplicate")).toBe(false);
    expect(offersManualFill("loading")).toBe(false);
  });
});
