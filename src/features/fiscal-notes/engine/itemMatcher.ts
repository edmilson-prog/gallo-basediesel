import type { ID, ItemLinkMode } from "@/shared/types";

/**
 * Cascata determinística de sugestão de vínculo item ↔ catálogo
 * (PRD-216, RS-01).
 *
 * A ordem é a do PRD e importa: código já mapeado vence EAN, EAN vence
 * descrição. Cada degrau devolve a EVIDÊNCIA escrita que a gaveta de
 * conferência mostra — sugestão sem evidência é adivinhação, e o conferente
 * não tem como julgar.
 *
 * O que sai daqui como `pend` é o único material que vai ao LLM (RS-02).
 */

export interface IMatchCandidate {
  partId: ID;
  sku: string;
  name: string;
  ncm?: string;
  ean?: string;
}

export interface IMatchInput {
  supplierCode: string;
  description: string;
  ncm?: string;
  ean?: string;
  /** Vínculo já aprendido para este `supplierCode` neste fornecedor. */
  mappedPartId?: ID;
}

export interface IMatchResult {
  mode: ItemLinkMode;
  partId: ID | null;
  /** 0–100. `null` quando o vínculo é certo (código mapeado) ou inexistente. */
  confidence: number | null;
  evidence: string | null;
}

/** Tokens curtos e palavras de ligação não discriminam nada e inflam a interseção. */
const NOISE = new Set(["DE", "DA", "DO", "COM", "SEM", "PARA", "P", "C", "CX", "PCT", "UN", "KIT"]);

export function tokenize(value: string): string[] {
  return (
    value
      .normalize("NFD")
      // Remove os diacríticos combinantes que o NFD separou. Property escape em
      // vez de faixa literal: os caracteres da faixa são invisíveis no diff.
      .replace(/\p{Diacritic}/gu, "")
      .toUpperCase()
      .split(/[^A-Z0-9]+/)
      .filter((token) => token.length > 1 && !NOISE.has(token))
  );
}

/** Jaccard sobre os tokens: interseção dividida pela união. */
function overlap(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  const setA = new Set(a);
  const setB = new Set(b);
  let shared = 0;
  for (const token of setA) if (setB.has(token)) shared++;
  return shared / (setA.size + setB.size - shared);
}

const PENDING: IMatchResult = { mode: "pend", partId: null, confidence: null, evidence: null };

export function matchItem(input: IMatchInput, candidates: IMatchCandidate[]): IMatchResult {
  // 1. Código do fornecedor já mapeado — vínculo direto, sem confiança porque
  //    não é palpite: um humano já confirmou este par numa nota anterior.
  if (input.mappedPartId && candidates.some((c) => c.partId === input.mappedPartId)) {
    return {
      mode: "auto",
      partId: input.mappedPartId,
      confidence: null,
      evidence: `Código ${input.supplierCode} já mapeado para este fornecedor`,
    };
  }

  if (candidates.length === 0) return PENDING;

  // 2. EAN idêntico.
  if (input.ean) {
    const byEan = candidates.find((c) => c.ean && c.ean === input.ean);
    if (byEan) {
      return {
        mode: "ia",
        partId: byEan.partId,
        confidence: 97,
        evidence: "EAN idêntico ao do cadastro",
      };
    }
  }

  // 3/4. Descrição, com e sem NCM igual.
  const itemTokens = tokenize(input.description);
  let best: { candidate: IMatchCandidate; score: number } | null = null;
  for (const candidate of candidates) {
    const score = overlap(itemTokens, tokenize(candidate.name));
    if (!best || score > best.score) best = { candidate, score };
  }
  if (!best || best.score < 0.34) return PENDING;

  const sameNcm = Boolean(input.ncm && best.candidate.ncm && input.ncm === best.candidate.ncm);
  // Faixas do PRD: 80–94 com NCM igual, 60–79 sem.
  const floor = sameNcm ? 80 : 60;
  const confidence = Math.min(sameNcm ? 94 : 79, Math.round(floor + best.score * 14));

  return {
    mode: "ia",
    partId: best.candidate.partId,
    confidence,
    evidence: sameNcm
      ? `Descrição compatível com ${best.candidate.sku} e NCM igual ao do cadastro`
      : `Descrição compatível com ${best.candidate.sku} — NCM difere do cadastro`,
  };
}
