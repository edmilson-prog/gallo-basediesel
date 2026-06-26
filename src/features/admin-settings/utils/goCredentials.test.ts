import { describe, expect, it } from "vitest";
import { isValidCredentialsRef } from "../api/whatsappConnect";
import { generateGoCredentialsRef } from "./goCredentials";

describe("generateGoCredentialsRef", () => {
  it("builds an env-style ref from the label and suffix", () => {
    const ref = generateGoCredentialsRef("Comercial Volvo", [], "abc");
    expect(ref).toBe("WA_EVO_GO_COMERCIAL_VOLVO_ABC");
    expect(isValidCredentialsRef(ref)).toBe(true);
  });

  it("uppercases a lowercase suffix and strips diacritics/spaces from the label", () => {
    const ref = generateGoCredentialsRef("Atenção Manutenção", [], "x9z");
    expect(ref).toBe("WA_EVO_GO_ATENCAO_MANUTENCAO_X9Z");
    expect(isValidCredentialsRef(ref)).toBe(true);
  });

  it("falls back to INSTANCIA when the label has no alphanumerics", () => {
    expect(generateGoCredentialsRef("!!!", [], "q2")).toBe("WA_EVO_GO_INSTANCIA_Q2");
  });

  it("avoids collisions with existing refs by appending a counter", () => {
    const existing = ["WA_EVO_GO_LOJA_AB"];
    const ref = generateGoCredentialsRef("Loja", existing, "ab");
    expect(ref).toBe("WA_EVO_GO_LOJA_AB_1");
    expect(existing).not.toContain(ref);
    expect(isValidCredentialsRef(ref)).toBe(true);
  });
});
