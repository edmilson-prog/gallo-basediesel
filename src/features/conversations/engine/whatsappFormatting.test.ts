import { describe, it, expect } from "vitest";
import { parseWhatsAppFormatting } from "./whatsappFormatting";

describe("parseWhatsAppFormatting", () => {
  it("returns a single plain segment when there is no markup", () => {
    expect(parseWhatsAppFormatting("Bom dia")).toEqual([{ text: "Bom dia", styles: [] }]);
  });

  it("parses the attendant signature as bold + plain (the reported bug)", () => {
    expect(parseWhatsAppFormatting("*Edmilson Souza:* Olá")).toEqual([
      { text: "Edmilson Souza:", styles: ["bold"] },
      { text: " Olá", styles: [] },
    ]);
  });

  it("parses italic and strike", () => {
    expect(parseWhatsAppFormatting("_oi_")).toEqual([{ text: "oi", styles: ["italic"] }]);
    expect(parseWhatsAppFormatting("~não~")).toEqual([{ text: "não", styles: ["strike"] }]);
  });

  it("parses nested styles", () => {
    expect(parseWhatsAppFormatting("*_bi_*")).toEqual([{ text: "bi", styles: ["bold", "italic"] }]);
  });

  it("leaves stray markers literal (spaces around / no closing)", () => {
    expect(parseWhatsAppFormatting("2 * 3 = 6")).toEqual([{ text: "2 * 3 = 6", styles: [] }]);
    expect(parseWhatsAppFormatting("*foo")).toEqual([{ text: "*foo", styles: [] }]);
  });

  it("handles an empty string", () => {
    expect(parseWhatsAppFormatting("")).toEqual([]);
  });

  it("keeps surrounding plain text around a bold span", () => {
    expect(parseWhatsAppFormatting("oi *bold* tchau")).toEqual([
      { text: "oi ", styles: [] },
      { text: "bold", styles: ["bold"] },
      { text: " tchau", styles: [] },
    ]);
  });
});
