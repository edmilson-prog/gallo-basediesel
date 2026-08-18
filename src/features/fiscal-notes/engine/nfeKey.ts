/**
 * Chave de acesso da NF-e (PRD-216, RC-05).
 *
 * 44 dígitos: cUF(2) AAMM(4) CNPJ(14) mod(2) série(3) nNF(9) tpEmis(1)
 * cNF(8) cDV(1). O dígito verificador é módulo 11 com pesos 2..9 ciclando
 * da direita para a esquerda sobre os 43 primeiros dígitos.
 *
 * Sem dependência de DOM — este módulo é espelhado para as Edge Functions.
 */

export interface INfeKeyParts {
  uf: string;
  yearMonth: string;
  cnpj: string;
  model: string;
  series: string;
  number: string;
  emissionType: string;
  code: string;
  checkDigit: string;
}

/** Remove espaços, pontos e traços — a chave é digitada da DANFE em grupos. */
function normalize(key: string): string {
  return key.replace(/[^\d]/g, "");
}

export function computeNfeKeyCheckDigit(first43: string): number {
  let sum = 0;
  let weight = 2;
  for (let i = first43.length - 1; i >= 0; i--) {
    sum += Number(first43[i]) * weight;
    weight = weight === 9 ? 2 : weight + 1;
  }
  const rest = sum % 11;
  return rest === 0 || rest === 1 ? 0 : 11 - rest;
}

export function isValidNfeKey(key: string): boolean {
  const digits = normalize(key);
  if (digits.length !== 44) return false;
  return computeNfeKeyCheckDigit(digits.slice(0, 43)) === Number(digits[43]);
}

export function parseNfeKey(key: string): INfeKeyParts | null {
  if (!isValidNfeKey(key)) return null;
  const d = normalize(key);
  return {
    uf: d.slice(0, 2),
    yearMonth: d.slice(2, 6),
    cnpj: d.slice(6, 20),
    model: d.slice(20, 22),
    series: d.slice(22, 25),
    number: d.slice(25, 34),
    emissionType: d.slice(34, 35),
    code: d.slice(35, 43),
    checkDigit: d.slice(43, 44),
  };
}
