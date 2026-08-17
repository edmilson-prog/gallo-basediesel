import { getSupabaseClient } from "@/shared/lib/supabase";
import type { IMatchCandidate, IMatchResult } from "../engine/itemMatcher";

/**
 * Fallback de LLM para a sugestão de vínculo (PRD-216, RS-02).
 *
 * Só recebe o item que a cascata determinística deixou em `pend`. Reusa a
 * `AiFeatureKey` `part_identification` — identificar peça a partir de uma
 * descrição de fornecedor é exatamente isso — e a Edge Function `ai-generate`
 * que já existe.
 *
 * Devolve `null` sempre que não houver resposta utilizável: IA desligada, sem
 * chave no Vault, rede fora, JSON malformado ou SKU inexistente. O chamador
 * mantém o item em `pend` e o humano resolve (CA-11).
 */

export interface ISuggestPartLinkInput {
  supplierCode: string;
  description: string;
  ncm?: string;
  candidates: IMatchCandidate[];
}

interface IAiSuggestion {
  partId?: string;
  confidence?: number;
  evidence?: string;
}

/** Recorte do catálogo enviado ao modelo. Prompt inteiro com 4 mil peças não cabe. */
const MAX_CANDIDATES = 60;

function shortlist(input: ISuggestPartLinkInput): IMatchCandidate[] {
  const sameNcm = input.ncm
    ? input.candidates.filter((candidate) => candidate.ncm === input.ncm)
    : [];
  // NCM igual primeiro: é o sinal mais barato de parentesco fiscal.
  const rest = input.candidates.filter((candidate) => !sameNcm.includes(candidate));
  return [...sameNcm, ...rest].slice(0, MAX_CANDIDATES);
}

export async function suggestPartLinkWithLlm(
  input: ISuggestPartLinkInput,
): Promise<IMatchResult | null> {
  const candidates = shortlist(input);
  if (candidates.length === 0) return null;

  const prompt = [
    "Você recebe a descrição de um item de nota fiscal de entrada e um recorte do catálogo.",
    'Responda APENAS com JSON: {"partId": string|null, "confidence": number, "evidence": string}.',
    "Use partId null quando não houver correspondência clara. Nunca invente um id.",
    "A evidência deve citar o que casou (referência, medida, aplicação), em português.",
    "",
    `Item: ${input.description}`,
    `Código do fornecedor: ${input.supplierCode}`,
    `NCM: ${input.ncm ?? "não informado"}`,
    "",
    "Catálogo:",
    ...candidates.map(
      (c) => `- ${c.partId} | ${c.sku} | ${c.name}${c.ncm ? ` | NCM ${c.ncm}` : ""}`,
    ),
  ].join("\n");

  let raw: string | undefined;
  try {
    const { data, error } = await getSupabaseClient().functions.invoke<{ text?: string }>(
      "ai-generate",
      { body: { feature: "part_identification", prompt } },
    );
    if (error) return null;
    raw = data?.text;
  } catch {
    // Rede fora não pode derrubar a importação inteira.
    return null;
  }
  if (!raw) return null;

  let parsed: IAiSuggestion;
  try {
    const json = raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1);
    parsed = JSON.parse(json) as IAiSuggestion;
  } catch {
    return null;
  }

  // O modelo pode devolver um id que não existe. SKU alucinado é RECUSADO, não
  // corrigido — vincular a peça errada é pior que deixar o item pendente.
  const match = candidates.find((candidate) => candidate.partId === parsed.partId);
  if (!match) return null;

  const confidence = Math.max(1, Math.min(95, Math.round(parsed.confidence ?? 50)));

  return {
    mode: "ia",
    partId: match.partId,
    confidence,
    evidence: parsed.evidence?.trim() || `Sugerido pelo modelo a partir da descrição`,
  };
}
