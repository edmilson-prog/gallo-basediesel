import type { ISeededContext } from "./seededRandom";

/**
 * Generate a syntactically valid Brazilian CNPJ (14 digits).
 * The digits pass the standard check-digit algorithm but the document does NOT
 * map to any real company — it is a math artifact, nothing more.
 */
export function randomCNPJ(ctx: ISeededContext): string {
  const base = Array.from({ length: 12 }, () => ctx.int(0, 9));
  base[8] = 0;
  base[9] = 0;
  base[10] = 0;
  base[11] = 1;
  const d1 = cnpjCheckDigit(base);
  const d2 = cnpjCheckDigit([...base, d1]);
  const digits = [...base, d1, d2].join("");
  return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12)}`;
}

/**
 * Generate a syntactically valid Brazilian CPF (11 digits).
 * Same caveat as {@link randomCNPJ}: math-valid, fictitious.
 */
export function randomCPF(ctx: ISeededContext): string {
  const base = Array.from({ length: 9 }, () => ctx.int(0, 9));
  const d1 = cpfCheckDigit(base, 10);
  const d2 = cpfCheckDigit([...base, d1], 11);
  const digits = [...base, d1, d2].join("");
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
}

function cnpjCheckDigit(digits: number[]): number {
  const weights =
    digits.length === 12
      ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
      : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const sum = digits.reduce((acc, d, i) => acc + d * weights[i], 0);
  const rest = sum % 11;
  return rest < 2 ? 0 : 11 - rest;
}

function cpfCheckDigit(digits: number[], startWeight: number): number {
  let weight = startWeight;
  const sum = digits.reduce((acc, d) => {
    const value = acc + d * weight;
    weight -= 1;
    return value;
  }, 0);
  const rest = (sum * 10) % 11;
  return rest === 10 ? 0 : rest;
}

/** Brazilian mobile phone with DDD, e.g. `(55) 99876-5432`. */
export function randomPhone(ctx: ISeededContext): string {
  const ddd = ctx.int(11, 99);
  const first = 9;
  const block1 = String(ctx.int(1000, 9999));
  const block2 = String(ctx.int(1000, 9999));
  return `(${ddd}) ${first}${block1.slice(0, 4)}-${block2}`;
}
