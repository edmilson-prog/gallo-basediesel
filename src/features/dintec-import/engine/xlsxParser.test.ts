import { describe, expect, it } from "vitest";
import { colLettersToIndex, parseSharedStrings, parseSheetRows } from "./xlsxParser";

describe("colLettersToIndex", () => {
  it("converts single-letter columns", () => {
    expect(colLettersToIndex("A1")).toBe(0);
    expect(colLettersToIndex("Z1")).toBe(25);
  });

  it("converts double-letter columns", () => {
    expect(colLettersToIndex("AA1")).toBe(26);
    expect(colLettersToIndex("AF1")).toBe(31);
    expect(colLettersToIndex("AL1535")).toBe(37);
  });
});

describe("parseSharedStrings", () => {
  it("extracts plain text entries in order", () => {
    const xml =
      '<?xml version="1.0"?><sst count="3" uniqueCount="3">' +
      "<si><t>Código Comercial</t></si>" +
      "<si><t>Descrição</t></si>" +
      "<si><t>UFI</t></si>" +
      "</sst>";
    expect(parseSharedStrings(xml)).toEqual(["Código Comercial", "Descrição", "UFI"]);
  });

  it("decodes XML entities and joins rich-text runs", () => {
    const xml =
      "<sst>" +
      "<si><t>A &amp; B</t></si>" +
      "<si><r><t>Fiat</t></r><r><t>: Ducato</t></r></si>" +
      "</sst>";
    expect(parseSharedStrings(xml)).toEqual(["A & B", "Fiat: Ducato"]);
  });
});

describe("parseSheetRows", () => {
  const shared = ["Código Comercial", "Descrição", "UFI"];

  it("resolves shared-string cells and leaves empty self-closing cells blank", () => {
    const xml =
      '<sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" s="45"/><c r="C1" t="s"><v>1</v></c></row></sheetData>';
    expect(parseSheetRows(xml, shared)).toEqual([["Código Comercial", "", "Descrição"]]);
  });

  it("reads formula cells by their cached <v>, ignoring the <f> body", () => {
    const xml =
      '<sheetData><row r="2"><c r="A2" s="43"><f>SUBTOTAL(9,A4:A1560)</f><v>302.56</v></c></row></sheetData>';
    expect(parseSheetRows(xml, shared)).toEqual([["302.56"]]);
  });

  it("pads columns that start after A with empty strings", () => {
    const xml =
      '<sheetData><row r="1"><c r="C1" t="s"><v>2</v></c></row></sheetData>';
    expect(parseSheetRows(xml, shared)).toEqual([["", "", "UFI"]]);
  });

  it("handles multiple rows independently", () => {
    const xml =
      '<sheetData>' +
      '<row r="1"><c r="A1" t="s"><v>0</v></c></row>' +
      '<row r="2"><c r="A2" t="s"><v>1</v></c><c r="B2" t="s"><v>2</v></c></row>' +
      "</sheetData>";
    expect(parseSheetRows(xml, shared)).toEqual([
      ["Código Comercial"],
      ["Descrição", "UFI"],
    ]);
  });
});
