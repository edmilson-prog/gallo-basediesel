export interface SugestaoNameCandidate {
  nome: string;
  ocorrencias: number;
}

/**
 * The DINTEC screen shows a rich product name ("SENSOR SCANIA 2659850") that
 * lives in the SUGESTAO table, keyed by CODPRO_SUGESTAO — not in PRODUTO. A
 * product can carry more than one spelling there, because the row is written
 * per counter lookup; only 18 of the 1.227 recoverable products disagree with
 * themselves, but the import must be deterministic for all of them.
 *
 * Ranking, in order: most repeated wins (what the counter actually typed most
 * often), then the longest name (the more descriptive of two equally common
 * spellings — "CATALISADOR VOLVO FH" beats "CATALISADOR"), then alphabetical
 * so the result never depends on row order coming out of the export.
 */
export function pickSugestaoName<T extends SugestaoNameCandidate>(candidates: T[]): T {
  if (candidates.length === 0) {
    throw new Error("pickSugestaoName: candidates vazio");
  }
  return candidates.reduce((best, current) => {
    if (current.ocorrencias !== best.ocorrencias) {
      return current.ocorrencias > best.ocorrencias ? current : best;
    }
    if (current.nome.length !== best.nome.length) {
      return current.nome.length > best.nome.length ? current : best;
    }
    return current.nome < best.nome ? current : best;
  });
}
