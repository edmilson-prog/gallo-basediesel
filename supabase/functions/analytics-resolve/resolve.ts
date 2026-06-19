/**
 * Pure helpers for the analytics-resolve Edge Function. Runtime-agnostic:
 * NO Deno imports — unit-testable under Vitest. Builds the LLM prompt and
 * validates the model's JSON output against the provided catalog digest.
 */

export interface ResolveDigest {
  catalog: Array<{ id: string; label: string; description: string; supportedFilters: string[] }>;
  brands: string[];
  categories: string[];
}

export interface ResolvedQuery {
  metricId: string;
  filters: Record<string, string>;
  comparison?: "previous_period" | "previous_year";
}

const MAX_QUERIES = 4;
const COMPARISONS = new Set(["previous_period", "previous_year"]);
const LLM_FILTER_KEYS = new Set(["marca", "categoria"]);

export function buildResolvePrompt(question: string, digest: ResolveDigest): string {
  const metrics = digest.catalog
    .map(
      (m) =>
        `- ${m.id}: ${m.label} — ${m.description} (filtros: ${m.supportedFilters.join(", ") || "nenhum"})`,
    )
    .join("\n");
  return [
    "Você classifica perguntas de gestão comercial em métricas de um catálogo fechado.",
    "Métricas disponíveis (use o id EXATO):",
    metrics,
    `Marcas reconhecidas: ${digest.brands.join(", ")}.`,
    `Categorias reconhecidas: ${digest.categories.join(", ")}.`,
    "",
    `Pergunta do usuário: "${question}"`,
    "",
    'Responda APENAS com JSON no formato {"queries":[{"metricId":"<id>","filters":{"marca":"<marca?>","categoria":"<categoria?>"},"comparison":"previous_period|previous_year (opcional)"}]}.',
    "Use só ids/marcas/categorias da lista. Inclua uma entrada por métrica pedida (pode haver mais de uma).",
    'Omita filtros que não se aplicam. Se nada casar, responda {"queries":[]}. Não escreva texto fora do JSON.',
  ].join("\n");
}

/** Extracts the first JSON object from a model response (tolerates code fences / prose). */
export function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const raw = fenced ? fenced[1]! : text;
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) return null;
  try {
    return JSON.parse(raw.slice(start, end + 1));
  } catch {
    return null;
  }
}

export function validateQueries(parsed: unknown, digest: ResolveDigest): ResolvedQuery[] {
  const ids = new Set(digest.catalog.map((m) => m.id));
  const filtersByMetric = new Map(digest.catalog.map((m) => [m.id, new Set(m.supportedFilters)]));
  const brands = new Set(digest.brands);
  const categories = new Set(digest.categories);
  const arr = (parsed as { queries?: unknown } | null)?.queries;
  if (!Array.isArray(arr)) return [];

  const out: ResolvedQuery[] = [];
  const seen = new Set<string>();
  for (const item of arr) {
    if (out.length >= MAX_QUERIES) break;
    if (!item || typeof item !== "object") continue;
    const rec = item as Record<string, unknown>;
    const metricId = String(rec.metricId ?? "");
    if (!ids.has(metricId)) continue;
    const supported = filtersByMetric.get(metricId)!;

    const filters: Record<string, string> = {};
    const rawFilters = rec.filters;
    if (rawFilters && typeof rawFilters === "object") {
      for (const [k, v] of Object.entries(rawFilters as Record<string, unknown>)) {
        if (!LLM_FILTER_KEYS.has(k) || !supported.has(k)) continue;
        const val = String(v ?? "").trim();
        if (!val) continue;
        if (k === "marca" && !brands.has(val)) continue;
        if (k === "categoria" && !categories.has(val)) continue;
        filters[k] = val;
      }
    }

    const cmpRaw = rec.comparison;
    const comparison =
      typeof cmpRaw === "string" && COMPARISONS.has(cmpRaw)
        ? (cmpRaw as ResolvedQuery["comparison"])
        : undefined;

    const key = `${metricId}|${JSON.stringify(filters)}|${comparison ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ metricId, filters, ...(comparison ? { comparison } : {}) });
  }
  return out;
}
