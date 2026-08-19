// src/features/quotes/api/interpretQuoteImport.ts
import { getSupabaseClient } from "@/shared/lib/supabase";
import {
  shortlistForLine,
  type IImportCatalogPart,
  type IImportLine,
  type IImportSuggestion,
} from "../engine/quoteImport";

/**
 * The model's pass over the lines the deterministic reader could not settle.
 *
 * Reuses the `ai-generate` Edge Function and its `part_identification` feature
 * — identifying a part from a supplier's free-text description is the same
 * problem the fiscal-note linker already asks it. Nothing new to deploy.
 *
 * Returns `[]` on every failure — AI off, no key in the Vault, network down,
 * malformed JSON. The import then stands on what pass 1 resolved, which is the
 * honest degradation: fewer lines identified, never a wrong one invented.
 */

/** Lines the model is asked about — an exact code match is already settled. */
function pendingIndexes(lines: IImportLine[]): number[] {
  return lines
    .map((line, index) => ({ line, index }))
    .filter(({ line }) => line.confidence !== "exact")
    .map(({ index }) => index);
}

function buildPrompt(
  lines: IImportLine[],
  indexes: number[],
  catalog: IImportCatalogPart[],
): string {
  const blocks = indexes.map((index) => {
    const line = lines[index]!;
    const shortlist = shortlistForLine(line.raw, catalog);
    return [
      `Linha ${index}: «${line.raw}»`,
      ...shortlist.map((part) => `  - ${part.id} | ${part.sku} | ${part.name} | ${part.brand}`),
    ].join("\n");
  });

  return [
    "Você recebe linhas de um pedido escrito por um cliente de autopeças diesel e,",
    "sob cada linha, um recorte do catálogo com id, SKU, nome e marca.",
    "",
    "Para cada linha, responda qual peça do recorte corresponde ao que o cliente pediu.",
    'Responda APENAS com JSON: [{"index": number, "partId": string|null, "candidateIds": string[]}].',
    "Regras:",
    '- Use "partId" quando houver uma correspondência clara.',
    '- Use "candidateIds" (2 ou 3 ids) quando houver empate real entre opções.',
    "- Use partId null e candidateIds [] quando nada do recorte servir. NUNCA invente um id.",
    "- Não repita linhas nem invente índices.",
    "",
    ...blocks,
  ].join("\n");
}

/** Tolerates a model that wraps its JSON in prose or a code fence. */
function extractJsonArray(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = (fenced?.[1] ?? text).trim();
  const start = candidate.indexOf("[");
  const end = candidate.lastIndexOf("]");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(candidate.slice(start, end + 1));
  } catch {
    return null;
  }
}

function toSuggestions(parsed: unknown, valid: Set<number>): IImportSuggestion[] {
  if (!Array.isArray(parsed)) return [];
  const seen = new Set<number>();
  const out: IImportSuggestion[] = [];
  for (const entry of parsed) {
    if (typeof entry !== "object" || entry === null) continue;
    const record = entry as Record<string, unknown>;
    const index = Number(record.index);
    if (!Number.isInteger(index) || !valid.has(index) || seen.has(index)) continue;
    seen.add(index);
    const partId = typeof record.partId === "string" ? record.partId : undefined;
    const candidateIds = Array.isArray(record.candidateIds)
      ? record.candidateIds.filter((id): id is string => typeof id === "string")
      : undefined;
    out.push({ index, partId, candidateIds });
  }
  return out;
}

export async function interpretQuoteImport(
  lines: IImportLine[],
  catalog: IImportCatalogPart[],
): Promise<IImportSuggestion[]> {
  const indexes = pendingIndexes(lines);
  if (indexes.length === 0 || catalog.length === 0) return [];

  try {
    const { data, error } = await getSupabaseClient().functions.invoke<{ text?: string }>(
      "ai-generate",
      { body: { feature: "part_identification", prompt: buildPrompt(lines, indexes, catalog) } },
    );
    if (error || !data?.text) return [];
    return toSuggestions(extractJsonArray(data.text), new Set(indexes));
  } catch {
    return [];
  }
}
