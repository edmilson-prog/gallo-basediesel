export interface AmbiguousCandidate {
  codcli: string;
  ltv: number;
}

/**
 * When one platform phone number matches more than one DINTEC CODCLI
 * (person + their own company sharing a cell phone is the common case),
 * the existing platform customer links to whichever CODCLI has the
 * largest purchase history — the more likely primary commercial
 * relationship. Losing candidates are NOT discarded by this function;
 * the caller (Task 8) imports them as separate, unlinked new customers.
 */
export function pickBestCodcliByLtv(candidates: AmbiguousCandidate[]): string {
  if (candidates.length === 0) {
    throw new Error("pickBestCodcliByLtv: candidates vazio");
  }
  return candidates.reduce((best, current) => (current.ltv > best.ltv ? current : best)).codcli;
}
