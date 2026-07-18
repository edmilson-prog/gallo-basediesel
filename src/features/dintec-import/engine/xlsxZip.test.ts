import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { readZipEntry } from "./xlsxZip";
import { parseSharedStrings, parseSheetRows } from "./xlsxParser";

const __dirname = dirname(fileURLToPath(import.meta.url));
const UFI_PATH = join(
  __dirname,
  "..",
  "..",
  "..",
  "..",
  "docs",
  "export",
  "2024.11.14 Cotação Turbo Diesel UFI.xlsx",
);

describe("readZipEntry (against the real UFI spreadsheet)", () => {
  it("extracts and decompresses xl/sharedStrings.xml with real column headers", () => {
    const buf = readFileSync(UFI_PATH);
    const entry = readZipEntry(buf, "xl/sharedStrings.xml");
    expect(entry).not.toBeNull();
    const shared = parseSharedStrings(entry!.toString("utf8"));
    expect(shared).toContain("Código Comercial");
    expect(shared).toContain("Descrição");
  });

  it("extracts xl/worksheets/sheet1.xml with the real header row", () => {
    const buf = readFileSync(UFI_PATH);
    const sharedXml = readZipEntry(buf, "xl/sharedStrings.xml")!.toString("utf8");
    const shared = parseSharedStrings(sharedXml);
    const sheetXml = readZipEntry(buf, "xl/worksheets/sheet1.xml")!.toString("utf8");
    const rows = parseSheetRows(sheetXml, shared);
    // Row index 2 (0-based) is the real column-name header in this file.
    expect(rows[2][0]).toBe("Código Comercial");
    expect(rows[2][1]).toBe("Descrição");
  });

  it("returns null for a nonexistent entry", () => {
    const buf = readFileSync(UFI_PATH);
    expect(readZipEntry(buf, "xl/does-not-exist.xml")).toBeNull();
  });
});
