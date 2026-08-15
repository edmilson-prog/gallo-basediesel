// src/features/quotes/utils/bulkPaste.ts
import type { IPart } from "@/shared/types";

export interface IBulkPasteLine {
  /** Raw code as typed by the customer — SKU or OEM. */
  code: string;
  /** Quantity requested; defaults to 1 when absent or unparseable. */
  quantity: number;
}

export interface IBulkPasteResolution {
  matched: { part: IPart; quantity: number }[];
  /** Codes that matched no part, in input order and de-duplicated. */
  unmatched: string[];
}

/**
 * Parse a pasted list into `{ code, quantity }` rows. One item per line,
 * separated by `;`, `,` or tab. Blank lines are skipped; a missing or invalid
 * quantity falls back to 1 so a bare list of codes still works.
 */
export function parseBulkPasteLines(text: string): IBulkPasteLine[] {
  const out: IBulkPasteLine[] = [];
  for (const rawLine of String(text).split("\n")) {
    const line = rawLine.trim();
    if (!line) continue;
    const [rawCode, rawQty] = line.split(/[;,\t]/);
    const code = (rawCode ?? "").trim();
    if (!code) continue;
    const parsed = Number.parseInt((rawQty ?? "").trim(), 10);
    out.push({ code, quantity: Number.isFinite(parsed) && parsed > 0 ? parsed : 1 });
  }
  return out;
}

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

/**
 * Resolve parsed lines against the catalog, matching on SKU first and then on
 * any OEM code. Repeated codes are summed into a single entry so the caller
 * adds each part once.
 */
export function resolveBulkPaste(lines: IBulkPasteLine[], parts: IPart[]): IBulkPasteResolution {
  const bySku = new Map<string, IPart>();
  const byOem = new Map<string, IPart>();
  for (const part of parts) {
    const sku = normalize(part.sku);
    if (sku && !bySku.has(sku)) bySku.set(sku, part);
    for (const oem of part.oemCodes ?? []) {
      const key = normalize(oem);
      if (key && !byOem.has(key)) byOem.set(key, part);
    }
  }

  const quantityByPartId = new Map<string, { part: IPart; quantity: number }>();
  const unmatched: string[] = [];
  const seenUnmatched = new Set<string>();

  for (const { code, quantity } of lines) {
    const key = normalize(code);
    const part = bySku.get(key) ?? byOem.get(key);
    if (!part) {
      if (!seenUnmatched.has(key)) {
        seenUnmatched.add(key);
        unmatched.push(code);
      }
      continue;
    }
    const entry = quantityByPartId.get(part.id);
    if (entry) entry.quantity += quantity;
    else quantityByPartId.set(part.id, { part, quantity });
  }

  return { matched: Array.from(quantityByPartId.values()), unmatched };
}
