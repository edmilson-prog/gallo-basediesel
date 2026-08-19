// src/features/quotes/engine/quoteImport.ts
import type { ID } from "@/shared/types";

/**
 * Reading a customer's list into quote lines.
 *
 * Two passes, in this order:
 *
 *  1. **Deterministic** (here): a code that matches a SKU or an OEM is a fact,
 *     not a guess — it costs nothing and cannot be argued with. Names are
 *     scored against the catalog and either resolve or are handed over.
 *  2. **The model** (`api/interpretQuoteImport`): only what pass 1 left open.
 *     Its answers are ids to be *resolved against the catalog* — an id nobody
 *     has is dropped, and prices always come from the catalog, never from the
 *     model. It may not overwrite an exact code match.
 *
 * Nothing here enters the quote on its own: the panel shows what was
 * understood and the seller confirms.
 */

/** The catalog fields this engine needs — `IPart` satisfies it structurally. */
export interface IImportCatalogPart {
  id: ID;
  sku: string;
  oemCodes: string[];
  name: string;
  brand: string;
  unitPrice: number;
}

export type ImportConfidence = "exact" | "probable" | "ambiguous" | "unmatched";

export interface IImportLine {
  /** Stable key for React and for the checked/price maps. */
  key: string;
  /** The customer's own wording, shown as «...» in the review. */
  raw: string;
  quantity: number;
  /** Resolved part, when there is one. */
  partId?: ID;
  /** Choices offered when the line is ambiguous. */
  candidateIds: ID[];
  confidence: ImportConfidence;
}

/** What the model returns per line, already parsed. */
export interface IImportSuggestion {
  index: number;
  partId?: string;
  candidateIds?: string[];
}

export interface IImportSelection {
  catalog: { partId: ID; quantity: number }[];
  free: { name: string; quantity: number; unitPrice: number }[];
}

/** Openings that are conversation, not items. */
const GREETING =
  /^(bom dia|boa tarde|boa noite|ola\b|olá\b|oi\b|segue|preciso|favor|obrigad|atenciosamente|abraco|abraço)/i;

const STOP_WORDS = new Set([
  "de",
  "do",
  "da",
  "dos",
  "das",
  "um",
  "uma",
  "para",
  "pra",
  "com",
  "e",
  "o",
  "a",
  "os",
  "as",
  "no",
  "na",
  "ao",
  "litros",
  "litro",
  "unidades",
  "unidade",
  "un",
  "und",
  "pecas",
  "peca",
  "peças",
  "peça",
  "x",
]);

/** Lowercase, unaccented — the shape used for every comparison here. */
function normalize(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

/** Only letters and digits: `WK 940/46` and `wk94046` must meet. */
function codeShape(value: string): string {
  return normalize(value).replace(/[^a-z0-9]/g, "");
}

function parseQuantity(tokens: string[]): number {
  for (const token of tokens) {
    if (/^\d{1,3}$/.test(token)) return Math.max(1, parseInt(token, 10));
  }
  return 1;
}

function matchByCode(tokens: string[], catalog: IImportCatalogPart[]): IImportCatalogPart | null {
  const codes = tokens.map(codeShape).filter((t) => t.length >= 6);
  for (const code of codes) {
    const hit = catalog.find(
      (part) =>
        codeShape(part.sku) === code || part.oemCodes.some((oem) => codeShape(oem) === code),
    );
    if (hit) return hit;
  }
  return null;
}

/** Parts scored by how many of the line's words they carry. */
function scoreByWords(
  tokens: string[],
  catalog: IImportCatalogPart[],
): { part: IImportCatalogPart; score: number }[] {
  const words = tokens.filter(
    (token) => !/^\d+$/.test(token) && token.length >= 3 && !STOP_WORDS.has(token),
  );
  if (words.length === 0) return [];
  return catalog
    .map((part) => {
      const haystack = normalize(`${part.name} ${part.brand}`);
      let score = 0;
      for (const word of words) {
        // Portuguese plurals: "bicos" should still find "bico".
        const forms = [word, word.replace(/s$/, ""), word.replace(/es$/, "")];
        if (forms.some((form) => form.length >= 3 && haystack.includes(form))) score += 1;
      }
      return { part, score };
    })
    .filter((entry) => entry.score >= 2)
    .sort((a, b) => b.score - a.score);
}

/**
 * Pass 1. Splits the text into lines and resolves what it can on its own.
 */
export function interpretImportText(text: string, catalog: IImportCatalogPart[]): IImportLine[] {
  const lines: IImportLine[] = [];
  const rawLines = String(text)
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  rawLines.forEach((raw, index) => {
    const cleaned = normalize(raw).replace(/[,;:.!?()«»"']/g, " ");
    if (GREETING.test(cleaned.trim()) || /:$/.test(raw)) return;
    const tokens = cleaned.split(/\s+/).filter(Boolean);
    if (tokens.length === 0) return;

    const key = `import-${index}`;
    const quantity = parseQuantity(tokens);

    // A code is checked BEFORE the "has letters" filter: a bare `0445120212`,
    // or the `SKU; qtd` paste, is all digits and is still a real request.
    const byCode = matchByCode(tokens, catalog);
    if (byCode) {
      lines.push({ key, raw, quantity, partId: byCode.id, candidateIds: [], confidence: "exact" });
      return;
    }
    // Whatever is left with no letters is a stray number — a total, a price, a
    // row index from a spreadsheet — not something to quote.
    if (!/[a-z]/.test(cleaned)) return;

    const scored = scoreByWords(tokens, catalog);
    if (scored.length === 0) {
      lines.push({ key, raw, quantity, candidateIds: [], confidence: "unmatched" });
      return;
    }
    const top = scored[0]!.score;
    const tied = scored.filter((entry) => entry.score === top);
    if (tied.length > 1) {
      lines.push({
        key,
        raw,
        quantity,
        candidateIds: tied.slice(0, 3).map((entry) => entry.part.id),
        confidence: "ambiguous",
      });
      return;
    }
    lines.push({
      key,
      raw,
      quantity,
      partId: scored[0]!.part.id,
      candidateIds: [],
      confidence: "probable",
    });
  });

  return lines;
}

/**
 * Pass 2. Folds the model's answers into the lines it was asked about — and
 * only those: an exact code match is never overwritten, and an id the catalog
 * does not have is discarded.
 */
export function applyLlmSuggestions(
  lines: IImportLine[],
  suggestions: IImportSuggestion[],
  catalog: IImportCatalogPart[],
): IImportLine[] {
  const byId = new Map(catalog.map((part) => [part.id, part] as const));
  const byIndex = new Map(suggestions.map((s) => [s.index, s] as const));

  return lines.map((line, index) => {
    const suggestion = byIndex.get(index);
    if (!suggestion || line.confidence === "exact") return line;

    if (suggestion.partId && byId.has(suggestion.partId)) {
      return { ...line, partId: suggestion.partId, candidateIds: [], confidence: "probable" };
    }
    const candidateIds = (suggestion.candidateIds ?? []).filter((id) => byId.has(id));
    if (candidateIds.length > 0) {
      return { ...line, partId: undefined, candidateIds, confidence: "ambiguous" };
    }
    return line;
  });
}

/** Strips the leading quantity so the off-catalog line reads as a description. */
function descriptionOf(raw: string): string {
  return raw.replace(/^\s*\d+\s*[xX]?\s*/, "").trim() || raw.trim();
}

/** Accepts `1.234,56` and `1234.56` alike; anything unreadable is zero. */
function parsePrice(value: string): number {
  const cleaned = String(value).replace(/[^\d.,-]/g, "");
  const normalized = cleaned.includes(",") ? cleaned.replace(/\./g, "").replace(",", ".") : cleaned;
  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed * 100) / 100 : 0;
}

/**
 * What the seller confirmed, split into catalog lines and off-catalog ones.
 * Catalog prices are never carried here — the caller reads them from the part,
 * so an import can never introduce a price nobody set.
 */
export function buildImportSelection(
  lines: IImportLine[],
  checked: Record<string, boolean>,
  prices: Record<string, string>,
  catalog: IImportCatalogPart[],
): IImportSelection {
  const byId = new Map(catalog.map((part) => [part.id, part] as const));
  const selection: IImportSelection = { catalog: [], free: [] };

  for (const line of lines) {
    if (!checked[line.key]) continue;
    if (line.partId && byId.has(line.partId)) {
      selection.catalog.push({ partId: line.partId, quantity: line.quantity });
      continue;
    }
    const unitPrice = parsePrice(prices[line.key] ?? "");
    if (unitPrice > 0) {
      selection.free.push({ name: descriptionOf(line.raw), quantity: line.quantity, unitPrice });
    }
  }
  return selection;
}

/**
 * The slice of catalog worth showing the model for one line. The whole catalog
 * does not fit in a prompt, so the line's own words pick the neighbourhood;
 * when nothing scores, the head of the catalog goes as a floor so the model
 * still has something concrete to reject.
 */
export function shortlistForLine(
  raw: string,
  catalog: IImportCatalogPart[],
  limit = 12,
): IImportCatalogPart[] {
  const tokens = normalize(raw)
    .replace(/[,;:.!?()«»"']/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  const scored = scoreByWords(tokens, catalog).map((entry) => entry.part);
  if (scored.length >= limit) return scored.slice(0, limit);
  const rest = catalog.filter((part) => !scored.includes(part));
  return [...scored, ...rest].slice(0, limit);
}
