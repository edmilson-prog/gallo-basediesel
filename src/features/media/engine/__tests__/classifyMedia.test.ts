import { describe, expect, it } from "vitest";
import { classifyMedia } from "../classifyMedia";

describe("classifyMedia", () => {
  it("classifies a nota fiscal by filename", () => {
    expect(classifyMedia({ kind: "document", mimeType: "application/pdf", fileName: "nf-55321.pdf" })).toBe(
      "nota_fiscal",
    );
    expect(
      classifyMedia({ kind: "document", mimeType: "application/pdf", fileName: "danfe-12090.pdf" }),
    ).toBe("nota_fiscal");
  });
  it("classifies a comprovante by filename or ocr", () => {
    expect(
      classifyMedia({ kind: "image", mimeType: "image/jpeg", fileName: "comprovante-pix.jpg" }),
    ).toBe("comprovante");
    expect(
      classifyMedia({ kind: "image", mimeType: "image/jpeg", ocrText: "COMPROVANTE DE TRANSFERÊNCIA" }),
    ).toBe("comprovante");
  });
  it("classifies chassi/placa by ocr marker", () => {
    expect(classifyMedia({ kind: "image", mimeType: "image/jpeg", ocrText: "CHASSI 9BWZZZ PLACA IOR1234" })).toBe(
      "chassi_placa",
    );
  });
  it("classifies a catalogo pdf", () => {
    expect(
      classifyMedia({ kind: "document", mimeType: "application/pdf", fileName: "catalogo-bosch.pdf" }),
    ).toBe("catalogo");
  });
  it("uses the explicit mock marker when present", () => {
    expect(
      classifyMedia({ kind: "image", mimeType: "image/jpeg", fileName: "x.jpg", mockMarker: "peca" }),
    ).toBe("peca");
  });
  it("defaults an unmarked image to peca and an unmarked document to outro", () => {
    expect(classifyMedia({ kind: "image", mimeType: "image/jpeg", fileName: "foto.jpg" })).toBe("peca");
    expect(classifyMedia({ kind: "document", mimeType: "application/pdf", fileName: "x.pdf" })).toBe(
      "outro",
    );
  });
});
