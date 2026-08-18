import { describe, expect, it } from "vitest";
import { buildSurveyMessage, buildSurveyUrl, firstNameOf } from "./message";

describe("buildSurveyUrl", () => {
  it("builds the public landing URL", () => {
    expect(buildSurveyUrl("https://crm.gallobasediesel.com.br", "abc123")).toBe(
      "https://crm.gallobasediesel.com.br/pesquisa/abc123",
    );
  });

  it("tolerates a trailing slash in the configured base URL", () => {
    expect(buildSurveyUrl("https://crm.gallobasediesel.com.br/", "abc123")).toBe(
      "https://crm.gallobasediesel.com.br/pesquisa/abc123",
    );
  });
});

describe("firstNameOf", () => {
  it("keeps only the first name", () => {
    expect(firstNameOf("João Carlos da Silva")).toBe("João");
  });

  it("returns empty for a missing name", () => {
    expect(firstNameOf(null)).toBe("");
    expect(firstNameOf("   ")).toBe("");
  });
});

describe("buildSurveyMessage", () => {
  it("greets by first name and carries the link", () => {
    const message = buildSurveyMessage("João", "https://crm.gallobasediesel.com.br/pesquisa/abc");
    expect(message).toContain("Oi, João!");
    expect(message).toContain("https://crm.gallobasediesel.com.br/pesquisa/abc");
    expect(message).toContain("de 0 a 10");
  });

  it("falls back to a neutral greeting when the name is missing", () => {
    const message = buildSurveyMessage("   ", "https://x/y");
    expect(message).toContain("Oi!");
    expect(message).not.toContain("Oi, !");
  });
});
