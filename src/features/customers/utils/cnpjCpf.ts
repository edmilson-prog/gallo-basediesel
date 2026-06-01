/**
 * CNPJ/CPF validators with real check-digit (dígito verificador) validation.
 * Both length and the official checksum must pass, so only genuinely valid
 * documents are accepted on input.
 */

export function onlyDigits(value: string): string {
  return (value ?? "").replace(/\D/g, "");
}

/**
 * CPF validator — length, non-repeated digits and both check digits.
 * @see https://www.gov.br/receitafederal (módulo 11)
 */
export function isValidCpf(value: string): boolean {
  const digits = onlyDigits(value);
  if (digits.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(digits)) return false;

  const nums = digits.split("").map(Number);
  const checkDigit = (length: number): number => {
    let sum = 0;
    for (let i = 0; i < length; i += 1) {
      sum += (nums[i] ?? 0) * (length + 1 - i);
    }
    const remainder = (sum * 10) % 11;
    return remainder === 10 ? 0 : remainder;
  };

  return checkDigit(9) === nums[9] && checkDigit(10) === nums[10];
}

/**
 * CNPJ validator — length, non-repeated digits and both check digits.
 * @see https://www.gov.br/receitafederal (módulo 11)
 */
export function isValidCnpj(value: string): boolean {
  const digits = onlyDigits(value);
  if (digits.length !== 14) return false;
  if (/^(\d)\1{13}$/.test(digits)) return false;

  const nums = digits.split("").map(Number);
  const checkDigit = (length: number): number => {
    // Weights cycle 2..9 from right to left over the first `length` digits.
    let sum = 0;
    let weight = 2;
    for (let i = length - 1; i >= 0; i -= 1) {
      sum += (nums[i] ?? 0) * weight;
      weight = weight === 9 ? 2 : weight + 1;
    }
    const remainder = sum % 11;
    return remainder < 2 ? 0 : 11 - remainder;
  };

  return checkDigit(12) === nums[12] && checkDigit(13) === nums[13];
}

export function formatCpf(value: string): string {
  const d = onlyDigits(value).slice(0, 11);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`;
  if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

export function formatCnpj(value: string): string {
  const d = onlyDigits(value).slice(0, 14);
  if (d.length <= 2) return d;
  if (d.length <= 5) return `${d.slice(0, 2)}.${d.slice(2)}`;
  if (d.length <= 8) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5)}`;
  if (d.length <= 12) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8)}`;
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}

export function formatPhone(value: string): string {
  const d = onlyDigits(value).slice(0, 11);
  if (d.length <= 2) return d;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

export function isValidPhone(value: string): boolean {
  const d = onlyDigits(value);
  return d.length >= 10 && d.length <= 11;
}
