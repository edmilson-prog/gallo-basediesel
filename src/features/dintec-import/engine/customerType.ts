export type DintecCustomerType = "B2B" | "B2C";

/**
 * DINTEC has 1 client (of 3,167) with both CPF and CNPJ filled and 7 with
 * neither. CNPJ wins the conflict case (business relationship is the
 * primary one in that record); the no-document case defaults to B2C so the
 * customer is still importable without a document.
 */
export function resolveCustomerType(
  cpf: string | null,
  cnpj: string | null,
): DintecCustomerType {
  if (cnpj) return "B2B";
  if (cpf) return "B2C";
  return "B2C";
}
