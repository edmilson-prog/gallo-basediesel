/** Decodes the 5 XML entities Excel actually emits — no general XML unescaping needed. */
function decodeXmlEntities(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

/** Converts a cell reference's column letters (e.g. "AF12" → "AF") to a 0-based column index. */
export function colLettersToIndex(cellRef: string): number {
  const letters = cellRef.match(/^[A-Z]+/)?.[0] ?? "";
  let idx = 0;
  for (const ch of letters) idx = idx * 26 + (ch.charCodeAt(0) - 64);
  return idx - 1;
}

/** Parses `xl/sharedStrings.xml` into the ordered string pool referenced by `t="s"` cells. */
export function parseSharedStrings(xml: string): string[] {
  const siBlocks = xml.match(/<si>[\s\S]*?<\/si>/g) ?? [];
  return siBlocks.map((block) => {
    const texts = [...block.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((m) => decodeXmlEntities(m[1]));
    return texts.join("");
  });
}

/**
 * Parses a worksheet XML (`xl/worksheets/sheetN.xml`) into a grid of cell
 * strings. Each row is padded from column A up to its highest populated
 * column — rows that start past column A (common in these supplier sheets,
 * whose leftmost columns are hidden helper columns) still land at the right
 * index.
 */
export function parseSheetRows(xml: string, sharedStrings: string[]): string[][] {
  const rowBlocks = xml.match(/<row\b[^>]*>[\s\S]*?<\/row>/g) ?? [];
  return rowBlocks.map((rowXml) => {
    const cells = new Map<number, string>();
    let maxCol = -1;
    for (const cellMatch of rowXml.matchAll(/<c\s+([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = cellMatch[1];
      const inner = cellMatch[2] ?? "";
      const ref = attrs.match(/r="([^"]+)"/)?.[1];
      if (!ref) continue;
      const col = colLettersToIndex(ref);
      maxCol = Math.max(maxCol, col);
      const type = attrs.match(/t="([^"]+)"/)?.[1];
      const inlineText = inner.match(/<is>[\s\S]*?<t[^>]*>([\s\S]*?)<\/t>[\s\S]*?<\/is>/)?.[1];
      const value = inner.match(/<v>([\s\S]*?)<\/v>/)?.[1];
      if (inlineText != null) {
        cells.set(col, decodeXmlEntities(inlineText));
      } else if (value == null) {
        cells.set(col, "");
      } else if (type === "s") {
        cells.set(col, sharedStrings[Number(value)] ?? "");
      } else {
        cells.set(col, decodeXmlEntities(value));
      }
    }
    const line: string[] = [];
    for (let i = 0; i <= maxCol; i++) line.push(cells.get(i) ?? "");
    return line;
  });
}

import { readZipEntry } from "./xlsxZip";

/** Loads sheet N (0-based) of a `.xlsx` buffer as a grid of cell strings. */
export function loadXlsxSheet(buf: Buffer, sheetIndex: number): string[][] {
  const sharedXml = readZipEntry(buf, "xl/sharedStrings.xml");
  const shared = sharedXml ? parseSharedStrings(sharedXml.toString("utf8")) : [];
  const sheetXml = readZipEntry(buf, `xl/worksheets/sheet${sheetIndex + 1}.xml`);
  if (!sheetXml) throw new Error(`xl/worksheets/sheet${sheetIndex + 1}.xml não encontrado no .xlsx`);
  return parseSheetRows(sheetXml.toString("utf8"), shared);
}
